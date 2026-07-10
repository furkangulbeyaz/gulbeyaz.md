// Ekran görüntüsü kırpma için sürükle-bırak alan seçici.
// Seçilen alanı CSS piksel koordinatlarıyla background.js'e AREA_SELECTED mesajıyla iletir.
(function initAreaSelection() {
  if (document.getElementById("mpa-selection-root")) return;

  const root = document.createElement("div");
  root.id = "mpa-selection-root";
  root.innerHTML = `
    <div class="mpa-sel-hint">Analiz edilecek alanı seçmek için sürükleyin · ESC ile iptal</div>
    <div class="mpa-sel-box" hidden></div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    #mpa-selection-root {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      cursor: crosshair;
      background: rgba(15, 23, 42, 0.35);
    }
    #mpa-selection-root .mpa-sel-hint {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      background: #0f172a;
      color: #fff;
      padding: 8px 14px;
      border-radius: 8px;
      font: 600 13px system-ui, sans-serif;
      pointer-events: none;
    }
    #mpa-selection-root .mpa-sel-box {
      position: fixed;
      border: 2px solid #3b82f6;
      background: rgba(59, 130, 246, 0.15);
      box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.35);
      pointer-events: none;
    }
  `;

  document.documentElement.appendChild(style);
  document.documentElement.appendChild(root);

  const box = root.querySelector(".mpa-sel-box");
  let startX = 0;
  let startY = 0;
  let dragging = false;

  const cleanup = () => {
    root.remove();
    style.remove();
    document.removeEventListener("keydown", onKeyDown);
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      chrome.runtime.sendMessage({ type: "AREA_SELECTION_CANCELLED" });
      cleanup();
    }
  };

  document.addEventListener("keydown", onKeyDown);

  root.addEventListener("mousedown", (event) => {
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    box.hidden = false;
    updateBox(startX, startY, startX, startY);
  });

  root.addEventListener("mousemove", (event) => {
    if (!dragging) return;
    updateBox(startX, startY, event.clientX, event.clientY);
  });

  root.addEventListener("mouseup", (event) => {
    if (!dragging) return;
    dragging = false;

    const rect = normalizeRect(startX, startY, event.clientX, event.clientY);
    if (rect.width < 20 || rect.height < 20) {
      chrome.runtime.sendMessage({ type: "AREA_SELECTION_CANCELLED" });
      cleanup();
      return;
    }

    chrome.runtime.sendMessage({ type: "AREA_SELECTED", rect });
    cleanup();
  });

  function updateBox(x1, y1, x2, y2) {
    const rect = normalizeRect(x1, y1, x2, y2);
    box.style.left = `${rect.x}px`;
    box.style.top = `${rect.y}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
  }

  function normalizeRect(x1, y1, x2, y2) {
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    return { x, y, width, height };
  }
})();
