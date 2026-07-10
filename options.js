// Ayarlar sayfası mantığı. Kullanıcı tercihlerini chrome.storage.sync üzerinde yönetir.

const STORAGE_KEYS = {
  provider: "aiProvider",
  apiKey: "openaiApiKey",
  model: "openaiModel",
  enableVision: "enableVision",
  screenshotMode: "screenshotMode",
  outputFormat: "outputFormat",
  enableDiff: "enableDiff",
};

const MODELS = {
  openai: [
    { value: "gpt-4o", label: "gpt-4o (Vision destekli)" },
    { value: "gpt-4o-mini", label: "gpt-4o-mini (Vision destekli)" },
    { value: "gpt-4-turbo", label: "gpt-4-turbo" }
  ],
  gemini: [
    { value: "gemini-2.5-pro", label: "gemini-2.5-pro (Vision destekli)" },
    { value: "gemini-2.5-flash", label: "gemini-2.5-flash (Vision destekli)" },
    { value: "gemini-1.5-pro", label: "gemini-1.5-pro (Vision destekli)" },
    { value: "gemini-1.5-flash", label: "gemini-1.5-flash (Vision destekli)" }
  ]
};

const form = document.getElementById("settings-form");
const providerSelect = document.getElementById("provider");
const apiKeyInput = document.getElementById("api-key");
const modelSelect = document.getElementById("model");
const enableVisionInput = document.getElementById("enable-vision");
const screenshotModeSelect = document.getElementById("screenshot-mode");
const outputFormatSelect = document.getElementById("output-format");
const enableDiffInput = document.getElementById("enable-diff");
const toggleKeyBtn = document.getElementById("toggle-key");
const statusEl = document.getElementById("status");
const apiKeyLabel = document.getElementById("api-key-label");
const apiKeyHint = document.getElementById("api-key-hint");

document.addEventListener("DOMContentLoaded", loadSettings);

providerSelect.addEventListener("change", () => {
  updateUIForProvider(providerSelect.value);
});

function updateUIForProvider(provider, selectedModel = null) {
  modelSelect.innerHTML = "";
  MODELS[provider].forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.value;
    opt.textContent = m.label;
    modelSelect.appendChild(opt);
  });
  
  if (selectedModel && MODELS[provider].some(m => m.value === selectedModel)) {
    modelSelect.value = selectedModel;
  }

  if (provider === "openai") {
    apiKeyLabel.textContent = "OpenAI API Anahtarı";
    apiKeyInput.placeholder = "sk-...";
    apiKeyHint.innerHTML = 'Anahtarınızı <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">OpenAI Platform</a> üzerinden oluşturabilirsiniz.';
  } else if (provider === "gemini") {
    apiKeyLabel.textContent = "Gemini API Anahtarı";
    apiKeyInput.placeholder = "AQ....";
    apiKeyHint.innerHTML = 'Anahtarınızı <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a> üzerinden oluşturabilirsiniz.';
  }
}


toggleKeyBtn.addEventListener("click", () => {
  const isPassword = apiKeyInput.type === "password";
  apiKeyInput.type = isPassword ? "text" : "password";
  toggleKeyBtn.textContent = isPassword ? "Gizle" : "Göster";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveSettings();
});

async function loadSettings() {
  const stored = await chrome.storage.sync.get(Object.values(STORAGE_KEYS));

  const provider = stored[STORAGE_KEYS.provider] || "openai";
  providerSelect.value = provider;
  
  updateUIForProvider(provider, stored[STORAGE_KEYS.model]);

  if (stored[STORAGE_KEYS.apiKey]) {
    apiKeyInput.value = stored[STORAGE_KEYS.apiKey];
  }

  enableVisionInput.checked = stored[STORAGE_KEYS.enableVision] !== false;
  screenshotModeSelect.value = stored[STORAGE_KEYS.screenshotMode] || "viewport";
  outputFormatSelect.value = stored[STORAGE_KEYS.outputFormat] || "both";
  enableDiffInput.checked = stored[STORAGE_KEYS.enableDiff] !== false;
}

async function saveSettings() {
  const provider = providerSelect.value;
  const apiKey = apiKeyInput.value.trim();
  const model = modelSelect.value;

  if (!apiKey) {
    showStatus("Lütfen geçerli bir API anahtarı girin.", "error");
    return;
  }

  if (provider === "openai" && !apiKey.startsWith("sk-")) {
    showStatus("OpenAI API anahtarı genellikle 'sk-' ile başlar. Anahtarı kontrol edin.", "error");
    return;
  }

  try {
    await chrome.storage.sync.set({
      [STORAGE_KEYS.provider]: provider,
      [STORAGE_KEYS.apiKey]: apiKey,
      [STORAGE_KEYS.model]: model,
      [STORAGE_KEYS.enableVision]: enableVisionInput.checked,
      [STORAGE_KEYS.screenshotMode]: screenshotModeSelect.value,
      [STORAGE_KEYS.outputFormat]: outputFormatSelect.value,
      [STORAGE_KEYS.enableDiff]: enableDiffInput.checked,
    });
    showStatus("Ayarlar kaydedildi.", "success");
  } catch (error) {
    showStatus(`Kayıt hatası: ${error.message}`, "error");
  }
}

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}
