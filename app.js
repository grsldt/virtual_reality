import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18";

const video = document.getElementById("video");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const followBtn = document.getElementById("followBtn");

const drawCanvas = document.getElementById("draw");
const dctx = drawCanvas.getContext("2d", { alpha: true });

function setStatus(msg){ statusEl.textContent = msg; }
const lerp = (a,b,t)=> a + (b-a)*t;
const clamp = (v,a,b)=> Math.max(a, Math.min(b, v));

function resize(){
  drawCanvas.width = Math.floor(window.innerWidth * devicePixelRatio);
  drawCanvas.height = Math.floor(window.innerHeight * devicePixelRatio);
  dctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
window.addEventListener("resize", resize);
resize();

let handLandmarker = null;
let running = false;

// position lissée index
let x=0, y=0, sx=0, sy=0;
let hasPrev = false;
let pinch01 = 0;
let penDown = false;

function dist(ax,ay,bx,by){ return Math.hypot(ax-bx, ay-by); }

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

function clearDrawing(){
  dctx.clearRect(0,0,window.innerWidth, window.innerHeight);
}

// Dessin “pro” : trait lissé + épaisseur selon pinch
function drawLine(x1,y1,x2,y2,pressure){
  const w = 3 + pressure * 10; // 3..13
  dctx.lineCap = "round";
  dctx.lineJoin = "round";
  dctx.strokeStyle = "rgba(0,220,255,0.85)";
  dctx.lineWidth = w;

  dctx.beginPath();
  dctx.moveTo(x1,y1);
  dctx.lineTo(x2,y2);
  dctx.stroke();
}

function updateFromHand(res){
  if(!res?.landmarks?.length) return false;

  const lm = res.landmarks[0];

  // index tip
  const tip = lm[8];
  x = tip.x * window.innerWidth;
  y = tip.y * window.innerHeight;

  // pinch
  const th = lm[4];
  const thx = th.x * window.innerWidth;
  const thy = th.y * window.innerHeight;
  const d = dist(x,y, thx, thy);

  const p = 1 - clamp((d - 20) / (140 - 20), 0, 1); // 0 open, 1 pinch
  pinch01 = lerp(pinch01, p, 0.25);

  // stylo ON si pinch assez fermé
  penDown = pinch01 > 0.55;

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
  followBtn.style.transform = `translate(${sx - 48}px, ${sy - 48}px) scale(${1 + pinch01*0.4})`;
}

let prevX=0, prevY=0;

function loop(){
  if(!running) return;

  let active = false;

  if(handLandmarker && video.readyState >= 2){
    const now = performance.now();
    const res = handLandmarker.detectForVideo(video, now);
    active = updateFromHand(res);
  }

  if(active){
    setStatus(penDown ? "✍️ Écriture (pinch)" : "Main détectée ✅ (pinch pour écrire)");
    renderCursor(true);

    // dessin
    if(!hasPrev){
      prevX = sx; prevY = sy;
      hasPrev = true;
    }

    if(penDown){
      drawLine(prevX, prevY, sx, sy, pinch01);
    }

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

    setStatus("OK ✅ Pinch (pouce-index) pour écrire");
    running = true;

    // double-tap écran = effacer
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