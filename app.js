const statusEl = document.getElementById("status");
const followBtn = document.getElementById("followBtn");

statusEl.textContent = "JS OK ✅ (app.js chargé)";

// bouge le bouton juste pour prouver que ça marche
let t = 0;
function test() {
  t += 0.03;
  const x = 50 + Math.cos(t) * 80;
  const y = 150 + Math.sin(t) * 80;
  followBtn.style.transform = `translate(${x}px, ${y}px)`;
  requestAnimationFrame(test);
}
test();