import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18";

const video = document.getElementById("video");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const followBtn = document.getElementById("followBtn");

const drawCanvas = document.getElementById("draw");
const dctx = drawCanvas.getContext("2d", { alpha: true });

const lerp = (a,b,t)=> a + (b-a)*t;
function setStatus(msg){ statusEl.textContent = msg; }

function resize(){
  drawCanvas.width = Math.floor(window.innerWidth * devicePixelRatio);
  drawCanvas.height = Math.floor(window.innerHeight * devicePixelRatio);
  dctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
window.addEventListener("resize", resize);
resize();

function clearDrawing(){
  dctx.clearRect(0,0,window.innerWidth, window.innerHeight);
}

function drawLine(x1,y1,x2,y2){
  dctx.lineCap = "round";
  dctx.lineJoin = "round";
  dctx.strokeStyle = "rgba(0,220,255,0.9)";
  dctx.lineWidth = 6;

  dctx.beginPath();
  dctx.moveTo(x1,y1);
  dctx.lineTo(x2,y2);
  dctx.stroke();
}

let handLandmarker = null;
let running = false;

let x=0, y=0, sx=0, sy=0;
let hasPrev = false;
let prevX=0, prevY=0;

async function startCamera(){
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
    audio: false
  });
  video.srcObject = stream;
  video.muted = true;
  video.setAttribute("playsinline","");
  video.setAttribute("webkit-playsinline","");
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
  if(!res?.landmarks?.length) return false;
  const tip = res.landmarks[0][8]; // index tip
  x = tip.x * window.innerWidth;
  y = tip.y * window.innerHeight;
  return true;
}

function renderCursor(active){
  if(!active){
    followBtn.classList.remove("active");
    followBtn.style.transform = `translate(${-200}px, ${-200}px)`;
    return;
  }
  followBtn.classList.add("active");
  sx = lerp(sx, x, 0.25);
  sy = lerp(sy, y, 0.25);
  followBtn.style.transform = `translate(${sx - 48}px, ${sy - 48}px)`;
}

function loop(){
  if(!running) return;

  let active = false;
  if(handLandmarker && video.readyState >= 2){
    const now = performance.now();
    const res = handLandmarker.detectForVideo(video, now);
    active = updateFromHand(res);
  }

  if(active){
    setStatus("✍️ Écriture active (main détectée)");
    renderCursor(true);

    if(!hasPrev){
      prevX = sx; prevY = sy;
      hasPrev = true;
    }

    // Écrit tout le temps quand main détectée
    drawLine(prevX, prevY, sx, sy);
    prevX = sx; prevY = sy;

  } else {
    setStatus("Mets ta main dans le cadre…");
    renderCursor(false);
    hasPrev = false;
  }

  requestAnimationFrame(loop);
}

startBtn.addEventListener("click", async ()=>{
  try{
    startBtn.disabled = true;
    setStatus("Caméra…");
    await startCamera();

    setStatus("Modèle main…");
    await loadModel();

    setStatus("OK ✅ Mets ta main, ça écrit");
    running = true;

    // double-tap = clear
    let lastTap = 0;
    window.addEventListener("pointerdown", () => {
      const now = Date.now();
      if(now - lastTap < 300) clearDrawing();
      lastTap = now;
    });

    loop();
  } catch(e){
    console.error(e);
    setStatus("Erreur : HTTPS + autoriser caméra, puis recharge.");
    startBtn.disabled = false;
  }
});