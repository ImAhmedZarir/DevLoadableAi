export interface ProjectFile {
  path: string;
  content: string;
  is_upload?: boolean;
}

export interface BuildPreviewDocOptions {
  files: ProjectFile[];
  page?: string;
  projectId?: string;
  initialStorage?: Record<string, string> | null;
}

function normalizePath(p: string): string {
  return p.replace(/^[./\\]+/, "").replace(/\\/g, "/");
}

function resolveRelativePath(basePage: string, relativePath: string): string {
  if (relativePath.startsWith("/")) {
    return normalizePath(relativePath);
  }
  const baseDirParts = normalizePath(basePage).split("/");
  baseDirParts.pop(); // remove filename
  const relParts = relativePath.split("/");

  for (const part of relParts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      baseDirParts.pop();
    } else {
      baseDirParts.push(part);
    }
  }
  return baseDirParts.join("/");
}

function findFile(files: ProjectFile[], targetPath: string): ProjectFile | undefined {
  const normalized = normalizePath(targetPath);
  const exact = files.find((f) => normalizePath(f.path) === normalized);
  if (exact) return exact;

  const caseMatch = files.find(
    (f) => normalizePath(f.path).toLowerCase() === normalized.toLowerCase(),
  );
  if (caseMatch) return caseMatch;

  if (normalized.endsWith(".js")) {
    const base = normalized.slice(0, -3);
    for (const altExt of [".ts", ".tsx", ".jsx", ".mjs"]) {
      const alt = files.find(
        (f) => normalizePath(f.path).toLowerCase() === (base + altExt).toLowerCase(),
      );
      if (alt) return alt;
    }
  }

  if (normalized.endsWith(".css")) {
    const base = normalized.slice(0, -4);
    const scss = files.find(
      (f) => normalizePath(f.path).toLowerCase() === (base + ".scss").toLowerCase(),
    );
    if (scss) return scss;
  }

  return undefined;
}

function getMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "svg":
      return "image/svg+xml";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "ico":
      return "image/x-icon";
    case "css":
      return "text/css";
    case "js":
    case "mjs":
      return "text/javascript";
    case "json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

function fileToDataUri(file: ProjectFile): string {
  if (file.content.startsWith("data:")) {
    return file.content;
  }
  const mime = getMimeType(file.path);
  if (file.path.toLowerCase().endsWith(".svg")) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(file.content)}`;
  }
  try {
    // If running in browser, btoa might be available; in node/vitest, Buffer is available
    if (typeof Buffer !== "undefined") {
      const b64 = Buffer.from(file.content, "utf8").toString("base64");
      return `data:${mime};base64,${b64}`;
    }
    if (typeof window !== "undefined" && typeof window.btoa === "function") {
      return `data:${mime};base64,${window.btoa(unescape(encodeURIComponent(file.content)))}`;
    }
  } catch {
    // Fallback
  }
  return `data:${mime};utf8,${encodeURIComponent(file.content)}`;
}

/**
 * Replace local CSS url(...) references with data URIs
 */
function inlineCssUrls(cssContent: string, currentFile: string, files: ProjectFile[]): string {
  return cssContent.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote, url) => {
    const trimmed = url.trim();
    if (/^(https?:|\/\/|data:|blob:|#)/i.test(trimmed)) {
      return match;
    }
    const resolved = resolveRelativePath(currentFile, trimmed);
    const targetFile = findFile(files, resolved);
    if (!targetFile) {
      return match;
    }
    const dataUri = fileToDataUri(targetFile);
    return `url("${dataUri}")`;
  });
}

/**
 * Self-contained in-memory storage shim script for standalone / published links.
 * Prevents SecurityError on window.localStorage / sessionStorage in sandboxed contexts.
 */
export function getStorageShimScript(): string {
  return `
