const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const box = document.getElementById("box");

const colors = ["#00ffcc", "#ff3b30", "#34c759", "#007aff", "#ffcc00"];
let i = 0;

function setStatus(msg) { statusEl.textContent = msg; }
setStatus("1) Clique Start Camera  2) Autorise  3) Vise le marqueur Hiro");

async function startCameraInline() {
  // La vidéo est créée par AR.js, on attend qu’elle existe
  const tryStart = async () => {
    const v = document.querySelector("video");
    if (!v) return false;

    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.muted = true; // aide iOS à autoriser autoplay
    try { await v.play(); } catch (e) {}
    return true;
  };

  // tente plusieurs fois pendant ~3s
  for (let k = 0; k < 12; k++) {
    const ok = await tryStart();
    if (ok) break;
    await new Promise(r => setTimeout(r, 250));
  }

  setStatus("Caméra lancée. Vise le marqueur Hiro.");
}

startBtn.addEventListener("click", async () => {
  await startCameraInline();
  startBtn.style.display = "none";
});

// Tap = changer couleur
window.addEventListener("pointerdown", () => {
  i = (i + 1) % colors.length;
  if (box) box.setAttribute("color", colors[i]);
});
