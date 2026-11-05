// Pluely macOS audio capture — cpal implementation (builds WITHOUT Xcode).
//
// Captures from an audio INPUT device via cpal and exposes it as a
// Stream<Item = f32>, matching the original interface. For "system audio"
// (all remote participants), route system output into a virtual input device
// (e.g. BlackHole) and select it; for your own voice, select the microphone.
// Device enumeration also uses cpal.
//
// The cpal Stream is !Send on macOS, so a dedicated thread builds and owns it
// (never crossing threads); the audio callback pushes samples into a ring
// buffer that the Send-safe SpeakerStream drains.
use super::AudioDevice;
use anyhow::{anyhow, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use futures_util::Stream;
use ringbuf::{
    traits::{Consumer, Producer, Split},
    HeapCons, HeapProd, HeapRb,
};
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Waker};

fn device_list(input: bool) -> Vec<AudioDevice> {
    let host = cpal::default_host();
    let default_name = if input {
        host.default_input_device().and_then(|d| d.name().ok())
    } else {
        host.default_output_device().and_then(|d| d.name().ok())
    };
    let mut out = Vec::new();
    let iter = if input {
        host.input_devices().ok()
    } else {
        host.output_devices().ok()
    };
    if let Some(devices) = iter {
        for d in devices {
            if let Ok(name) = d.name() {
                let is_default = default_name.as_deref() == Some(name.as_str());
                out.push(AudioDevice {
                    id: name.clone(),
                    name,
                    is_default,
                });
            }
        }
    }
    out
}

pub fn get_input_devices() -> Result<Vec<AudioDevice>> {
    Ok(device_list(true))
}

pub fn get_output_devices() -> Result<Vec<AudioDevice>> {
    Ok(device_list(false))
}

struct WakerState {
    waker: Option<Waker>,
}

pub struct SpeakerInput {
    device_id: Option<String>,
}

pub struct SpeakerStream {
    consumer: HeapCons<f32>,
    waker_state: Arc<Mutex<WakerState>>,
    current_sample_rate: Arc<AtomicU32>,
    stop: Arc<AtomicBool>,
}

impl SpeakerStream {
    pub fn sample_rate(&self) -> u32 {
        self.current_sample_rate.load(Ordering::Acquire)
    }
}

impl SpeakerInput {
    pub fn new(device_id: Option<String>) -> Result<Self> {
        Ok(Self { device_id })
    }

    pub fn stream(self) -> SpeakerStream {
        let rb = HeapRb::<f32>::new(16000 * 8); // ~8s at 16kHz, grows as needed
        let (producer, consumer) = rb.split();
        let waker_state = Arc::new(Mutex::new(WakerState { waker: None }));
        let current_sample_rate = Arc::new(AtomicU32::new(16000));
        let stop = Arc::new(AtomicBool::new(false));

        let want = self.device_id.clone();
        let ws = waker_state.clone();
        let sr = current_sample_rate.clone();
        let stop_flag = stop.clone();

        // Listen = the computer's audio (everyone in the call), captured with
        // ScreenCaptureKit — no virtual device needed. If that isn't available
        // (e.g. permission missing), fall back to the selected input device.
        std::thread::spawn(move || {
            match super::sck::system_audio_available() {
                Ok(()) => {
                    let ws2 = ws.clone();
                    let wake: Box<dyn Fn() + Send + Sync> = Box::new(move || wake(&ws2));
                    if let Err(e) = super::sck::run_system_capture(producer, wake, sr, stop_flag) {
                        tracing::error!("system audio capture failed: {e}");
                    }
                }
                Err(e) => {
                    tracing::warn!("system audio unavailable ({e}); falling back to input device");
                    if let Err(e) = run_capture(want, producer, ws, sr, stop_flag) {
                        tracing::error!("cpal capture failed: {e}");
                    }
                }
            }
        });

        SpeakerStream {
            consumer,
            waker_state,
            current_sample_rate,
            stop,
        }
    }
}

fn resolve_input_device(want: &Option<String>) -> Result<cpal::Device> {
    let host = cpal::default_host();
    if let Some(name) = want {
        if !name.is_empty() && name != "default" {
            if let Ok(mut devices) = host.input_devices() {
                if let Some(d) = devices.find(|d| d.name().ok().as_deref() == Some(name.as_str())) {
                    return Ok(d);
                }
            }
        }
    }
    host.default_input_device()
        .ok_or_else(|| anyhow!("no input device available"))
}

fn wake(ws: &Arc<Mutex<WakerState>>) {
    if let Ok(mut guard) = ws.lock() {
        if let Some(w) = guard.waker.take() {
            w.wake();
        }
    }
}

fn run_capture(
    want: Option<String>,
    mut producer: HeapProd<f32>,
    waker_state: Arc<Mutex<WakerState>>,
    current_sample_rate: Arc<AtomicU32>,
    stop: Arc<AtomicBool>,
) -> Result<()> {
    let device = resolve_input_device(&want)?;
    let config = device.default_input_config()?;
    current_sample_rate.store(config.sample_rate().0, Ordering::Release);
    let channels = config.channels() as usize;
    let ws = waker_state.clone();

    let err_fn = |e| tracing::error!("cpal stream error: {e}");

    // Downmix to mono f32 and push into the ring buffer.
    macro_rules! build {
        ($t:ty, $to_f32:expr) => {{
            let ws2 = ws.clone();
            device.build_input_stream(
                &config.clone().into(),
                move |data: &[$t], _: &cpal::InputCallbackInfo| {
                    if channels <= 1 {
                        for &s in data {
                            let _ = producer.try_push($to_f32(s));
                        }
                    } else {
                        for frame in data.chunks(channels) {
                            let mut acc = 0f32;
                            for &s in frame {
                                acc += $to_f32(s);
                            }
                            let _ = producer.try_push(acc / channels as f32);
                        }
                    }
                    wake(&ws2);
                },
                err_fn,
                None,
            )?
        }};
    }

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => build!(f32, |s: f32| s),
        cpal::SampleFormat::I16 => build!(i16, |s: i16| s as f32 / 32768.0),
        cpal::SampleFormat::U16 => build!(u16, |s: u16| (s as f32 - 32768.0) / 32768.0),
        other => return Err(anyhow!("unsupported sample format: {other:?}")),
    };

    stream.play()?;

    // Keep the stream alive on this thread until asked to stop.
    while !stop.load(Ordering::Acquire) {
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    drop(stream);
    Ok(())
}

impl Stream for SpeakerStream {
    type Item = f32;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        if let Some(sample) = self.consumer.try_pop() {
            return Poll::Ready(Some(sample));
        }
        // Register the waker so the audio callback can wake us when data arrives.
        if let Ok(mut guard) = self.waker_state.lock() {
            guard.waker = Some(cx.waker().clone());
        }
        // Re-check after registering to avoid a lost wakeup.
        if let Some(sample) = self.consumer.try_pop() {
            return Poll::Ready(Some(sample));
        }
        Poll::Pending
    }
}

impl Drop for SpeakerStream {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
    }
}
