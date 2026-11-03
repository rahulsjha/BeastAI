//! Audio capture probe: lists input devices and records from one of them using
//! the same cpal path the app uses, reporting signal level and writing a WAV.
//!
//!   cargo run --example audio_probe -- list
//!   cargo run --example audio_probe -- record "<device name>" <secs> <out.wav>
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::{Arc, Mutex};
use std::time::Duration;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let host = cpal::default_host();
    match args.get(1).map(|s| s.as_str()) {
        Some("list") => {
            let default = host.default_input_device().and_then(|d| d.name().ok());
            for d in host.input_devices().expect("input devices") {
                let name = d.name().unwrap_or_default();
                let cfg = d.default_input_config().map(|c| format!("{} ch @ {} Hz {:?}", c.channels(), c.sample_rate().0, c.sample_format()));
                println!("{}{}  [{}]", if default.as_deref() == Some(&name) { "* " } else { "  " }, name, cfg.unwrap_or_else(|e| format!("no config: {e}")));
            }
        }
        Some("record") => {
            let want = &args[2];
            let secs: u64 = args[3].parse().unwrap();
            let out = &args[4];
            let dev = host.input_devices().unwrap().find(|d| d.name().map(|n| &n == want).unwrap_or(false)).expect("device not found");
            let cfg = dev.default_input_config().expect("config");
            let ch = cfg.channels() as usize;
            let sr = cfg.sample_rate().0;
            let buf: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
            let b = buf.clone();
            let err = |e| eprintln!("stream error: {e}");
            let stream = match cfg.sample_format() {
                cpal::SampleFormat::F32 => dev.build_input_stream(&cfg.into(), move |d: &[f32], _| push(&b, d, ch, |s| s), err, None),
                cpal::SampleFormat::I16 => dev.build_input_stream(&cfg.into(), move |d: &[i16], _| push(&b, d, ch, |s| s as f32 / 32768.0), err, None),
                cpal::SampleFormat::U16 => dev.build_input_stream(&cfg.into(), move |d: &[u16], _| push(&b, d, ch, |s| (s as f32 - 32768.0) / 32768.0), err, None),
                f => panic!("unsupported format {f:?}"),
            }.expect("build stream");
            stream.play().expect("play");
            std::thread::sleep(Duration::from_secs(secs));
            drop(stream);
            let samples = buf.lock().unwrap().clone();
            let n = samples.len().max(1) as f32;
            let rms = (samples.iter().map(|s| s * s).sum::<f32>() / n).sqrt();
            let peak = samples.iter().fold(0f32, |m, s| m.max(s.abs()));
            let spec = hound::WavSpec { channels: 1, sample_rate: sr, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
            let mut w = hound::WavWriter::create(out, spec).unwrap();
            for s in &samples { w.write_sample((s.clamp(-1.0, 1.0) * 32767.0) as i16).unwrap(); }
            w.finalize().unwrap();
            println!("device={want} rate={sr} samples={} secs={:.1} rms={rms:.4} peak={peak:.3} -> {out}", samples.len(), samples.len() as f32 / sr as f32);
        }
        _ => eprintln!("usage: list | record <device> <secs> <out.wav>"),
    }
}

fn push<T: Copy>(b: &Arc<Mutex<Vec<f32>>>, data: &[T], ch: usize, f: impl Fn(T) -> f32) {
    let mut g = b.lock().unwrap();
    for frame in data.chunks(ch.max(1)) {
        let s: f32 = frame.iter().map(|&x| f(x)).sum::<f32>() / frame.len() as f32;
        g.push(s);
    }
}
