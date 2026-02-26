const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const box = document.getElementById("box");

const colors = ["#00ffcc", "#ff3b30", "#34c759", "#007aff", "#ffcc00"];
let colorIndex = 0;

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

// Attend qu'un élément existe dans le DOM
function waitFor(selector, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const t = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(t);
        resolve(el);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(t);
        reject(new Error(`Timeout: ${selector}`));
      }
    }, 200);
  });
}

// Force la vidéo à jouer inline sur iPhone
async function forceInlineVideoPlay() {
  const v = document.querySelector("video");
  if (!v) return false;

  // iOS/Safari requirements
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  v.muted = true;          // aide énormément iOS
  v.autoplay = true;

  try {
    await v.play();
  } catch (e) {
    // Sur iOS, play() peut échouer si pas déclenché par un geste user
    return false;
  }
  return true;
}

async function startCameraFlow() {
  setStatus("Démarrage caméra… (tap requis sur iPhone)");
  startBtn && (startBtn.disabled = true);

  // 1) attendre que AR.js crée la balise video
  let video;
  try {
    video = await waitFor("video", 8000);
  } catch (e) {
    setStatus("Je ne trouve pas la vidéo caméra. Vérifie que AR.js est bien chargé.");
    startBtn && (startBtn.disabled = false);
    return;
  }

  // 2) forcer inline + tentative play() plusieurs fois
  for (let k = 0; k < 20; k++) {
    const ok = await forceInlineVideoPlay();
    if (ok) {
      setStatus("Caméra OK ✅ Vise le marqueur Hiro.");
      if (startBtn) startBtn.style.display = "none";
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  setStatus("Caméra toujours noire. Ferme l’onglet, rouvre Safari et retape Start Camera.");
  startBtn && (startBtn.disabled = false);
}

// Start button
if (startBtn) {
  startBtn.addEventListener("click", startCameraFlow);
} else {
  // si pas de bouton, on essaie quand même au 1er tap
  window.addEventListener("click", startCameraFlow, { once: true });
}

// Tap = changer la couleur du cube
window.addEventListener("pointerdown", () => {
  if (!box) return;
  colorIndex = (colorIndex + 1) % colors.length;
  box.setAttribute("color", colors[colorIndex]);
});

// Messages init
setStatus("Clique “Start Camera”, autorise, puis vise le marqueur Hiro.");