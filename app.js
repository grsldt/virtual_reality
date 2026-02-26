import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18";

const video = document.getElementById("video");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const followBtn = document.getElementById("followBtn");

function setStatus(msg) {
  statusEl.textContent = msg;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

let handLandmarker = null;
let running = false;

// position cible (index) + position lissée
let x = 50, y = 150;
let sx = x, sy = y;

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

function updateFromHand(res) {
  if (!res?.landmarks?.length) return false;

  // Index tip = 8
  const lm = res.landmarks[0][8];

  // Caméra arrière => PAS de miroir
  x = lm.x * window.innerWidth;
  y = lm.y * window.innerHeight;

  return true;
}

function render() {
  // lissage
  sx = lerp(sx, x, 0.25);
  sy = lerp(sy, y, 0.25);

  // centre le bouton (60x60 dans ton HTML)
  followBtn.style.transform = `translate(${sx - 30}px, ${sy - 30}px)`;
}

let lastTs = -1;
function loop() {
  if (!running) return;

  const now = performance.now();
  if (handLandmarker && video.readyState >= 2 && now !== lastTs) {
    const res = handLandmarker.detectForVideo(video, now);
    const ok = updateFromHand(res);

    if (ok) {
      setStatus("Main détectée ✅");
      render();
    } else {
      setStatus("Mets ta main dans le cadre…");
    }
    lastTs = now;
  }

  requestAnimationFrame(loop);
}

startBtn.addEventListener("click", async () => {
  try {
    startBtn.disabled = true;

    setStatus("Caméra…");
    await startCamera();

    setStatus("Chargement du modèle main…");
    await loadModel();

    setStatus("OK ✅ Mets ta main devant la caméra");
    running = true;
    loop();
  } catch (e) {
    console.error(e);
    setStatus("Erreur : ouvre en HTTPS + autorise la caméra, puis recharge.");
    startBtn.disabled = false;
  }
});