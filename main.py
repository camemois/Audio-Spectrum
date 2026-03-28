import json
import math
import os
import subprocess
import tempfile
from pathlib import Path

import cv2
import imageio_ffmpeg
import numpy as np
import soundfile as sf


"""
Audio Spectrum Renderer (Offline, Frame-Locked)

This script renders a 1920x1080 / 30 fps spectrum video with:
- green background (for chroma key in CapCut)
- light-colored bars
- smoothed, anti-flicker motion
- bottom-centered horizontal layout

Beginner note:
The renderer uses a fixed timeline. Every frame is computed from the audio,
then saved to a temporary silent video. In the end, the original audio is
padded (if needed) and muxed into the MP4.
"""


def load_config(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def to_mono(audio: np.ndarray) -> np.ndarray:
    """Convert stereo/multi-channel audio to mono by averaging channels."""
    if audio.ndim == 1:
        return audio.astype(np.float32)
    return np.mean(audio, axis=1).astype(np.float32)


def create_log_frequency_bins(sample_rate: int, fft_size: int, bars: int, min_hz: float, max_hz: float):
    """Create log-spaced frequency bins and map them to FFT index ranges."""
    nyquist = sample_rate / 2.0
    max_hz = min(max_hz, nyquist * 0.98)
    min_hz = max(20.0, min_hz)

    # FFT frequencies for rfft (positive half only)
    freqs = np.fft.rfftfreq(fft_size, d=1.0 / sample_rate)

    # Log-spaced band edges
    edges = np.logspace(np.log10(min_hz), np.log10(max_hz), bars + 1)

    band_indices = []
    for i in range(bars):
        low = edges[i]
        high = edges[i + 1]
        idx = np.where((freqs >= low) & (freqs < high))[0]
        if len(idx) == 0:
            # fallback: pick nearest bin so every bar has data
            nearest = int(np.argmin(np.abs(freqs - (low + high) * 0.5)))
            idx = np.array([nearest])
        band_indices.append(idx)

    return band_indices


def smooth_1d(values: np.ndarray, radius: int = 2) -> np.ndarray:
    """Simple moving average across neighboring bars (anti-flicker across frequency)."""
    if radius <= 0:
        return values
    kernel_size = radius * 2 + 1
    kernel = np.ones(kernel_size, dtype=np.float32) / kernel_size
    padded = np.pad(values, (radius, radius), mode="edge")
    return np.convolve(padded, kernel, mode="valid")


def extract_band_levels(
    audio: np.ndarray,
    center_sample: int,
    fft_size: int,
    band_indices,
    window: np.ndarray,
) -> np.ndarray:
    """Get spectrum magnitudes for one frame around center_sample."""
    half = fft_size // 2
    start = center_sample - half
    end = center_sample + half

    # Zero-padded slice if near start/end
    segment = np.zeros(fft_size, dtype=np.float32)
    src_start = max(0, start)
    src_end = min(len(audio), end)
    dst_start = src_start - start
    dst_end = dst_start + (src_end - src_start)
    if src_end > src_start:
        segment[dst_start:dst_end] = audio[src_start:src_end]

    # Window + FFT
    spectrum = np.abs(np.fft.rfft(segment * window))

    # Average each log band
    levels = np.array([float(np.mean(spectrum[idx])) for idx in band_indices], dtype=np.float32)
    return levels


def normalize_levels(levels: np.ndarray, floor_db: float = -80.0) -> np.ndarray:
    """Convert linear magnitudes to 0..1 range via dB mapping."""
    eps = 1e-10
    db = 20.0 * np.log10(np.maximum(levels, eps))
    db = np.clip(db, floor_db, 0.0)
    return (db - floor_db) / abs(floor_db)


def render_video(config: dict):
    # Paths
    input_audio = Path(config["input_audio"]).resolve()
    output_video = Path(config["output_video"]).resolve()

    output_video.parent.mkdir(parents=True, exist_ok=True)

    # Read audio
    audio, sample_rate = sf.read(str(input_audio), always_2d=False)
    audio = to_mono(audio)

    # Core timeline settings (frame-locked)
    fps = int(config["fps"])
    width = int(config["width"])
    height = int(config["height"])

    num_samples = len(audio)

    # Rule: we ROUND UP to the next frame so we never cut off the end of audio.
    audio_duration_sec = num_samples / sample_rate
    total_frames = int(math.ceil(audio_duration_sec * fps))
    if total_frames < 1:
        total_frames = 1

    frame_duration_sec = total_frames / fps

    # Calculate exact sample count needed for frame-locked output duration
    target_samples = int(round(frame_duration_sec * sample_rate))

    # Pad audio with silence if needed so audio and frame timeline match exactly
    if target_samples > num_samples:
        padded_audio = np.pad(audio, (0, target_samples - num_samples), mode="constant")
    else:
        padded_audio = audio[:target_samples]

    # Spectrum settings
    bars = int(config["bars"])
    fft_size = int(config["fft_size"])
    min_hz = float(config["min_hz"])
    max_hz = float(config["max_hz"])

    band_indices = create_log_frequency_bins(sample_rate, fft_size, bars, min_hz, max_hz)
    window = np.hanning(fft_size).astype(np.float32)

    # Visual settings
    bg_color = tuple(config["background_bgr"])  # BGR for OpenCV
    bar_color = tuple(config["bar_color_bgr"])
    bottom_margin = int(config["bottom_margin"])
    max_bar_height = int(config["max_bar_height"])
    min_bar_height = int(config["min_bar_height"])
    gap = int(config["bar_gap"])

    # Motion smoothing (time-domain)
    attack = float(config["attack_smoothing"])   # rise speed
    release = float(config["release_smoothing"]) # fall speed
    neighbor_radius = int(config["neighbor_smoothing_radius"])
    power = float(config["visual_power"])

    # Layout: bottom-centered horizontal bars
    total_gap = gap * (bars - 1)
    bar_width = (width - 2 * int(config["horizontal_padding"]) - total_gap) // bars
    used_width = bars * bar_width + total_gap
    start_x = (width - used_width) // 2
    base_y = height - bottom_margin

    # Temporary files
    temp_dir = Path(tempfile.mkdtemp(prefix="spectrum_render_"))
    silent_video_path = temp_dir / "silent.mp4"
    padded_audio_path = temp_dir / "padded.wav"

    # Save padded audio for reliable muxing
    sf.write(str(padded_audio_path), padded_audio, sample_rate)

    # Write silent video first
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(silent_video_path), fourcc, fps, (width, height))
    if not writer.isOpened():
        raise RuntimeError("Could not open video writer. Check codec support in your environment.")

    smooth_levels = np.zeros(bars, dtype=np.float32)

    for frame_idx in range(total_frames):
        # Frame-locked time mapping (exactly fps frames per second)
        t = frame_idx / fps
        center_sample = int(round(t * sample_rate))

        raw_levels = extract_band_levels(audio, center_sample, fft_size, band_indices, window)
        norm_levels = normalize_levels(raw_levels)

        # Neighbor smoothing reduces random bar-to-bar flicker
        norm_levels = smooth_1d(norm_levels, radius=neighbor_radius)

        # Attack/release smoothing keeps motion groovy and comfortable
        rising = norm_levels > smooth_levels
        smooth_levels[rising] = (1.0 - attack) * smooth_levels[rising] + attack * norm_levels[rising]
        smooth_levels[~rising] = (1.0 - release) * smooth_levels[~rising] + release * norm_levels[~rising]

        # Shape curve for nicer visual dynamics
        vis = np.power(np.clip(smooth_levels, 0.0, 1.0), power)

        # Draw frame
        frame = np.full((height, width, 3), bg_color, dtype=np.uint8)

        for i in range(bars):
            x = start_x + i * (bar_width + gap)
            bar_h = int(min_bar_height + vis[i] * (max_bar_height - min_bar_height))
            y1 = base_y - bar_h
            y2 = base_y
            cv2.rectangle(frame, (x, y1), (x + bar_width, y2), bar_color, thickness=-1, lineType=cv2.LINE_AA)

        writer.write(frame)

    writer.release()

    # Mux video + padded audio with ffmpeg from imageio-ffmpeg
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [
        ffmpeg_exe,
        "-y",
        "-i",
        str(silent_video_path),
        "-i",
        str(padded_audio_path),
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        str(output_video),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg mux failed:\n{result.stderr}")

    print("Render complete!")
    print(f"Input audio:  {input_audio}")
    print(f"Output video: {output_video}")
    print(f"Sample rate:  {sample_rate} Hz")
    print(f"Audio samples: {num_samples}")
    print(f"FPS:          {fps}")
    print(f"Frames:       {total_frames}")
    print(f"Video duration (frame-locked): {frame_duration_sec:.6f} sec")
    print(
        "Frame boundary rule: video duration is rounded UP to the next 1/30 sec frame; "
        "audio is padded with silence to match exactly."
    )


if __name__ == "__main__":
    config = load_config(Path("config.json"))

    # Ensure default folders exist so beginners can just drop song.wav in /input
    os.makedirs("input", exist_ok=True)
    os.makedirs("output", exist_ok=True)

    render_video(config)
