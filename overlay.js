// Analiz sürecinde sayfanın üzerinde gösterilen modal overlay bileşeni.
// background.js'den gelen mesajlarla durum, ilerleme ve hata bilgilerini görüntüler.

const OVERLAY_ID = "md-page-analysis-overlay";

if (!document.getElementById(OVERLAY_ID)) {
  injectStyles();
  createOverlay();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;

  switch (message.type) {
    case "ANALYSIS_STATUS":
      setStatus(message.status, message.detail);
      break;
    case "ANALYSIS_PROGRESS":
      setProgress(message.percent, message.indeterminate);
      break;
    case "ANALYSIS_STREAM":
      appendStreamStats(message.charCount);
      break;
    case "ANALYSIS_DIFF":
      showDiff(message.summary);
      break;
    case "ANALYSIS_SUCCESS":
      showSuccess(message.detail);
      scheduleRemove(1800);
      break;
    case "ANALYSIS_ERROR":
      showError(message.title, message.detail);
      break;
    case "ANALYSIS_CLOSE":
      removeOverlay();
      break;
  }

  sendResponse({ received: true });
  return true;
});

function createOverlay() {
  const root = document.createElement("div");
  root.id = OVERLAY_ID;
  root.innerHTML = `
    <div class="mpa-backdrop">
      <div class="mpa-card" role="dialog" aria-modal="true" aria-labelledby="mpa-title">
        <div class="mpa-icon" id="mpa-icon">⏳</div>
        <h2 id="mpa-title">Analiz başlatılıyor…</h2>
        <p id="mpa-detail" class="mpa-detail">Sayfa taranıyor, lütfen bekleyin.</p>
        <div class="mpa-progress-track">
          <div class="mpa-progress-bar" id="mpa-progress-bar"></div>
        </div>
        <p id="mpa-stream" class="mpa-stream" hidden></p>
        <p id="mpa-diff" class="mpa-diff" hidden></p>
        <button id="mpa-close" class="mpa-close" hidden>Kapat</button>
      </div>
    </div>
  `;
  document.documentElement.appendChild(root);

  root.querySelector("#mpa-close").addEventListener("click", removeOverlay);
}

function setStatus(title, detail) {
  const icon = document.getElementById("mpa-icon");
  const titleEl = document.getElementById("mpa-title");
  const detailEl = document.getElementById("mpa-detail");
  const closeBtn = document.getElementById("mpa-close");

  if (title.includes("düşün") || title.includes("üret")) {
    icon.textContent = "🤖";
  } else if (title.includes("tar")) {
    icon.textContent = "🔍";
  } else if (title.includes("İndir")) {
    icon.textContent = "📥";
  } else {
    icon.textContent = "⏳";
  }

  titleEl.textContent = title;
  detailEl.textContent = detail || "";
  closeBtn.hidden = true;
}

function setProgress(percent, indeterminate = false) {
  const bar = document.getElementById("mpa-progress-bar");
  const track = bar.parentElement;

  if (indeterminate) {
    track.classList.add("mpa-indeterminate");
    bar.style.width = "40%";
    return;
  }

  track.classList.remove("mpa-indeterminate");
  bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
}

function appendStreamStats(charCount) {
  const streamEl = document.getElementById("mpa-stream");
  streamEl.hidden = false;
  streamEl.textContent = `${charCount.toLocaleString("tr-TR")} karakter üretildi…`;
  setProgress(Math.min(95, 30 + Math.floor(charCount / 200)), false);
}

function showDiff(summary) {
  const diffEl = document.getElementById("mpa-diff");
  diffEl.hidden = false;
  diffEl.textContent = `📊 ${summary}`;
}

function showSuccess(detail) {
  document.getElementById("mpa-icon").textContent = "✅";
  document.getElementById("mpa-title").textContent = "Tamamlandı!";
  document.getElementById("mpa-detail").textContent = detail || "Markdown dosyası indirildi.";
  setProgress(100, false);
  document.getElementById("mpa-stream").hidden = true;
}

function showError(title, detail) {
  const root = document.getElementById(OVERLAY_ID);
  root.querySelector(".mpa-card").classList.add("mpa-error");

  document.getElementById("mpa-icon").textContent = "⚠️";
  document.getElementById("mpa-title").textContent = title;
  document.getElementById("mpa-detail").textContent = detail;
  document.getElementById("mpa-stream").hidden = true;
  document.getElementById("mpa-close").hidden = false;

  const track = document.querySelector(".mpa-progress-track");
  track.style.display = "none";
}

function scheduleRemove(delayMs) {
  setTimeout(removeOverlay, delayMs);
}

function removeOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
}

function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
    #${OVERLAY_ID} {
      all: initial;
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    #${OVERLAY_ID} .mpa-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    #${OVERLAY_ID} .mpa-card {
      width: min(420px, 100%);
      background: #fff;
      border-radius: 14px;
      padding: 28px 24px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
      text-align: center;
      color: #0f172a;
    }
    #${OVERLAY_ID} .mpa-card.mpa-error {
      border: 1px solid #fecaca;
    }
    #${OVERLAY_ID} .mpa-icon {
      font-size: 2rem;
      margin-bottom: 12px;
    }
    #${OVERLAY_ID} h2 {
      margin: 0 0 8px;
      font-size: 1.15rem;
      font-weight: 700;
    }
    #${OVERLAY_ID} .mpa-detail {
      margin: 0 0 20px;
      color: #64748b;
      font-size: 0.9rem;
      line-height: 1.5;
    }
    #${OVERLAY_ID} .mpa-progress-track {
      height: 6px;
      background: #e2e8f0;
      border-radius: 999px;
      overflow: hidden;
    }
    #${OVERLAY_ID} .mpa-progress-bar {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #2563eb, #3b82f6);
      border-radius: 999px;
      transition: width 0.3s ease;
    }
    #${OVERLAY_ID} .mpa-indeterminate .mpa-progress-bar {
      animation: mpa-slide 1.4s ease-in-out infinite;
    }
    @keyframes mpa-slide {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(350%); }
    }
    #${OVERLAY_ID} .mpa-stream {
      margin: 14px 0 0;
      font-size: 0.8rem;
      color: #475569;
    }
    #${OVERLAY_ID} .mpa-diff {
      margin: 10px 0 0;
      padding: 10px 12px;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 8px;
      font-size: 0.8rem;
      color: #0c4a6e;
      text-align: left;
      line-height: 1.45;
    }
    #${OVERLAY_ID} .mpa-close {
      margin-top: 18px;
      padding: 8px 16px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #f8fafc;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 600;
      color: #334155;
    }
    #${OVERLAY_ID} .mpa-close:hover {
      background: #e2e8f0;
    }
  `;
  document.documentElement.appendChild(style);
}
