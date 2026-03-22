const wavInput = document.getElementById("wav-input");
const previewBtn = document.getElementById("preview-btn");
const batchBtn = document.getElementById("batch-btn");
const stopBtn = document.getElementById("stop-btn");
const moveUpBtn = document.getElementById("move-up-btn");
const moveDownBtn = document.getElementById("move-down-btn");
const playlist = document.getElementById("playlist");
const statusText = document.getElementById("status");
const currentTrackText = document.getElementById("current-track");
const trackProgress = document.getElementById("track-progress");
const canvas = document.getElementById("spectrum");
const ctx = canvas.getContext("2d");

const ui = {
  bgMode: document.getElementById("bg-mode"),
  shapeMode: document.getElementById("shape-mode"),
  colorMode: document.getElementById("color-mode"),
  customColor: document.getElementById("custom-color"),
  opacity: document.getElementById("opacity"),
  barCount: document.getElementById("bar-count"),
  canvasWidth: document.getElementById("canvas-width"),
  canvasHeight: document.getElementById("canvas-height"),
  layoutMode: document.getElementById("layout-mode"),
  minBoost: document.getElementById("min-boost"),
  maxBoost: document.getElementById("max-boost"),
  reflection: document.getElementById("reflection"),
  recordVideo: document.getElementById("record-video")
};

let audioContext;
let analyser;
let animationFrameId;
let currentSource;
let currentAudio = null;
let selectedTrackIndex = -1;
let isBatchRendering = false;

const tracks = [];

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
}

function updateCanvasSize() {
  const width = Number(ui.canvasWidth.value) || 1280;
  const height = Number(ui.canvasHeight.value) || 720;
  canvas.width = Math.max(320, Math.min(width, 3840));
  canvas.height = Math.max(240, Math.min(height, 2160));
}

function ensureAudioGraph() {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (!analyser) {
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    analyser.connect(audioContext.destination);
  }
}

function renderPlaylist() {
  playlist.innerHTML = "";

  if (!tracks.length) {
    playlist.innerHTML = '<li class="placeholder">아직 선택된 WAV 파일이 없습니다.</li>';
    return;
  }

  tracks.forEach((track, index) => {
    const item = document.createElement("li");
    item.textContent = `${index + 1}. ${track.file.name}`;
    item.classList.toggle("active", index === selectedTrackIndex);
    item.addEventListener("click", () => {
      selectedTrackIndex = index;
      refreshControls();
      renderPlaylist();
    });
    playlist.appendChild(item);
  });
}

function refreshControls() {
  const hasTrack = selectedTrackIndex >= 0 && selectedTrackIndex < tracks.length;
  previewBtn.disabled = !hasTrack || isBatchRendering;
  batchBtn.disabled = !tracks.length || isBatchRendering;
  stopBtn.disabled = !currentSource;
  moveUpBtn.disabled = !hasTrack || selectedTrackIndex <= 0 || isBatchRendering;
  moveDownBtn.disabled = !hasTrack || selectedTrackIndex >= tracks.length - 1 || isBatchRendering;
}

function getVisualConfig() {
  const minBoost = Number(ui.minBoost.value);
  const maxBoost = Number(ui.maxBoost.value);

  return {
    bgMode: ui.bgMode.value,
    shapeMode: ui.shapeMode.value,
    colorMode: ui.colorMode.value,
    customColor: ui.customColor.value,
    opacity: Number(ui.opacity.value),
    barCount: Number(ui.barCount.value),
    layoutMode: ui.layoutMode.value,
    minBoost,
    maxBoost: Math.max(maxBoost, minBoost + 1),
    reflection: ui.reflection.checked
  };
}

function backgroundColor(mode) {
  if (mode === "green") return "#00ff00";
  return "#000000";
}

function getBarColor(index, total, config) {
  if (config.colorMode === "custom") return config.customColor;
  const hue = (index / Math.max(1, total)) * 300;
  return `hsl(${hue}, 92%, 60%)`;
}

