import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18";

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const switchBtn = document.getElementById("switchBtn");

function setStatus(msg) { statusEl.textContent = msg; }

function resize() {
  canvas.width = Math.floor(window.innerWidth * devicePixelRatio);
  canvas.height = Math.floor(window.innerHeight * devicePixelRatio);
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
window.addEventListener("resize", resize);
resize();

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function hypot2(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

// --------------------
// Camera management
// --------------------
let stream = null;
let facing = "environment"; // "user" or "environment"
let mirror = false;         // selfie => mirror ON

async function stopStream() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

async function startCamera() {
  await stopStream();

  mirror = (facing === "user");

  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: facing } },
    audio: false
  });

  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;

  // iOS friendly
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");

  await video.play();
}

// --------------------
// MediaPipe model
// --------------------
let handLandmarker = null;

async function loadHandModel() {
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
// Visual effect (particles)
// --------------------
const N = 320;
const particles = Array.from({ length: N }, () => ({
  x: Math.random() * window.innerWidth,
  y: Math.random() * window.innerHeight,
  vx: 0,
  vy: 0
}));

let running = false;
let handVisible = false;

let target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let smooth = { x: target.x, y: target.y };
let pinch01 = 0;

// convert landmark (0..1) => screen px, with optional mirror
function lmToScreen(lm) {
  const x01 = mirror ? (1 - lm.x) : lm.x;
  return {
    x: x01 * window.innerWidth,
    y: lm.y * window.innerHeight
  };
}

function updateFromHand(res) {
  handVisible = !!(res && res.landmarks && res.landmarks.length);
  if (!handVisible) return;

  const lm = res.landmarks[0];

  // index tip (8)
  const tip = lmToScreen(lm[8]);
  target.x = tip.x;
  target.y = tip.y;

  // pinch (thumb tip 4 to index tip 8)
  const thumb = lmToScreen(lm[4]);
  const d = hypot2(thumb.x, thumb.y, tip.x, tip.y);

  // tune values for your phone
  const pinch = 1 - clamp((d - 25) / (140 - 25), 0, 1);
  pinch01 = lerp(pinch01, pinch, 0.22);
}

function draw() {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  // smoothing
  smooth.x = lerp(smooth.x, target.x, 0.20);
  smooth.y = lerp(smooth.y, target.y, 0.20);

  // particles
  ctx.globalCompositeOperation = "lighter";

  const pull = 0.00055 + pinch01 * 0.0012;
  const r = 1.2 + pinch01 * 2.2;

  for (const p of particles) {
    const dx = smooth.x - p.x;
    const dy = smooth.y - p.y;

    p.vx += dx * pull;
    p.vy += dy * pull;

    p.vx *= 0.90;
    p.vy *= 0.90;

    p.x += p.vx * 16;
    p.y += p.vy * 16;

    // slight noise
    p.x += (Math.random() - 0.5) * 0.4;
    p.y += (Math.random() - 0.5) * 0.4;

    // wrap
    if (p.x < 0) p.x += window.innerWidth;
    if (p.x > window.innerWidth) p.x -= window.innerWidth;
    if (p.y < 0) p.y += window.innerHeight;
    if (p.y > window.innerHeight) p.y -= window.innerHeight;

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 255, 204, 0.35)";
    ctx.fill();
  }

  // cursor
  ctx.globalCompositeOperation = "source-over";
  if (handVisible) {
    ctx.beginPath();
    ctx.arc(smooth.x, smooth.y, 12 + pinch01 * 10, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(smooth.x, smooth.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,255,204,0.9)";
    ctx.fill();
  }
}

// --------------------
// Main loop
// --------------------
let lastTs = -1;
function loop() {
  if (!running) return;

  const now = performance.now();
  if (handLandmarker && video.readyState >= 2 && now !== lastTs) {
    const res = handLandmarker.detectForVideo(video, now);
    updateFromHand(res);
    lastTs = now;
  } else {
    handVisible = false;
  }

  draw();
  requestAnimationFrame(loop);
}

// --------------------
// UI actions
// --------------------
startBtn.addEventListener("click", async () => {
  try {
    startBtn.disabled = true;
    setStatus("Démarrage caméra…");

    await startCamera();

    setStatus("Chargement modèle main…");
    await loadHandModel();

    setStatus(`OK ✅ Main détectée (caméra: ${facing === "user" ? "avant" : "arrière"})`);
    switchBtn.disabled = false;

    running = true;
    loop();
  } catch (e) {
    console.error(e);
    setStatus("Erreur : HTTPS + autoriser caméra (et recharger la page).");
    startBtn.disabled = false;
  }
});

switchBtn.addEventListener("click", async () => {
  try {
    switchBtn.disabled = true;
    setStatus("Switch caméra…");

    facing = (facing === "user") ? "environment" : "user";
    await startCamera();

    setStatus(`Caméra: ${facing === "user" ? "avant (miroir)" : "arrière"}`);
    switchBtn.disabled = false;
  } catch (e) {
    console.error(e);
    setStatus("Impossible de changer de caméra sur ce navigateur.");
    switchBtn.disabled = false;
  }
});