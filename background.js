// Eklentinin ana service worker dosyası.
// Bağlam menüsünü yönetir, sayfa analizini tetikler, AI API'ye istek atar ve çıktıyı indirir.

importScripts("lib/jszip.min.js", "utils/diff.js", "utils/scaffold.js");

const MENU_ID = "create-md-analysis";

const STORAGE_KEYS = {
  provider: "aiProvider",
  apiKey: "openaiApiKey",
  model: "openaiModel",
  enableVision: "enableVision",
  screenshotMode: "screenshotMode",
  outputFormat: "outputFormat",
  enableDiff: "enableDiff",
};

const DEFAULT_CONFIG = {
  endpoint: "https://api.openai.com/v1/chat/completions",
  model: "gpt-4o",
};

const USER_PROMPT_TEMPLATE = `Sen uzman bir Yazılım Mimarı ve Full-stack Geliştiricisin.
Sana bir web sitesinin teknik analiz verilerini (JSON) gönderiyorum.
{{VISION_NOTE}}
{{DIFF_NOTE}}

Senin görevin, bu siteyi modern teknolojilerle (Next.js, Tailwind CSS, shadcn/ui) sıfırdan inşa etmek için gereken
detaylı bir "Yol Haritası ve Süper Prompt" dosyası (.md) hazırlamak.

Girdi verisi: {{ANALYZED_JSON_DATA}}

Lütfen oluşturacağın Markdown dosyasında şu bölümlere yer ver:

1. **Proje Mimarisi:** Tespit edilen teknoloji yığınına (stack) göre önerdiğin klasör yapısı (örneğin: /components, /hooks, /lib).
2. **Bağımlılıklar (Dependencies):** İhtiyaç duyulan npm paketleri (örn: lucide-react, framer-motion, three.js vb.).
3. **Kritik Kod Yapısı:** Siteyi analiz ettiğin verilere dayanarak, sayfadaki ana bileşenlerin (Header, Hero, Main Content) nasıl modellenmesi gerektiğini anlatan "Pseudo-code" veya şema açıklamaları.
4. **Süper Prompt:** Kullanıcının, kod yazan bir başka AI modeline (Cursor, Claude, GPT-4) yapıştırıp doğrudan profesyonel kod alabileceği kapsamlı bir "Master Prompt".
   - Bu Master Prompt içinde: Tasarım dili, kullanılacak kütüphane versiyonları, responsive kuralları ve state yönetimi mutlaka belirtilmeli.
5. **Değişim Raporu:** (Eğer diff verisi varsa) Önceki analize göre sitede nelerin değiştiğini özetle.
6. **Proje Dosyaları (Scaffold):** Çalışır bir Next.js projesi için dosyaları şu formatta ver:
### FILE: src/app/page.tsx
\`\`\`tsx
// kod
\`\`\`
En az şu dosyaları üret: src/app/page.tsx, src/app/layout.tsx, src/components/Header.tsx ve sayfadaki ana bileşenler.

Çıktıyı tamamen bir Markdown (.md) dosyası olacak şekilde yapılandır. Gereksiz giriş cümlelerini kısalt, doğrudan teknik aksiyona odaklan.`;