function drawBars(dataArray, config, width, height) {
  const count = Math.min(config.barCount, dataArray.length);
  const isMirror = config.layoutMode === "mirror";
  const drawCount = isMirror ? Math.floor(count / 2) : count;
  const barWidth = width / Math.max(1, drawCount);

  for (let i = 0; i < drawCount; i++) {
    const sample = dataArray[Math.floor((i / drawCount) * count)] / 255;
    const h = config.minBoost + sample * (config.maxBoost - config.minBoost);
    const color = getBarColor(i, drawCount, config);

    const drawOne = (xPos) => {
      ctx.fillStyle = color;
      ctx.globalAlpha = config.opacity;
      ctx.fillRect(xPos, height - h, Math.max(1, barWidth - 1), h);

      if (config.reflection) {
        const reflectionHeight = h * 0.45;
        const gradient = ctx.createLinearGradient(0, height, 0, height + reflectionHeight);
        gradient.addColorStop(0, `rgba(255,255,255,${config.opacity * 0.24})`);
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(xPos, height, Math.max(1, barWidth - 1), reflectionHeight);
      }
      ctx.globalAlpha = 1;
    };

    if (isMirror) {
      const half = width / 2;
      drawOne(half + i * barWidth);
      drawOne(half - (i + 1) * barWidth);
    } else {
      drawOne(i * barWidth);
    }
  }
}