(function() {
  function createMemStorage() {
    var data = {};
    return {
      getItem: function(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function(k, v) { data[k] = String(v); },
      removeItem: function(k) { delete data[k]; },
      clear: function() { data = {}; },
      key: function(i) { return Object.keys(data)[i] !== undefined ? Object.keys(data)[i] : null; },
      get length() { return Object.keys(data).length; }
    };
  }
  try {
    var t = '__dl_test__';
    window.localStorage.setItem(t, '1');
    window.localStorage.removeItem(t);
    window.sessionStorage.setItem(t, '1');
    window.sessionStorage.removeItem(t);
  } catch(e) {
    try {
      Object.defineProperty(window, 'localStorage', { value: createMemStorage(), configurable: true, writable: true });
      Object.defineProperty(window, 'sessionStorage', { value: createMemStorage(), configurable: true, writable: true });
    } catch(err) {}
  }
})();
`.trim();
}

/**
 * Builds the runtime script injected into the preview iframe <head>.
 */
function buildInjectedRuntimeScript(
  initialStorage?: Record<string, string> | null,
  files?: ProjectFile[],
): string {
  const safeStorageJson = JSON.stringify(initialStorage || {})
    .replace(/<\/script/gi, "<\\/script")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

  const virtualFiles: Record<string, { content: string; mime: string }> = {};
  for (const f of files ?? []) {
    const norm = normalizePath(f.path);
    const mime = getMimeType(f.path);
    virtualFiles[norm] = { content: f.content, mime };
    virtualFiles["/" + norm] = { content: f.content, mime };
    virtualFiles["./" + norm] = { content: f.content, mime };
  }
  const safeFilesJson = JSON.stringify(virtualFiles)
    .replace(/<\/script/gi, "<\\/script")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

  return `
<script id="__dl_preview_runtime__">
(function() {
  var MAX_CONSOLE_MSGS = 200;
  var consoleMsgCount = 0;
  var initialStorage = ${safeStorageJson};
  var virtualFiles = ${safeFilesJson};

  // --- VIRTUAL FETCH INTERCEPTOR FOR PROJECT FILES ---
  var origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function(input, init) {
      try {
        var urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
        var cleanUrl = urlStr.split('#')[0].split('?')[0].replace(/^[./\\]+/, '').replace(/^https?:\\/\\/[^/]+\\//, '');
        if (cleanUrl && Object.prototype.hasOwnProperty.call(virtualFiles, cleanUrl)) {
          var vf = virtualFiles[cleanUrl];
          return Promise.resolve(new Response(vf.content, {
            status: 200,
            headers: { 'Content-Type': vf.mime }
          }));
        }
      } catch(e) {}
      return origFetch.apply(this, arguments);
    };
  }

  function sendParent(payload) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, '*');
      }
    } catch(e) {}
  }

  // --- STORAGE SHIM & SYNC ---
  var storageTimer = null;
  var pendingStorageChanges = {};

  function flushStorageChanges() {
    for (var k in pendingStorageChanges) {
      sendParent({ type: 'dl-storage', key: k, value: pendingStorageChanges[k] });
    }
    pendingStorageChanges = {};
  }

  function notifyStorage(key, val) {
    pendingStorageChanges[key] = val;
    if (storageTimer) clearTimeout(storageTimer);
    storageTimer = setTimeout(flushStorageChanges, 200);
  }

  function createMemoryStorage(initial) {
    var store = Object.assign({}, initial || {});
    return {
      getItem: function(k) {
        return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
      },
      setItem: function(k, v) {
        var str = String(v);
        store[k] = str;
        notifyStorage(k, str);
      },
      removeItem: function(k) {
        if (Object.prototype.hasOwnProperty.call(store, k)) {
          delete store[k];
          notifyStorage(k, null);
        }
      },
      clear: function() {
        for (var k in store) {
          delete store[k];
          notifyStorage(k, null);
        }
      },
      key: function(idx) {
        var keys = Object.keys(store);
        return keys[idx] !== undefined ? keys[idx] : null;
      },
      get length() {
        return Object.keys(store).length;
      }
    };
  }

  var isRealStorageAvailable = false;
  try {
    var probe = '__dl_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    isRealStorageAvailable = true;
  } catch(e) {
    isRealStorageAvailable = false;
  }

  if (!isRealStorageAvailable) {
    try {
      var memLocal = createMemoryStorage(initialStorage);
      var memSession = createMemoryStorage({});
      Object.defineProperty(window, 'localStorage', { value: memLocal, configurable: true, writable: true });
      Object.defineProperty(window, 'sessionStorage', { value: memSession, configurable: true, writable: true });
    } catch(err) {}
  } else {
    // Seed real storage
    if (initialStorage && typeof initialStorage === 'object') {
      for (var sKey in initialStorage) {
        try {
          if (Object.prototype.hasOwnProperty.call(initialStorage, sKey)) {
            window.localStorage.setItem(sKey, initialStorage[sKey]);
          }
        } catch(e) {}
      }
    }
    // Intercept changes on real storage
    var origSet = window.localStorage.setItem.bind(window.localStorage);
    var origRemove = window.localStorage.removeItem.bind(window.localStorage);
    var origClear = window.localStorage.clear.bind(window.localStorage);

    window.localStorage.setItem = function(k, v) {
      var r = origSet(k, v);
      notifyStorage(k, String(v));
      return r;
    };
    window.localStorage.removeItem = function(k) {
      var r = origRemove(k);
      notifyStorage(k, null);
      return r;
    };
    window.localStorage.clear = function() {
      var r = origClear();
      notifyStorage('__all__', null);
      return r;
    };
  }

  // --- CONSOLE BRIDGE ---
  function safeStringify(val) {
    if (val === undefined) return 'undefined';
    if (val === null) return 'null';
    if (typeof val === 'string') return val.slice(0, 500);
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (val instanceof Error) return (val.name + ': ' + val.message).slice(0, 500);
    try {
      var s = JSON.stringify(val);
      return (s || String(val)).slice(0, 500);
    } catch(e) {
      return String(val).slice(0, 500);
    }
  }

  function forwardConsole(level, args, source, line, col, stack) {
    if (consoleMsgCount >= MAX_CONSOLE_MSGS) return;
    consoleMsgCount++;
    var strArgs = [];
    for (var i = 0; i < args.length; i++) {
      strArgs.push(safeStringify(args[i]));
    }
    sendParent({
      type: 'dl-console',
      level: level,
      args: strArgs,
      source: source,
      line: line,
      column: col,
      stack: stack ? String(stack).slice(0, 2000) : undefined,
      timestamp: Date.now()
    });
  }

  var levels = ['log', 'info', 'warn', 'error', 'debug'];
  for (var li = 0; li < levels.length; li++) {
    (function(lvl) {
      var orig = console[lvl] ? console[lvl].bind(console) : function() {};
      console[lvl] = function() {
        var args = Array.prototype.slice.call(arguments);
        orig.apply(console, args);
        forwardConsole(lvl, args);
      };
    })(levels[li]);
  }

  // Window error capture
  window.addEventListener('error', function(e) {
    if (e.target && e.target !== window && (e.target.src || e.target.href)) {
      var resUrl = e.target.src || e.target.href;
      forwardConsole('error', ['Failed to load resource: ' + resUrl], resUrl);
      return;
    }
    var msg = e.message || 'Script error';
    var stack = e.error && e.error.stack ? e.error.stack : undefined;
    forwardConsole('error', [msg], e.filename, e.lineno, e.colno, stack);
  }, true);

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', function(e) {
    var r = e.reason;
    var msg = r instanceof Error ? r.message : String(r);
    var stack = r instanceof Error ? r.stack : undefined;
    forwardConsole('error', ['Unhandled Promise Rejection: ' + msg], undefined, undefined, undefined, stack);
  });

  // --- READY / LOAD SIGNALS ---
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    sendParent({ type: 'dl-ready' });
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      sendParent({ type: 'dl-ready' });
    });
  }

  if (document.readyState === 'complete') {
    sendParent({ type: 'dl-loaded' });
  } else {
    window.addEventListener('load', function() {
      sendParent({ type: 'dl-loaded' });
    });
  }

  // --- MULTI-PAGE NAVIGATION INTERCEPTION ---
  document.addEventListener('click', function(e) {
    var anchor = e.target && e.target.closest ? e.target.closest('a[data-dl-page]') : null;
    if (anchor) {
      var targetPage = anchor.getAttribute('data-dl-page');
      if (targetPage) {
        e.preventDefault();
        sendParent({ type: 'dl-navigate', page: targetPage });
      }
    }
  });
})();
</script>
`.trim();
}

/**
 * Main preview document builder.
 */
export function buildPreviewDoc(options: BuildPreviewDocOptions): string {
  const { files, page = "index.html", initialStorage } = options;
  const targetPage = normalizePath(page || "index.html");

  let entryFile = findFile(files, targetPage);
  if (!entryFile) {
    // If exact page not found, fallback to index.html if available
    entryFile = findFile(files, "index.html");
  }

  let html = entryFile?.content || "";
  if (!entryFile || !html.trim()) {
    html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Preview</title>
</head>
<body style="margin:0;padding:32px;font-family:system-ui,sans-serif;color:#a1a1aa;background:#09090b;text-align:center;">
  <p>Page "${page}" not found or empty.</p>
</body>
</html>`;
  }

  // 1. Rewrite relative links to other .html files in project
  // Exclude target="_blank", anchors (#), and external protocols
  html = html.replace(/<a\b([^>]*)>/gi, (match, attrs) => {
    // Check if target="_blank"
    if (/target=["']_blank["']/i.test(attrs)) {
      return match;
    }
    const hrefMatch = attrs.match(/\bhref=(["'])([^"']*)\1/i);
    if (!hrefMatch) return match;

    const href = hrefMatch[2].trim();
    if (/^(https?:|\/\/|mailto:|tel:|javascript:|#)/i.test(href) || href === "") {
      return match;
    }

    // Resolve relative path
    const resolvedPath = resolveRelativePath(targetPage, href.split("#")[0].split("?")[0]);
    const targetFile = findFile(files, resolvedPath);

    if (targetFile && resolvedPath.toLowerCase().endsWith(".html")) {
      const newAttrs = attrs
        .replace(/\bhref=(["'])[^"']*\1/i, 'href="#"')
        .concat(` data-dl-page="${resolvedPath}"`);
      return `<a ${newAttrs}>`;
    }
    return match;
  });

  // 2. Inline local <link rel="stylesheet"> as <style>
  html = html.replace(/<link\b([^>]*\brel=["']stylesheet["'][^>]*)>/gi, (match, attrs) => {
    const hrefMatch = attrs.match(/\bhref=(["'])([^"']*)\1/i);
    if (!hrefMatch) return match;
    const href = hrefMatch[2].trim();
    if (/^(https?:|\/\/|data:|blob:)/i.test(href)) {
      return match;
    }
    const resolved = resolveRelativePath(targetPage, href);
    const styleFile = findFile(files, resolved);
    if (!styleFile) {
      return match;
    }
    const inlinedCss = inlineCssUrls(styleFile.content, resolved, files);
    return `<style data-href="${href}">\n${inlinedCss}\n</style>`;
  });

  // 3. Inline local CSS url(...) inside existing <style> tags
  html = html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (match, attrs, css) => {
    const processed = inlineCssUrls(css, targetPage, files);
    return `<style${attrs}>${processed}</style>`;
  });

  // 4. Inline local <script src="..."> as inline <script>
  html = html.replace(
    /<script\b([^>]*\bsrc=(["'])([^"']+)\2[^>]*)>([\s\S]*?)<\/script>/gi,
    (match, attrs, _quote, src) => {
      const trimmedSrc = src.trim();
      if (/^(https?:|\/\/|data:|blob:)/i.test(trimmedSrc)) {
        return match;
      }
      const resolved = resolveRelativePath(targetPage, trimmedSrc);
      const scriptFile = findFile(files, resolved);
      if (!scriptFile) {
        return match;
      }
      const cleanedAttrs = attrs
        .replace(/\bsrc=(["'])[^"']*\1/i, "")
        .replace(/\s+/g, " ")
        .trim();
      const safeScript = scriptFile.content.replace(/<\/script/gi, "<\\/script");
      return `<script ${cleanedAttrs} data-src="${trimmedSrc}">\n${safeScript}\n</script>`;
    },
  );

  // 5. Inline local <img src="..."> as data: URI
  html = html.replace(
    /<img\b([^>]*\bsrc=(["'])([^"']+)\2[^>]*)>/gi,
    (match, attrs, _quote, src) => {
      const trimmedSrc = src.trim();
      if (/^(https?:|\/\/|data:|blob:)/i.test(trimmedSrc)) {
        return match;
      }
      const resolved = resolveRelativePath(targetPage, trimmedSrc);
      const imgFile = findFile(files, resolved);
      if (!imgFile) {
        return match;
      }
      const dataUri = fileToDataUri(imgFile);
      const newAttrs = attrs.replace(/\bsrc=(["'])[^"']*\1/i, `src="${dataUri}"`);
      return `<img ${newAttrs}>`;
    },
  );

  // 6. Inject runtime script as first element in <head>
  const runtimeScript = buildInjectedRuntimeScript(initialStorage, files);

  if (/<head\b[^>]*>/i.test(html)) {
    html = html.replace(/<head\b([^>]*)>/i, `<head$1>\n${runtimeScript}`);
  } else if (/<html\b[^>]*>/i.test(html)) {
    html = html.replace(/<html\b([^>]*)>/i, `<html$1><head>${runtimeScript}</head>`);
  } else {
    html = `<head>${runtimeScript}</head>\n${html}`;
  }

  return html;
}
