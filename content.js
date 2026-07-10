// Sayfa analiz giriş noktası. executeScript ile enjekte edilir, sonuç background.js'e döner.
function analyzePage() {
  return {
    page: collectPageInfo(),
    dom: analyzeDomStructure(),
    scripts: collectScripts(),
    metaTags: collectMetaTags(),
    stylesheets: collectStylesheets(),
    techStack: detectTechStack(),
  };
}

function collectPageInfo() {
  const charsetMeta = document.querySelector('meta[charset]');
  return {
    url: location.href,
    title: document.title,
    language: document.documentElement.lang || null,
    charset: charsetMeta?.getAttribute("charset") || null,
  };
}

function analyzeDomStructure() {
  const tagCounts = {};
  const semanticTags = new Set([
    "header", "nav", "main", "section", "article",
    "aside", "footer", "figure", "figcaption",
  ]);
  const semanticElements = [];

  let totalElements = 0;
  let maxDepth = 0;

  const walk = (node, depth) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    totalElements++;
    maxDepth = Math.max(maxDepth, depth);

    const tag = node.tagName.toLowerCase();
    tagCounts[tag] = (tagCounts[tag] || 0) + 1;

    if (semanticTags.has(tag)) {
      semanticElements.push({
        tag,
        id: node.id || null,
        classes: Array.from(node.classList),
      });
    }

    for (const child of node.children) {
      walk(child, depth + 1);
    }
  };

  walk(document.documentElement, 0);

  const sortedTagCounts = Object.fromEntries(
    Object.entries(tagCounts).sort((a, b) => b[1] - a[1])
  );

  return {
    totalElements,
    maxDepth,
    rootChildCount: document.documentElement.children.length,
    tagCounts: sortedTagCounts,
    semanticElements,
  };
}

function collectScripts() {
  const scripts = document.querySelectorAll("script");
  const external = [];
  let inline = 0;

  for (const script of scripts) {
    if (script.src) {
      external.push({
        src: script.src,
        type: script.type || null,
        async: script.async,
        defer: script.defer,
      });
    } else {
      inline++;
    }
  }

  return { external, inline };
}

function collectMetaTags() {
  return Array.from(document.querySelectorAll("meta")).map((meta) => ({
    name: meta.getAttribute("name"),
    property: meta.getAttribute("property"),
    httpEquiv: meta.getAttribute("http-equiv"),
    content: meta.getAttribute("content") || "",
  }));
}

function collectStylesheets() {
  return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map((link) => link.href)
    .filter(Boolean);
}

function detectTechStack() {
  const detected = [];
  const add = (name, confidence, evidence) => {
    detected.push({ name, confidence, evidence });
  };

  const scriptSrcs = Array.from(document.scripts)
    .map((s) => s.src)
    .join(" ")
    .toLowerCase();

  const html = document.documentElement.outerHTML.slice(0, 50000).toLowerCase();

  // Framework tespiti
  if (window.__NEXT_DATA__) add("Next.js", "high", "__NEXT_DATA__ present");
  if (window.__NUXT__) add("Nuxt.js", "high", "__NUXT__ present");
  if (document.querySelector("[data-reactroot], [data-reactid]") || window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    add("React", "high", "React root or devtools hook");
  }
  if (window.__VUE__ || document.querySelector("[data-v-]")) {
    add("Vue.js", "high", "__VUE__ or data-v- attributes");
  }
  if (document.querySelector("[ng-version], [ng-app]") || window.ng) {
    add("Angular", "medium", "ng-version / ng-app");
  }
  if (window.Svelte || html.includes("svelte")) {
    add("Svelte", "medium", "Svelte markers");
  }
  if (document.querySelector("astro-island, astro-root")) {
    add("Astro", "high", "astro-island / astro-root");
  }

  // Kütüphane tespiti
  if (window.jQuery || window.$?.fn?.jquery) {
    add("jQuery", "high", `v${window.jQuery?.fn?.jquery || "unknown"}`);
  }
  if (window.React) add("React (runtime)", "high", "window.React");
  if (window.Vue) add("Vue (runtime)", "high", "window.Vue");
  if (window.angular) add("AngularJS", "medium", "window.angular");

  // CMS / platform tespiti
  if (scriptSrcs.includes("wp-content") || document.querySelector('meta[name="generator"][content*="WordPress"]')) {
    add("WordPress", "high", "wp-content or generator meta");
  }
  if (scriptSrcs.includes("shopify") || window.Shopify) {
    add("Shopify", "high", "Shopify scripts");
  }
  if (document.querySelector('meta[name="generator"][content*="Drupal"]')) {
    add("Drupal", "medium", "generator meta");
  }

  // CSS framework tespiti
  if (scriptSrcs.includes("bootstrap") || document.querySelector("[class*='col-'], [class*='container']")) {
    add("Bootstrap", "medium", "bootstrap script or grid classes");
  }
  if (scriptSrcs.includes("tailwind") || html.includes("tailwindcss")) {
    add("Tailwind CSS", "medium", "tailwind references");
  }

  // Analitik araçlar
  if (window.gtag || window.dataLayer) add("Google Analytics / GTM", "high", "gtag or dataLayer");
  if (window.fbq) add("Facebook Pixel", "high", "window.fbq");

  // Build aracı tespiti (script URL'lerinden)
  const urlPatterns = [
    ["webpack", "Webpack"],
    ["vite", "Vite"],
    ["parcel", "Parcel"],
    ["rollup", "Rollup"],
  ];
  for (const [pattern, name] of urlPatterns) {
    if (scriptSrcs.includes(pattern)) {
      add(name, "low", `script URL contains "${pattern}"`);
    }
  }

  return { detected };
}

// executeScript'te son ifadenin dönüş değeri olarak kullanılır
analyzePage();