function drawCircle(dataArray, config, width, height) {
  const count = Math.min(config.barCount, dataArray.length);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.18;

  for (let i = 0; i < count; i++) {
    const sample = dataArray[Math.floor((i / count) * count)] / 255;
    const length = config.minBoost + sample * (config.maxBoost - config.minBoost);
    const angle = (i / count) * Math.PI * 2;
    const x1 = cx + Math.cos(angle) * radius;
    const y1 = cy + Math.sin(angle) * radius;
    const x2 = cx + Math.cos(angle) * (radius + length);
    const y2 = cy + Math.sin(angle) * (radius + length);

    ctx.strokeStyle = getBarColor(i, count, config);
    ctx.globalAlpha = config.opacity;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (config.reflection) {
      const reflectionY1 = height - y1;
      const reflectionY2 = height - y2;
      ctx.globalAlpha = config.opacity * 0.28;
      ctx.beginPath();
      ctx.moveTo(x1, reflectionY1);
      ctx.lineTo(x2, reflectionY2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

function drawSpectrum() {
  if (!analyser) return;
  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  const frame = () => {
    const config = getVisualConfig();
    const width = canvas.width;
    const height = canvas.height;

    analyser.getByteFrequencyData(dataArray);

    ctx.fillStyle = backgroundColor(config.bgMode);
    ctx.fillRect(0, 0, width, height);

    if (config.shapeMode === "circle") {
      drawCircle(dataArray, config, width, height);
    } else {
      drawBars(dataArray, config, width, height * 0.75);
    }

    animationFrameId = requestAnimationFrame(frame);
  };

  frame();
}

function clearDrawing() {
  ctx.fillStyle = backgroundColor(ui.bgMode.value);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function stopPlayback() {
  if (currentSource) {
    try {
      currentSource.stop();
    } catch {
      // already stopped
    }
    currentSource.disconnect();
  }

  currentSource = null;
  currentAudio = null;

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  clearDrawing();
  trackProgress.value = 0;
  refreshControls();
}

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function playTrack(trackIndex, { record = false } = {}) {
  const track = tracks[trackIndex];
  if (!track) return;

  ensureAudioGraph();
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  stopPlayback();

  currentTrackText.textContent = `현재 작업: ${trackIndex + 1}/${tracks.length} - ${track.file.name}`;
  setStatus(record ? "렌더링/재생 중..." : "미리재생 중...");

  const source = audioContext.createBufferSource();
  source.buffer = track.buffer;
  source.connect(analyser);
  currentSource = source;
  currentAudio = track;

  let recorder;
  let chunks = [];

  if (record) {
    const stream = canvas.captureStream(60);
    recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.start(1000);
  }

  drawSpectrum();

  const startedAt = audioContext.currentTime;
  source.start();

  return new Promise((resolve) => {
    const timerId = setInterval(() => {
      if (!currentAudio || currentSource !== source) {
        clearInterval(timerId);
        return;
      }
      const elapsed = Math.max(0, audioContext.currentTime - startedAt);
      trackProgress.value = Math.min(1, elapsed / track.buffer.duration);
    }, 80);

    source.onended = () => {
      clearInterval(timerId);
      trackProgress.value = 1;

      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: "video/webm" });
          const cleanName = track.file.name.replace(/\.[^.]+$/, "");
          downloadBlob(blob, `${String(trackIndex + 1).padStart(2, "0")}_${cleanName}_spectrum.webm`);
          chunks = [];
          stopPlayback();
          resolve();
        };
        recorder.stop();
      } else {
        stopPlayback();
        resolve();
      }
    };

    refreshControls();
  });
}

async function decodeTrack(file) {
  ensureAudioGraph();
  const data = await file.arrayBuffer();
  const buffer = await audioContext.decodeAudioData(data.slice(0));
  return { file, buffer };
}

async function handleFileLoad(fileList) {
  const files = Array.from(fileList || []);
  tracks.length = 0;
  selectedTrackIndex = -1;
  renderPlaylist();

  if (!files.length) {
    setStatus("WAV 파일을 선택해 주세요.");
    refreshControls();
    return;
  }

  setStatus("파일을 디코딩 중입니다...");
  try {
    for (const file of files) {
      const decoded = await decodeTrack(file);
      tracks.push(decoded);
    }
    selectedTrackIndex = 0;
    renderPlaylist();
    setStatus(`${tracks.length}개 파일 준비 완료. 미리재생 또는 순서 렌더를 실행하세요.`);
  } catch (error) {
    console.error(error);
    setStatus("WAV 처리 중 오류가 발생했습니다. 파일 형식을 확인해 주세요.", true);
  }

  refreshControls();
}

function moveSelected(direction) {
  if (selectedTrackIndex < 0) return;
  const target = selectedTrackIndex + direction;
  if (target < 0 || target >= tracks.length) return;

  [tracks[selectedTrackIndex], tracks[target]] = [tracks[target], tracks[selectedTrackIndex]];
  selectedTrackIndex = target;
  renderPlaylist();
  refreshControls();
}

wavInput.addEventListener("change", (event) => {
  handleFileLoad(event.target.files);
});

previewBtn.addEventListener("click", async () => {
  await playTrack(selectedTrackIndex, { record: false });
  setStatus("미리재생이 완료되었습니다.");
});

batchBtn.addEventListener("click", async () => {
  if (!tracks.length) return;

  isBatchRendering = true;
  refreshControls();
  const shouldRecord = ui.recordVideo.checked;

  for (let i = 0; i < tracks.length; i++) {
    if (!isBatchRendering) break;
    selectedTrackIndex = i;
    renderPlaylist();
    await playTrack(i, { record: shouldRecord });
  }

  isBatchRendering = false;
  currentTrackText.textContent = "현재 작업: 없음";
  setStatus(shouldRecord ? "전체 렌더링이 완료되었습니다." : "전체 미리재생이 완료되었습니다.");
  refreshControls();
});

stopBtn.addEventListener("click", () => {
  isBatchRendering = false;
  stopPlayback();
  setStatus("중지되었습니다.");
});

moveUpBtn.addEventListener("click", () => moveSelected(-1));
moveDownBtn.addEventListener("click", () => moveSelected(1));

[ui.canvasWidth, ui.canvasHeight, ui.bgMode].forEach((input) => {
  input.addEventListener("change", () => {
    updateCanvasSize();
    clearDrawing();
  });
});

updateCanvasSize();
clearDrawing();
refreshControls();
