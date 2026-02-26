import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18";

const video = document.getElementById("video");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const followBtn = document.getElementById("followBtn");

const BTN_SIZE = 64;

function setStatus(msg){ statusEl.textContent = msg; }
const lerp = (a,b,t)=> a + (b-a)*t;
const clamp = (v,a,b)=> Math.max(a, Math.min(b, v));

let handLandmarker = null;
let running = false;

// cible & lissage
let x = 50, y = 150;
let sx = x, sy = y;

// vitesse (pour tilt)
let vx = 0, vy = 0;

// pinch 0..1
let pinch01 = 0;

// util distance
function dist(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return Math.hypot(dx, dy);
}

async function startCamera(){
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

async function loadModel(){
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

function updateFromHand(res){
  if (!res?.landmarks?.length) return false;

  const lm = res.landmarks[0];

  // Index tip = 8
  const tip = lm[8];
  const tx = tip.x * window.innerWidth;
  const ty = tip.y * window.innerHeight;

  x = tx;
  y = ty;

  // Pinch: thumb tip (4) <-> index tip (8)
  const th = lm[4];
  const thx = th.x * window.innerWidth;
  const thy = th.y * window.innerHeight;

  const d = dist(tx, ty, thx, thy);

  // Calibrage pinch (ajuste si besoin)
  const p = 1 - clamp((d - 20) / (140 - 20), 0, 1);
  pinch01 = lerp(pinch01, p, 0.25);

  return true;
}

function render(active){
  if (!active) {
    followBtn.classList.remove("active");
    // “cache” hors écran sans flicker
    followBtn.style.transform = `translate(${-200}px, ${-200}px)`;
    return;
  }

  followBtn.classList.add("active");

  // smoothing position
  const prevX = sx, prevY = sy;
  sx = lerp(sx, x, 0.26);
  sy = lerp(sy, y, 0.26);

  // velocity (smoothed)
  vx = lerp(vx, sx - prevX, 0.35);
  vy = lerp(vy, sy - prevY, 0.35);

  // tilt / stretch selon vitesse
  const speed = Math.hypot(vx, vy);
  const tilt = clamp(speed * 2.0, 0, 18); // deg
  const ang = Math.atan2(vy, vx) * (180 / Math.PI);

  // scale selon pinch
  const scale = 1 + pinch01 * 0.55;

  // stretch léger (pro)
  const stretch = clamp(speed * 0.06, 0, 0.25);
  const sx2 = scale * (1 + stretch);
  const sy2 = scale * (1 - stretch);

  // glow selon pinch
  const glow = 0.6 + pinch01 * 0.9;
  followBtn.style.filter = `drop-shadow(0 0 ${18 + pinch01*18}px rgba(0,255,200,${glow}))`;

  // centre le bouton
  const px = sx - BTN_SIZE / 2;
  const py = sy - BTN_SIZE / 2;

  followBtn.style.transform =
    `translate(${px}px, ${py}px) rotate(${ang}deg) rotateX(${tilt}deg) scale(${sx2}, ${sy2})`;
}

function loop(){
  if (!running) return;

  let active = false;

  if (handLandmarker && video.readyState >= 2) {
    const now = performance.now();
    const res = handLandmarker.detectForVideo(video, now);
    active = updateFromHand(res);
  }

  if (active) setStatus("Main détectée ✅ (pinch = boost)");
  else setStatus("Mets ta main dans le cadre…");

  render(active);
  requestAnimationFrame(loop);
}

startBtn.addEventListener("click", async ()=>{
  try{
    startBtn.disabled = true;
    setStatus("Caméra…");
    await startCamera();

    setStatus("Modèle main…");
    await loadModel();

    setStatus("OK ✅ Mets ta main devant la caméra");
    running = true;
    loop();
  } catch(e){
    console.error(e);
    setStatus("Erreur : HTTPS + autoriser la caméra, puis recharge.");
    startBtn.disabled = false;
  }
});