const SYSTEM_PROMPT =
  "Yalnızca geçerli Markdown (.md) formatında yanıt ver. Kod blokları, başlıklar ve listeler kullan. Scaffold bölümünde her dosya için '### FILE: yol/dosya.ext' formatını kullan. Giriş cümlesi veya sohbet tarzı açıklama ekleme.";

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Create .md Analysis",
    contexts: ["page"],
  });

  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;

  try {
    const settings = await getSettings();
    validateSettings(settings);

    let screenshot = null;

    if (settings.enableVision) {
      if (settings.screenshotMode === "selection") {
        screenshot = await captureSelectedAreaScreenshot(tab);
      } else {
        screenshot = await captureViewportScreenshot(tab);
      }
    }

    await injectOverlay(tab.id);

    await notifyOverlay(tab.id, {
      type: "ANALYSIS_STATUS",
      status: "Sayfa taranıyor…",
      detail: settings.enableVision
        ? "DOM, teknoloji yığını ve ekran görüntüsü analiz ediliyor."
        : "DOM yapısı, scriptler ve teknoloji yığını analiz ediliyor.",
    });
    await notifyOverlay(tab.id, {
      type: "ANALYSIS_PROGRESS",
      percent: 15,
      indeterminate: true,
    });

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });

    const origin = new URL(result.page.url).origin;
    let diffReport = null;

    if (settings.enableDiff) {
      const previous = await loadPreviousAnalysis(origin);
      diffReport = computeAnalysisDiff(previous, result);
      result.diffReport = diffReport;

      if (diffReport.hasPrevious) {
        await notifyOverlay(tab.id, {
          type: "ANALYSIS_DIFF",
          summary: diffReport.summary,
        });
      }

      await saveAnalysisSnapshot(origin, result);
    }

    if (screenshot) {
      result.screenshot = {
        mode: settings.screenshotMode,
        captured: true,
        // Base64 veriyi JSON'a gömmüyoruz; prompt'ta vision image olarak gönderiliyor
      };
    }

    const messages = buildApiMessages(result, { screenshot, diffReport, settings });

    await notifyOverlay(tab.id, {
      type: "ANALYSIS_STATUS",
      status: "AI düşünüyor…",
      detail: settings.enableVision
        ? "Görsel + teknik verilerle yol haritası oluşturuluyor."
        : "Yol haritası ve Süper Prompt oluşturuluyor.",
    });
    await notifyOverlay(tab.id, {
      type: "ANALYSIS_PROGRESS",
      percent: 30,
      indeterminate: false,
    });

    const markdown = await requestMarkdownStream(messages, settings, tab.id);

    await notifyOverlay(tab.id, {
      type: "ANALYSIS_STATUS",
      status: "İndiriliyor…",
      detail: "Dosyalar hazırlanıyor.",
    });
    await notifyOverlay(tab.id, {
      type: "ANALYSIS_PROGRESS",
      percent: 95,
      indeterminate: false,
    });

    const downloads = [];

    if (settings.outputFormat === "markdown" || settings.outputFormat === "both") {
      await downloadMarkdown(markdown, tab);
      downloads.push("Markdown (.md)");
    }

    if (settings.outputFormat === "zip" || settings.outputFormat === "both") {
      const zipResult = await buildAndDownloadZip(markdown, tab);
      downloads.push(`Next.js ZIP (${zipResult.fileCount} dosya)`);
    }

    await notifyOverlay(tab.id, {
      type: "ANALYSIS_SUCCESS",
      detail: `${downloads.join(" + ")} başarıyla indirildi.`,
    });
  } catch (error) {
    const userError = mapError(error);

    if (tab?.id) {
      await notifyOverlay(tab.id, {
        type: "ANALYSIS_ERROR",
        title: userError.title,
        detail: userError.detail,
      });
    }

    console.error("[MD Page Analysis]", error);
  }
});

async function getSettings() {
  const stored = await chrome.storage.sync.get(Object.values(STORAGE_KEYS));
  const provider = stored[STORAGE_KEYS.provider] || "openai";
  return {
    provider,
    apiKey: stored[STORAGE_KEYS.apiKey] || "",
    model: stored[STORAGE_KEYS.model] || (provider === "gemini" ? "gemini-2.5-flash" : DEFAULT_CONFIG.model),
    endpoint: DEFAULT_CONFIG.endpoint,
    enableVision: stored[STORAGE_KEYS.enableVision] !== false,
    screenshotMode: stored[STORAGE_KEYS.screenshotMode] || "viewport",
    outputFormat: stored[STORAGE_KEYS.outputFormat] || "both",
    enableDiff: stored[STORAGE_KEYS.enableDiff] !== false,
  };
}

function validateSettings(settings) {
  if (!settings.apiKey) {
    const error = new Error("MISSING_API_KEY");
    error.code = "MISSING_API_KEY";
    throw error;
  }

  if (settings.provider === "openai" && !settings.apiKey.startsWith("sk-")) {
    const error = new Error("INVALID_API_KEY_FORMAT");
    error.code = "INVALID_API_KEY_FORMAT";
    throw error;
  }
}

