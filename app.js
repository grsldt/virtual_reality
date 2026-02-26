const statusEl = document.getElementById("status");
const box = document.getElementById("box");
const colors = ["#00ffcc", "#ff3b30", "#34c759", "#007aff", "#ffcc00"];
let i = 0;

function setStatus(msg) {
  statusEl.textContent = msg;
}

setStatus("Autorise la caméra, puis vise le marqueur Hiro.");

window.addEventListener("pointerdown", () => {
  i = (i + 1) % colors.length;
  if (box) box.setAttribute("color", colors[i]);
  setStatus("Tape pour changer la couleur (vise Hiro).");
});


setInterval(() => {
  const v = document.querySelector("video");
  if (v) {
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
  }
}, 500);