import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18";

const video = document.getElementById("video");
const drawCanvas = document.getElementById("draw");
const followEl = document.getElementById("followBtn");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");

const dctx = drawCanvas.getContext("2d", { alpha: true });

const DPR = () => (window.devicePixelRatio || 1);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function setStatus(msg) { statusEl.textContent = msg; }

function resize() {
  const dpr = DPR();
  drawCanvas.width = Math.floor(window.innerWidth * dpr);
  drawCanvas.height = Math.floor(window.innerHeight * dpr);
  dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

// --------------------
// Camera + Model
// --------------------
let handLandmarker = null;
let running = false;

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
    audio: false
  });
  video.srcObject = stream;
  video.muted = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  await video.play();
}

async function loadModel() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
  );
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numHands: 1
  });
}

// --------------------
// Helpers (landmarks)
// --------------------
function toPx(lm) {
  return { x: lm.x * window.innerWidth, y: lm.y * window.innerHeight };
}
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Finger “extended” heuristic (works well for front-facing palm to camera).
// We use tip.y < pip.y (in image coords y grows downward).
function fingerExtended(lm, tipIdx, pipIdx) {
  return lm[tipIdx].y < lm[pipIdx].y;
}

// Peace sign (2): index + middle extended, ring + pinky NOT extended
function isPeaceSign(lm) {
  const idx = fingerExtended(lm, 8, 6);
  const mid = fingerExtended(lm, 12, 10);
  const ring = fingerExtended(lm, 16, 14);
  const pink = fingerExtended(lm, 20, 18);
  return idx && mid && !ring && !pink;
}

// Fist: all fingertips close to palm center (approx by MCPs average)
function isFist(lm) {
  const palm = {
    x: (lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 4,
    y: (lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 4
  };
  const palmPx = toPx(palm);
  const tips = [4, 8, 12, 16, 20].map(i => toPx(lm[i]));
  const avg = tips.reduce((s, p) => s + dist(p, palmPx), 0) / tips.length;
  // seuil à peu près stable (ajustable)
  return avg < 85;
}

// Pinch: thumb tip (4) <-> index tip (8)
function pinchValue01(lm) {
  const a = toPx(lm[4]);
  const b = toPx(lm[8]);
  const d = dist(a, b);
  // 0=open, 1=pinch (calibré pour mobile)
  return 1 - clamp((d - 18) / (140 - 18), 0, 1);
}

// --------------------
// Drawing (smooth)
// --------------------
function clearAll() {
  dctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
}

function drawSegment(p0, p1, pressure) {
  // Neon stroke
  const w = 1.8 + pressure * 5; // 3..13
  dctx.lineCap = "round";
  dctx.lineJoin = "round";
  dctx.strokeStyle = "rgba(0,220,255,0.9)";
  dctx.lineWidth = w;

  dctx.beginPath();
  dctx.moveTo(p0.x, p0.y);
  dctx.lineTo(p1.x, p1.y);
  dctx.stroke();
}

// --------------------
// State machine
// --------------------
const CURSOR_SIZE = 56;
let target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let smooth = { x: target.x, y: target.y };

let prev = null;

let handVisible = false;
let pinch01Sm = 0;
let penDown = false;

// cooldowns to avoid accidental clears/toggles
let lastClearAt = 0;
const CLEAR_COOLDOWN_MS = 1400;

// “pause writing” with fist (word separation)
let pausedByFist = false;

function updateUI() {
  if (!handVisible) {
    setStatus("Mets ta main dans le cadre…");
    followEl.style.transform = `translate(-200px,-200px)`;
    followEl.classList.remove("active");
    return;
  }

  followEl.classList.add("active");

  const px = smooth.x - CURSOR_SIZE / 2;
  const py = smooth.y - CURSOR_SIZE / 2;

  // small scale reacts to pinch
  const scale = 1 + pinch01Sm * 0.25;

  followEl.style.transform = `translate(${px}px, ${py}px) scale(${scale})`;

  if (penDown) setStatus("✍️ Écriture (pinch)");
  else if (pausedByFist) setStatus("✋ Pause (poing) — ouvre la main pour reprendre");
  else setStatus("Main détectée ✅ (pinch pour écrire, ✌️ = effacer)");
}

// --------------------
// Main loop
// --------------------
function loop() {
  if (!running) return;

  let lm = null;

  if (handLandmarker && video.readyState >= 2) {
    const now = performance.now();
    const res = handLandmarker.detectForVideo(video, now);
    if (res?.landmarks?.length) lm = res.landmarks[0];
  }

  handVisible = !!lm;

  if (handVisible) {
    // cursor target = index tip
    const tip = toPx(lm[8]);
    target.x = tip.x;
    target.y = tip.y;

    // smooth cursor
    smooth.x = lerp(smooth.x, target.x, 0.25);
    smooth.y = lerp(smooth.y, target.y, 0.25);

    // gestures
    const p = pinchValue01(lm);
    pinch01Sm = lerp(pinch01Sm, p, 0.25);

    // clear gesture: ✌️
    const nowMs = Date.now();
    if (isPeaceSign(lm) && (nowMs - lastClearAt > CLEAR_COOLDOWN_MS)) {
      clearAll();
      lastClearAt = nowMs;
      // also stop drawing stroke
      prev = null;
    }

    // fist pause
    const fist = isFist(lm);
    if (fist) {
      pausedByFist = true;
      penDown = false;
      prev = null;
    } else {
      // exit fist pause when hand opens
      pausedByFist = false;
      // pen down only if pinching
      penDown = pinch01Sm > 0.55;
    }

    // drawing logic: draw only when penDown
    if (penDown) {
      const pt = { x: smooth.x, y: smooth.y };
      if (prev) drawSegment(prev, pt, pinch01Sm);
      prev = pt;
    } else {
      prev = null; // break stroke = separation between words
    }
  } else {
    // lost hand
    prev = null;
    penDown = false;
    pausedByFist = false;
  }

  updateUI();
  requestAnimationFrame(loop);
}

// --------------------
// Start
// --------------------
startBtn.addEventListener("click", async () => {
  try {
    startBtn.disabled = true;
    setStatus("Caméra…");
    await startCamera();

    setStatus("Modèle main…");
    await loadModel();

    setStatus("OK ✅ Pinch pour écrire • ✌️ pour effacer • Poing pour pause");
    running = true;
    loop();
  } catch (e) {
    console.error(e);
    setStatus("Erreur : HTTPS + autoriser caméra, puis recharge.");
    startBtn.disabled = false;
  }
});