function buildApiMessages(analysis, { screenshot, diffReport, settings }) {
  const payload = { ...analysis };
  delete payload.screenshot;

  const analyzedJson = JSON.stringify(payload, null, 2);

  const visionNote = screenshot
    ? "Ek olarak sayfanın ekran görüntüsü (screenshot) görsel bağlam olarak eklendi. Padding, margin, renk paleti ve tipografi çıkarımını bu görselden yap."
    : "";

  const diffNote = diffReport?.hasPrevious
    ? `Değişim raporu (diff):\n${formatDiffForPrompt(diffReport)}`
    : "Bu site için önceki analiz kaydı yok (ilk tarama).";

  const textPrompt = USER_PROMPT_TEMPLATE.replace("{{ANALYZED_JSON_DATA}}", analyzedJson)
    .replace("{{VISION_NOTE}}", visionNote)
    .replace("{{DIFF_NOTE}}", diffNote);

  const userContent = screenshot
    ? [
        { type: "text", text: textPrompt },
        {
          type: "image_url",
          image_url: { url: screenshot, detail: "high" },
        },
      ]
    : textPrompt;

  return {
    system: SYSTEM_PROMPT,
    user: userContent,
  };
}

async function captureViewportScreenshot(tab) {
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png",
  });
  return dataUrl;
}

async function captureSelectedAreaScreenshot(tab) {
  const selectionPromise = waitForAreaSelection(tab.id);

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["selection.js"],
  });

  const rect = await selectionPromise;
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png",
  });

  const [{ result: cropped }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: cropScreenshot,
    args: [dataUrl, rect],
  });

  return cropped;
}

function waitForAreaSelection(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener);
      reject(Object.assign(new Error("AREA_SELECTION_TIMEOUT"), { code: "AREA_SELECTION_TIMEOUT" }));
    }, 60000);

    const listener = (message, sender) => {
      if (sender.tab?.id !== tabId) return;

      if (message.type === "AREA_SELECTED") {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(listener);
        resolve(message.rect);
      }

      if (message.type === "AREA_SELECTION_CANCELLED") {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(listener);
        reject(Object.assign(new Error("AREA_SELECTION_CANCELLED"), { code: "AREA_SELECTION_CANCELLED" }));
      }
    };

    chrome.runtime.onMessage.addListener(listener);
  });
}

function cropScreenshot(dataUrl, rect) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const dpr = window.devicePixelRatio || 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(
        img,
        rect.x * dpr,
        rect.y * dpr,
        rect.width * dpr,
        rect.height * dpr,
        0,
        0,
        canvas.width,
        canvas.height
      );
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Screenshot crop failed"));
    img.src = dataUrl;
  });
}

