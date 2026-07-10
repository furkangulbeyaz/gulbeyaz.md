// İki sayfa analiz anlık görüntüsü arasındaki farkı hesaplar.
// Service worker'da importScripts ile kullanılabilmek için global olarak tanımlanır.
function getAnalysisStorageKey(origin) {
  return `analysisHistory:${origin}`;
}

function computeAnalysisDiff(previous, current) {
  if (!previous) {
    return {
      hasPrevious: false,
      summary: "Bu site için ilk analiz. Önceki kayıt bulunamadı.",
      changes: [],
    };
  }

  const changes = [];

  const prevTech = new Set(previous.techStack?.detected?.map((t) => t.name) || []);
  const currTech = new Set(current.techStack?.detected?.map((t) => t.name) || []);

  const addedTech = [...currTech].filter((t) => !prevTech.has(t));
  const removedTech = [...prevTech].filter((t) => !currTech.has(t));

  if (addedTech.length) {
    changes.push({ type: "tech_added", items: addedTech });
  }
  if (removedTech.length) {
    changes.push({ type: "tech_removed", items: removedTech });
  }

  const prevScripts = new Set(previous.scripts?.external?.map((s) => s.src) || []);
  const currScripts = new Set(current.scripts?.external?.map((s) => s.src) || []);

  const addedScripts = [...currScripts].filter((s) => !prevScripts.has(s));
  const removedScripts = [...prevScripts].filter((s) => !currScripts.has(s));

  if (addedScripts.length) {
    changes.push({ type: "scripts_added", count: addedScripts.length, items: addedScripts.slice(0, 10) });
  }
  if (removedScripts.length) {
    changes.push({ type: "scripts_removed", count: removedScripts.length, items: removedScripts.slice(0, 10) });
  }

  const prevStyles = new Set(previous.stylesheets || []);
  const currStyles = new Set(current.stylesheets || []);
  const addedStyles = [...currStyles].filter((s) => !prevStyles.has(s));

  if (addedStyles.length) {
    changes.push({ type: "stylesheets_added", count: addedStyles.length, items: addedStyles.slice(0, 5) });
  }

  const domDelta = (current.dom?.totalElements || 0) - (previous.dom?.totalElements || 0);
  if (domDelta !== 0) {
    changes.push({
      type: "dom_elements_delta",
      previous: previous.dom?.totalElements || 0,
      current: current.dom?.totalElements || 0,
      delta: domDelta,
    });
  }

  const daysSince = Math.floor(
    (Date.now() - (previous.savedAt || 0)) / (1000 * 60 * 60 * 24)
  );

  const summaryParts = [];
  if (addedTech.length) summaryParts.push(`${addedTech.length} yeni teknoloji (${addedTech.join(", ")})`);
  if (removedTech.length) summaryParts.push(`${removedTech.length} teknoloji kaldırıldı`);
  if (addedScripts.length) summaryParts.push(`${addedScripts.length} yeni script eklendi`);
  if (addedStyles.length) summaryParts.push(`${addedStyles.length} yeni stylesheet`);
  if (domDelta !== 0) summaryParts.push(`DOM element sayısı ${domDelta > 0 ? "+" : ""}${domDelta}`);

  return {
    hasPrevious: true,
    previousAnalyzedAt: previous.savedAt,
    daysSinceLastAnalysis: daysSince,
    summary:
      summaryParts.length > 0
        ? `Önceki analizden (${daysSince} gün önce) bu yana: ${summaryParts.join("; ")}.`
        : `Önceki analizden (${daysSince} gün önce) bu yana önemli bir değişiklik tespit edilmedi.`,
    changes,
    addedTechnologies: addedTech,
    removedTechnologies: removedTech,
    addedScriptsCount: addedScripts.length,
    addedStylesheetsCount: addedStyles.length,
  };
}

async function loadPreviousAnalysis(origin) {
  const key = getAnalysisStorageKey(origin);
  const stored = await chrome.storage.local.get(key);
  return stored[key] || null;
}

async function saveAnalysisSnapshot(origin, analysis) {
  const key = getAnalysisStorageKey(origin);
  await chrome.storage.local.set({
    [key]: {
      savedAt: Date.now(),
      page: analysis.page,
      dom: {
        totalElements: analysis.dom?.totalElements,
        maxDepth: analysis.dom?.maxDepth,
        tagCounts: analysis.dom?.tagCounts,
      },
      scripts: analysis.scripts,
      metaTags: analysis.metaTags,
      stylesheets: analysis.stylesheets,
      techStack: analysis.techStack,
    },
  });
}

function formatDiffForPrompt(diffReport) {
  return JSON.stringify(diffReport, null, 2);
}
