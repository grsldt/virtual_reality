import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18";

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");

function setStatus(msg) { statusEl.textContent = msg; }

function resize() {
  canvas.width = Math.floor(window.innerWidth * devicePixelRatio);
  canvas.height = Math.floor(window.innerHeight * devicePixelRatio);
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
window.addEventListener("resize", resize);
resize();

// Petite “boule particules” (2D) qui suit l’index
const particles = Array.from({ length: 220 }, () => ({
  x: Math.random() * window.innerWidth,
  y: Math.random() * window.innerHeight,
  vx: 0,
  vy: 0
}));

let target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let handLandmarker = null;
let running = false;

async function startCamera() {
  // Caméra arrière si possible
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false
  });

  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;

  await video.play();
}

async function loadHandModel() {
  // WASM + modèles hébergés par Google (stable)
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

function drawParticles() {
  // fond transparent (on voit la caméra)
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  // légère “lueur”
  ctx.globalCompositeOperation = "lighter";

  for (const p of particles) {
    const dx = target.x - p.x;
    const dy = target.y - p.y;

    // attraction + friction
    p.vx += dx * 0.0006;
    p.vy += dy * 0.0006;
    p.vx *= 0.90;
    p.vy *= 0.90;

    p.x += p.vx * 16;
    p.y += p.vy * 16;

    // petit bruit
    p.x += (Math.random() - 0.5) * 0.6;
    p.y += (Math.random() - 0.5) * 0.6;

    // wrap
    if (p.x < 0) p.x += window.innerWidth;
    if (p.x > window.innerWidth) p.x -= window.innerWidth;
    if (p.y < 0) p.y += window.innerHeight;
    if (p.y > window.innerHeight) p.y -= window.innerHeight;

    // particule
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 255, 204, 0.55)";
    ctx.fill();
  }

  // point cible (index)
  ctx.globalCompositeOperation = "source-over";
  ctx.beginPath();
  ctx.arc(target.x, target.y, 10, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function updateTargetFromHand(result) {
  if (!result || !result.landmarks || result.landmarks.length === 0) return;

  // Index tip = landmark 8 (x,y en 0..1)
  const lm = result.landmarks[0][8];
  const x = (1 - lm.x) * window.innerWidth; // miroir pour que ça “suive” naturel
  const y = lm.y * window.innerHeight;

  target.x = x;
  target.y = y;
}

let lastTime = -1;
function loop() {
  if (!running) return;

  const now = performance.now();
  if (handLandmarker && video.readyState >= 2) {
    // évite d’appeler trop vite
    if (now !== lastTime) {
      const res = handLandmarker.detectForVideo(video, now);
      updateTargetFromHand(res);
      lastTime = now;
    }
  }

  drawParticles();
  requestAnimationFrame(loop);
}

startBtn.addEventListener("click", async () => {
  try {
    startBtn.disabled = true;
    setStatus("Démarrage caméra…");

    await startCamera();

    setStatus("Chargement modèle main…");
    await loadHandModel();

    setStatus("OK ✅ Mets ta main devant la caméra");
    running = true;
    loop();
  } catch (e) {
    console.error(e);
    setStatus("Erreur. Ouvre en HTTPS + autorise la caméra.");
    startBtn.disabled = false;
  }
});