async function requestMarkdownStream({ system, user }, settings, tabId) {
  let response;
  const isGemini = settings.provider === "gemini";
  let fetchUrl = settings.endpoint;
  let fetchHeaders = { "Content-Type": "application/json" };
  let fetchBody = {};

  if (isGemini) {
    fetchUrl = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:streamGenerateContent?alt=sse&key=${settings.apiKey}`;
    
    let parts = [];
    if (Array.isArray(user)) {
      parts.push({ text: user[0].text });
      const base64Data = user[1].image_url.url.split(",")[1];
      const mimeType = user[1].image_url.url.split(";")[0].split(":")[1];
      parts.push({ inlineData: { mimeType, data: base64Data } });
    } else {
      parts.push({ text: user });
    }

    fetchBody = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.4 }
    };
  } else {
    fetchHeaders.Authorization = `Bearer ${settings.apiKey}`;
    fetchBody = {
      model: settings.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.4,
      stream: true,
    };
  }

  try {
    response = await fetch(fetchUrl, {
      method: "POST",
      headers: fetchHeaders,
      body: JSON.stringify(fetchBody),
    });
  } catch (networkError) {
    const error = new Error("NETWORK_ERROR");
    error.code = "NETWORK_ERROR";
    error.cause = networkError;
    throw error;
  }

  if (!response.ok) {
    const apiError = await parseApiError(response);
    throw apiError;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;

      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }

      let delta = "";
      if (settings.provider === "gemini") {
        delta = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
      } else {
        delta = parsed.choices?.[0]?.delta?.content || "";
      }

      if (!delta) continue;

      fullContent += delta;

      await notifyOverlay(tabId, {
        type: "ANALYSIS_STREAM",
        charCount: fullContent.length,
      });
    }
  }

  if (!fullContent.trim()) {
    const error = new Error("EMPTY_RESPONSE");
    error.code = "EMPTY_RESPONSE";
    throw error;
  }

  return fullContent;
}

async function buildAndDownloadZip(markdown, tab) {
  const projectName = sanitizeProjectName(tab.title);
  const { blob, fileCount } = await buildProjectZip(markdown, projectName);
  const dataUrl = await blobToDataUrl(blob);

  await chrome.downloads.download({
    url: dataUrl,
    filename: `${projectName}-nextjs.zip`,
    saveAs: true,
  });

  return { fileCount };
}

async function parseApiError(response) {
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = { error: { message: await response.text() } };
  }

  const apiMessage = body?.error?.message || "Bilinmeyen API hatası";
  const error = new Error(apiMessage);
  error.status = response.status;
  error.apiMessage = apiMessage;
  return error;
}

function mapError(error) {
  if (error.code === "MISSING_API_KEY") {
    return {
      title: "API anahtarı bulunamadı",
      detail:
        "Eklenti ayarlarından API anahtarınızı girin. Sağ tık → Eklentiler → MD Page Analysis → Ayarlar.",
    };
  }

  if (error.code === "INVALID_API_KEY_FORMAT") {
    return {
      title: "Geçersiz API anahtarı formatı",
      detail: "API anahtarı formatı hatalı. Ayarlar sayfasından anahtarınızı kontrol edin.",
    };
  }

  if (error.code === "AREA_SELECTION_CANCELLED") {
    return {
      title: "Alan seçimi iptal edildi",
      detail: "Screenshot alınmadı. Tekrar deneyin veya ayarlardan 'Görünür alan' modunu seçin.",
    };
  }

  if (error.code === "AREA_SELECTION_TIMEOUT") {
    return {
      title: "Alan seçimi zaman aşımı",
      detail: "60 saniye içinde alan seçilmedi. Lütfen tekrar deneyin.",
    };
  }

  if (error.code === "NETWORK_ERROR") {
    return {
      title: "Bağlantı hatası",
      detail: "OpenAI API'ye ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
    };
  }

  if (error.code === "EMPTY_RESPONSE") {
    return {
      title: "Boş yanıt",
      detail: "AI geçerli bir Markdown içeriği üretmedi. Farklı bir model seçerek tekrar deneyin.",
    };
  }

  if (error.message?.includes("Cannot access contents of")) {
    return {
      title: "Bu sayfada analiz yapılamaz",
      detail: "Chrome dahili sayfaları (chrome://) veya kısıtlı sayfalar desteklenmez.",
    };
  }

  const status = error.status;
  const apiMessage = error.apiMessage || error.message || "";

  if (status === 401 || (status === 400 && apiMessage.toLowerCase().includes("api key"))) {
    return {
      title: "Geçersiz API anahtarı",
      detail: "API anahtarınız hatalı veya süresi dolmuş. Ayarlar sayfasından güncelleyin.",
    };
  }

  if (status === 403) {
    return {
      title: "Erişim reddedildi",
      detail: apiMessage || "API anahtarınızın bu modele erişim izni yok.",
    };
  }

  if (status === 429) {
    const isQuota = /quota|billing|insufficient/i.test(apiMessage);
    return {
      title: isQuota ? "Kota aşıldı" : "Çok fazla istek",
      detail: isQuota
        ? "API kotanız dolmuş. İlgili sağlayıcının platformu üzerinden bakiye ve kullanım limitlerinizi kontrol edin."
        : "İstek limitine ulaşıldı. Birkaç dakika bekleyip tekrar deneyin.",
    };
  }

  if (status === 500 || status === 502 || status === 503) {
    return {
      title: "OpenAI sunucu hatası",
      detail: "Servis geçici olarak kullanılamıyor. Lütfen daha sonra tekrar deneyin.",
    };
  }

  return {
    title: "Analiz başarısız",
    detail: apiMessage || error.message || "Beklenmeyen bir hata oluştu.",
  };
}

async function injectOverlay(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["overlay.js"],
  });
}

async function notifyOverlay(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Overlay henüz hazır değilse mesajı sessizce yoksay
  }
}

function sanitizeFilename(title) {
  const base = (title || "roadmap")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  return `${base || "roadmap"}-analysis.md`;
}

function sanitizeProjectName(title) {
  return (title || "rebuilt-site")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "rebuilt-site";
}

async function downloadMarkdown(markdown, tab) {
  const filename = sanitizeFilename(tab.title);
  const url = `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`;

  await chrome.downloads.download({
    url,
    filename,
    saveAs: true,
  });
}
