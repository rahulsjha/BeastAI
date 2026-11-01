// Pluely macOS speaker input — cidre-free stub.
//
// The original implementation uses the `cidre` crate for CoreAudio system-audio
// capture, whose build script requires full Xcode (`xcodebuild`). To allow the
// app to build and run with only the Command Line Tools, this stub provides the
// same public interface with system-audio capture disabled. Mic capture (done
// in the frontend) and all other features are unaffected. The original lives in
// `macos.rs.cidre.bak`; restore it and re-add the `cidre` dependency once Xcode
// is installed to re-enable system-audio capture.
use super::AudioDevice;
use anyhow::Result;
use cpal::traits::{DeviceTrait, HostTrait};
use futures_util::Stream;
use std::pin::Pin;
use std::task::{Context, Poll};

// Device enumeration via cpal (pure Rust, builds without Xcode). Only
// system-audio *capture* (SpeakerInput/stream below) remains disabled, since
// that path needed cidre/CoreAudio.
pub fn get_input_devices() -> Result<Vec<AudioDevice>> {
    let host = cpal::default_host();
    let default_name = host
        .default_input_device()
        .and_then(|d| d.name().ok());
    let mut devices = Vec::new();
    if let Ok(iter) = host.input_devices() {
        for d in iter {
            if let Ok(name) = d.name() {
                let is_default = default_name.as_deref() == Some(name.as_str());
                devices.push(AudioDevice { id: name.clone(), name, is_default });
            }
        }
    }
    Ok(devices)
}

pub fn get_output_devices() -> Result<Vec<AudioDevice>> {
    let host = cpal::default_host();
    let default_name = host
        .default_output_device()
        .and_then(|d| d.name().ok());
    let mut devices = Vec::new();
    if let Ok(iter) = host.output_devices() {
        for d in iter {
            if let Ok(name) = d.name() {
                let is_default = default_name.as_deref() == Some(name.as_str());
                devices.push(AudioDevice { id: name.clone(), name, is_default });
            }
        }
    }
    Ok(devices)
}

pub struct SpeakerInput;

impl SpeakerInput {
    pub fn new(_device_id: Option<String>) -> Result<Self> {
        Err(anyhow::anyhow!(
            "System-audio capture is disabled in this build (requires Xcode). Mic capture still works."
        ))
    }

    pub fn stream(self) -> SpeakerStream {
        SpeakerStream { sample_rate: 16000 }
    }
}

pub struct SpeakerStream {
    sample_rate: u32,
}

impl SpeakerStream {
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }
}

impl Stream for SpeakerStream {
    type Item = f32;
    fn poll_next(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        Poll::Ready(None)
    }
}
