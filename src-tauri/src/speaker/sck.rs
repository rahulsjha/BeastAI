// System-audio capture on macOS via ScreenCaptureKit.
//
// Captures everything the Mac plays (Zoom, Meet, Teams, a browser tab, …), so
// the other people in a call are heard without any virtual audio device
// (no BlackHole). Pluely's own audio is excluded. Needs the macOS
// "Screen & System Audio Recording" permission for the app.
//
// Uses objc2 bindings (pure Rust), so it builds without Xcode or Swift.
// Audio arrives as 48 kHz mono f32 and is pushed into the same ring buffer the
// cpal path uses, so the rest of the Listen pipeline is unchanged.

use anyhow::{anyhow, Result};
use block2::RcBlock;
use dispatch2::DispatchQueue;
use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2::{define_class, msg_send, AllocAnyThread, DefinedClass};
use objc2_core_media::CMSampleBuffer;
use objc2_foundation::{NSArray, NSError, NSObject, NSObjectProtocol};
use objc2_screen_capture_kit::{
    SCContentFilter, SCShareableContent, SCStream, SCStreamConfiguration, SCStreamOutput,
    SCStreamOutputType,
};
use ringbuf::{traits::Producer, HeapProd};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;

pub const SYSTEM_AUDIO_SAMPLE_RATE: u32 = 48_000;

pub struct Sink {
    pub producer: Mutex<HeapProd<f32>>,
    pub wake: Box<dyn Fn() + Send + Sync>,
}

pub struct OutputIvars {
    sink: Arc<Sink>,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[name = "PluelySystemAudioOutput"]
    #[ivars = OutputIvars]
    struct SystemAudioOutput;

    unsafe impl NSObjectProtocol for SystemAudioOutput {}

    unsafe impl SCStreamOutput for SystemAudioOutput {
        #[unsafe(method(stream:didOutputSampleBuffer:ofType:))]
        fn did_output(&self, _stream: &SCStream, sb: &CMSampleBuffer, ty: SCStreamOutputType) {
            if ty != SCStreamOutputType::Audio {
                return;
            }
            // Mono f32 (channelCount = 1), contiguous in the block buffer.
            unsafe {
                let Some(bb) = sb.data_buffer() else { return };
                let mut len: usize = 0;
                let mut ptr: *mut std::ffi::c_char = std::ptr::null_mut();
                if bb.data_pointer(0, std::ptr::null_mut(), &mut len, &mut ptr) != 0 || ptr.is_null() {
                    return;
                }
                let samples = std::slice::from_raw_parts(ptr as *const f32, len / 4);
                let sink = &self.ivars().sink;
                if let Ok(mut p) = sink.producer.lock() {
                    p.push_slice(samples);
                }
                (sink.wake)();
            }
        }
    }
);

impl SystemAudioOutput {
    fn new(sink: Arc<Sink>) -> Retained<Self> {
        let this = Self::alloc().set_ivars(OutputIvars { sink });
        unsafe { msg_send![super(this), init] }
    }
}

fn shareable_content() -> Result<Retained<SCShareableContent>> {
    let (tx, rx) = mpsc::channel::<std::result::Result<Retained<SCShareableContent>, String>>();
    let tx = Mutex::new(Some(tx));
    let handler = RcBlock::new(move |content: *mut SCShareableContent, err: *mut NSError| {
        let r = if !content.is_null() {
            Ok(unsafe { Retained::retain(content) }.expect("non-null"))
        } else if err.is_null() {
            Err("no shareable content".to_string())
        } else {
            Err(unsafe { (*err).localizedDescription() }.to_string())
        };
        if let Some(t) = tx.lock().ok().and_then(|mut g| g.take()) {
            let _ = t.send(r);
        }
    });
    unsafe { SCShareableContent::getShareableContentWithCompletionHandler(&handler) };
    match rx.recv_timeout(Duration::from_secs(10)) {
        Ok(Ok(c)) => Ok(c),
        Ok(Err(e)) => Err(anyhow!(
            "System audio needs Screen & System Audio Recording permission for Pluely ({e})"
        )),
        Err(_) => Err(anyhow!("Timed out waiting for ScreenCaptureKit")),
    }
}

/// Captures system audio until `stop` is set. Blocks the calling thread.
/// Checks that system audio can be captured (permission granted, display present).
pub fn system_audio_available() -> Result<()> {
    let content = shareable_content()?;
    if unsafe { content.displays() }.firstObject().is_none() {
        return Err(anyhow!("No display available for system audio capture"));
    }
    Ok(())
}

pub fn run_system_capture(
    producer: HeapProd<f32>,
    wake: Box<dyn Fn() + Send + Sync>,
    sample_rate: Arc<AtomicU32>,
    stop: Arc<AtomicBool>,
) -> Result<()> {
    let content = shareable_content()?;
    let displays = unsafe { content.displays() };
    let display = displays
        .firstObject()
        .ok_or_else(|| anyhow!("No display available for system audio capture"))?;

    let filter = unsafe {
        SCContentFilter::initWithDisplay_excludingWindows(SCContentFilter::alloc(), &display, &NSArray::new())
    };
    let config = unsafe { SCStreamConfiguration::new() };
    unsafe {
        config.setCapturesAudio(true);
        config.setSampleRate(SYSTEM_AUDIO_SAMPLE_RATE as isize);
        config.setChannelCount(1);
        config.setExcludesCurrentProcessAudio(true);
        // Video is required by the API; keep it tiny.
        config.setWidth(2);
        config.setHeight(2);
    }
    sample_rate.store(SYSTEM_AUDIO_SAMPLE_RATE, Ordering::Release);

    let sink = Arc::new(Sink { producer: Mutex::new(producer), wake });
    let output = SystemAudioOutput::new(sink);
    let stream = unsafe {
        SCStream::initWithFilter_configuration_delegate(SCStream::alloc(), &filter, &config, None)
    };
    let queue = DispatchQueue::new("pluely.system-audio", None);
    unsafe {
        stream.addStreamOutput_type_sampleHandlerQueue_error(
            ProtocolObject::from_ref(&*output),
            SCStreamOutputType::Audio,
            Some(&queue),
        )
    }
    .map_err(|e| anyhow!("Could not add audio output: {}", e.localizedDescription()))?;

    let (started_tx, started_rx) = mpsc::channel::<Option<String>>();
    let started_tx = Mutex::new(Some(started_tx));
    let on_start = RcBlock::new(move |err: *mut NSError| {
        let msg = if err.is_null() { None } else { Some(unsafe { (*err).localizedDescription() }.to_string()) };
        if let Some(t) = started_tx.lock().ok().and_then(|mut g| g.take()) {
            let _ = t.send(msg);
        }
    });
    unsafe { stream.startCaptureWithCompletionHandler(Some(&on_start)) };
    match started_rx.recv_timeout(Duration::from_secs(10)) {
        Ok(None) => tracing::info!("system audio capture started (ScreenCaptureKit)"),
        Ok(Some(e)) => return Err(anyhow!("System audio capture failed to start: {e}")),
        Err(_) => return Err(anyhow!("Timed out starting system audio capture")),
    }

    while !stop.load(Ordering::Acquire) {
        std::thread::sleep(Duration::from_millis(100));
    }
    unsafe { stream.stopCaptureWithCompletionHandler(None) };
    drop(output);
    tracing::info!("system audio capture stopped");
    Ok(())
}
