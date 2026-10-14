import { describe, it, expect } from "vitest";
import { buildPreviewDoc, getStorageShimScript } from "./preview-builder";

describe("buildPreviewDoc", () => {
  it("inlines local CSS, JavaScript, and SVG/image data URIs", () => {
    const files = [
      {
        path: "index.html",
        content: `<!DOCTYPE html><html><head><link rel="stylesheet" href="style.css"><script src="app.js"></script></head><body><img src="logo.svg"><img src="photo.png"></body></html>`,
      },
      {
        path: "style.css",
        content: `body { background: url('bg.svg'); color: red; }`,
      },
      {
        path: "bg.svg",
        content: `<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>`,
      },
      {
        path: "app.js",
        content: `console.log("hello world");`,
      },
      {
        path: "logo.svg",
        content: `<svg><text>Logo</text></svg>`,
      },
      {
        path: "photo.png",
        content: `fake-png-binary-content`,
      },
    ];

    const result = buildPreviewDoc({ files, page: "index.html", projectId: "test-proj" });

    // CSS inlined
    expect(result).toContain('<style data-href="style.css">');
    expect(result).toContain("color: red;");
    expect(result).toContain('url("data:image/svg+xml;utf8,');

    // JS inlined
    expect(result).toContain('console.log("hello world");');
    expect(result).not.toContain('<script src="app.js">');

    // SVG inlined as utf8 data URI
    expect(result).toContain(
      "data:image/svg+xml;utf8,%3Csvg%3E%3Ctext%3ELogo%3C%2Ftext%3E%3C%2Fsvg%3E",
    );

    // PNG inlined as base64 data URI
    expect(result).toContain("data:image/png;base64,");
  });

  it("rewrites relative multi-page links to data-dl-page while keeping anchors and external links", () => {
    const files = [
      {
        path: "index.html",
        content: `<!DOCTYPE html><html><head></head><body>
          <a href="about.html">About</a>
          <a href="./pages/contact.html">Contact</a>
          <a href="#section2">Anchor</a>
          <a href="https://google.com" target="_blank">Google</a>
          <a href="mailto:test@example.com">Email</a>
        </body></html>`,
      },
      {
        path: "about.html",
        content: `<h1>About Us</h1>`,
      },
      {
        path: "pages/contact.html",
        content: `<h1>Contact</h1>`,
      },
    ];

    const result = buildPreviewDoc({ files, page: "index.html", projectId: "test-proj" });

    // Rewritten multi-page links
    expect(result).toContain('href="#" data-dl-page="about.html"');
    expect(result).toContain('href="#" data-dl-page="pages/contact.html"');

    // Kept native links
    expect(result).toContain('href="#section2"');
    expect(result).toContain('href="https://google.com"');
    expect(result).toContain('href="mailto:test@example.com"');
  });

  it("safely seeds initialStorage containing hostile characters without breaking HTML", () => {
    const hostileStorage = {
      malicious: '</script><script>alert("hacked")</script>',
      lineSeparators: "line1\u2028line2\u2029line3",
      quotes: "quote\"and'slash\\",
    };

    const files = [
      {
        path: "index.html",
        content: `<!DOCTYPE html><html><head></head><body>App</body></html>`,
      },
    ];

    const result = buildPreviewDoc({
      files,
      page: "index.html",
      projectId: "test-proj",
      initialStorage: hostileStorage,
    });

    // Must NOT contain an unescaped closing script tag inside the runtime script
    expect(result).not.toContain("</script><script>alert");
    expect(result).toContain("<\\/script>");
    expect(result).toContain("\\u2028");
    expect(result).toContain("\\u2029");
  });

  it("injects head and runtime script when document has no <head> or <html> tag", () => {
    const files = [
      {
        path: "index.html",
        content: `<div>Just a snippet</div>`,
      },
    ];

    const result = buildPreviewDoc({ files, page: "index.html", projectId: "test-proj" });

    expect(result).toContain("<head>");
    expect(result).toContain('id="__dl_preview_runtime__"');
    expect(result).toContain("Just a snippet");
  });

  it("handles missing referenced files gracefully without crashing", () => {
    const files = [
      {
        path: "index.html",
        content: `<!DOCTYPE html><html><head><link rel="stylesheet" href="missing.css"><script src="missing.js"></script></head><body><img src="missing.jpg"><a href="missing-page.html">Missing Page</a></body></html>`,
      },
    ];

    const result = buildPreviewDoc({ files, page: "index.html", projectId: "test-proj" });

    // Missing files left untouched
    expect(result).toContain('href="missing.css"');
    expect(result).toContain('src="missing.js"');
    expect(result).toContain('src="missing.jpg"');
    expect(result).toContain('href="missing-page.html"');
    // Runtime script is still present
    expect(result).toContain('id="__dl_preview_runtime__"');
  });

  it("returns fallback document when requested page is not found in files", () => {
    const files = [
      {
        path: "other.html",
        content: `<h1>Other</h1>`,
      },
    ];

    const result = buildPreviewDoc({ files, page: "dashboard.html", projectId: "test-proj" });

    expect(result).toContain('Page "dashboard.html" not found');
    expect(result).toContain('id="__dl_preview_runtime__"');
  });

  it("provides valid standalone storage shim script", () => {
    const script = getStorageShimScript();
    expect(script).toContain("createMemStorage");
    expect(script).toContain("window.localStorage");
    expect(script).toContain("window.sessionStorage");
  });

  it("embeds virtual project files in preview runtime for local fetch calls", () => {
    const files = [
      { path: "index.html", content: "<html><body>API Demo</body></html>" },
      { path: "api.js", content: "export const data = { ok: true };" },
      { path: "data/config.json", content: '{"theme":"dark"}' },
    ];
    const result = buildPreviewDoc({ files, page: "index.html" });
    expect(result).toContain("api.js");
    expect(result).toContain("data/config.json");
    expect(result).toContain("origFetch");
  });
});
