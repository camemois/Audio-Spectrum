# Audio Spectrum Video Renderer (CapCut Overlay)

A beginner-friendly local Python project that renders an **audio-reactive MP4 spectrum video**.

- Input audio: `input/song.wav`
- Output video: `output/song_spectrum.mp4`
- Resolution: **1920x1080**
- Frame rate: **exact fixed 30 fps**
- Rendering: **offline** (not screen recording)
- Background: **green** for chroma key in CapCut
- Bars: **light/white**, smooth, bottom-centered horizontal layout

---

## 1) What each file does

- `main.py`  
  Main renderer script. Reads config, analyzes audio, draws bars frame-by-frame, then exports MP4 with audio.

- `config.json`  
  All settings in one place (paths, fps, colors, bar count, smoothing, layout).

- `requirements.txt`  
  Python libraries needed for rendering.

- `run_render.bat`  
  Windows helper script that creates/uses a virtual environment, installs dependencies, and runs render.

- `README.md`  
  This guide.

---

## 2) Super simple setup (Windows)

1. Install Python 3.10+.
2. Put your audio file at:
   - `input/song.wav`
3. Double-click:
   - `run_render.bat`

That’s it. Output will be:
- `output/song_spectrum.mp4`

---

## 3) Exact terminal commands (manual method)

If you prefer terminal instead of double-click:

```bat
py -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python main.py
```

---

## 4) Frame-locked timing rule (important)

This project uses a strict **30 fps frame timeline**.

Rule when audio length is not exactly on a frame boundary:
- The video frame count is calculated with `ceil(audio_seconds * 30)`.
- So duration is rounded **up** to the next frame.
- Audio is padded with a tiny amount of silence so audio/video end exactly on that frame boundary.

This guarantees frame-locked consistency for editing/compositing.

---

## 5) CapCut usage

1. Import `output/song_spectrum.mp4` into CapCut.
2. Place it above your base footage as an overlay.
3. Use **Chroma Key** on green background.
4. Fine-tune intensity/shadows as needed.

---

## 6) Customize look in `config.json`

Common edits:
- `bars`: more bars = more detail
- `max_bar_height`: taller bars
- `bar_gap`: spacing between bars
- `bar_color_bgr`: change bar color
- `attack_smoothing` / `release_smoothing`: motion feel
- `neighbor_smoothing_radius`: anti-flicker strength

Tip: small changes are best for a clean, modern look.
