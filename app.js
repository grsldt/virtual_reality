import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18";

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const switchBtn = document.getElementById("switchBtn");

function setStatus(msg){ statusEl.textContent = msg; }

function resize(){
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

let stream = null;
let currentFacing = "environment"; // start arrière
let handLandmarker = null;
let running = false;

// ================= CAMERA =================

async function stopCamera(){
  if(stream){
    stream.getTracks().forEach(t=>t.stop());
    stream = null;
  }
}

async function startCamera(){
  await stopCamera();

  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: currentFacing },
    audio: false
  });

  video.srcObject = stream;
  video.setAttribute("playsinline", "");
  await video.play();
}

// ================= HAND =================

async function loadModel(){
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
  );

  handLandmarker = await HandLandmarker.createFromOptions(vision,{
    baseOptions:{
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
    },
    runningMode:"VIDEO",
    numHands:1
  });
}

// ================= VISUAL =================

let x=window.innerWidth/2;
let y=window.innerHeight/2;

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  ctx.beginPath();
  ctx.arc(x,y,20,0,Math.PI*2);
  ctx.fillStyle="rgba(0,255,200,0.8)";
  ctx.fill();
}

function updateFromHand(res){
  if(!res.landmarks.length) return;

  const lm = res.landmarks[0][8]; // index tip

  let screenX = lm.x * window.innerWidth;
  let screenY = lm.y * window.innerHeight;

  // IMPORTANT :
  // Si caméra AVANT -> miroir ON
  if(currentFacing === "user"){
    screenX = (1 - lm.x) * window.innerWidth;
  }

  x = screenX;
  y = screenY;
}

// ================= LOOP =================

function loop(){
  if(!running) return;

  const now = performance.now();
  const res = handLandmarker.detectForVideo(video, now);
  updateFromHand(res);

  draw();
  requestAnimationFrame(loop);
}

// ================= UI =================

startBtn.onclick = async ()=>{
  startBtn.disabled = true;

  await startCamera();
  await loadModel();

  switchBtn.disabled = false;
  running = true;
  setStatus("OK ✅");
  loop();
};

switchBtn.onclick = async ()=>{
  currentFacing = currentFacing === "environment" ? "user" : "environment";
  setStatus("Switch caméra...");

  await startCamera();

  setStatus(currentFacing === "user" ? "Caméra avant (miroir ON)" : "Caméra arrière");
};