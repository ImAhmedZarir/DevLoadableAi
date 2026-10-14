import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getStorageShimScript } from "@/lib/preview-builder";

function getMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "html":
    case "htm":
      return "text/html; charset=utf-8";
    case "css":
      return "text/css; charset=utf-8";
    case "js":
    case "mjs":
      return "text/javascript; charset=utf-8";
    case "json":
      return "application/json; charset=utf-8";
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
    case "woff":
      return "font/woff";
    case "woff2":
      return "font/woff2";
    case "ttf":
      return "font/ttf";
    default:
      return "application/octet-stream";
  }
}

export const Route = createFileRoute("/p/$slug/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slug = params.slug;
        const rawPath =
          (params as Record<string, string>)["_splat"] ||
          (params as Record<string, string>)["*"] ||
          (params as Record<string, string>)["_"] ||
          "";
        const cleanPath = decodeURIComponent(rawPath)
          .replace(/^[./\\]+/, "")
          .replace(/\\/g, "/");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const supabase = supabaseAdmin;

        const { data: initialPub, error: pubErr } = await supabase
          .from("publications")
          .select("project_id,entry_path,show_badge")
          .eq("slug", slug)
          .maybeSingle();

        let pub: { project_id: string; entry_path: string | null; show_badge?: boolean } | null =
          initialPub;

        if (pubErr && pubErr.message?.includes("show_badge")) {
          const fallback = await supabase
            .from("publications")
            .select("project_id,entry_path")
            .eq("slug", slug)
            .maybeSingle();
          pub = fallback.data ? { ...fallback.data, show_badge: true } : null;
        }

        if (!pub) {
          return new Response("Not found", {
            status: 404,
            headers: {
              "content-type": "text/plain",
              "X-Content-Type-Options": "nosniff",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        const effectivePath = cleanPath || pub.entry_path || "index.html";

        let { data: file } = await supabase
          .from("project_files")
          .select("path,content,is_upload")
          .eq("project_id", pub.project_id)
          .eq("path", effectivePath)
          .maybeSingle();

        if (!file) {
          const fallback = await supabase
            .from("project_files")
            .select("path,content,is_upload")
            .eq("project_id", pub.project_id)
            .ilike("path", effectivePath)
            .maybeSingle();
          file = fallback.data;
        }

        if (!file) {
          const { data: allFiles } = await supabase
            .from("project_files")
            .select("path,content,is_upload")
            .eq("project_id", pub.project_id);
          file =
            (allFiles ?? []).find(
              (f) =>
                f.path === effectivePath ||
                f.path.toLowerCase() === effectivePath.toLowerCase() ||
                f.path.replace(/^[./\\]+/, "") === effectivePath,
            ) || null;
        }

        // SPA routing fallback: if not found and path has no file extension, fallback to entry_path
        if (!file && (!cleanPath || !cleanPath.includes("."))) {
          const entryPath = pub.entry_path || "index.html";
          const { data: entryFallback } = await supabase
            .from("project_files")
            .select("path,content,is_upload")
            .eq("project_id", pub.project_id)
            .eq("path", entryPath)
            .maybeSingle();
          file = entryFallback;
        }

        if (!file) {
          return new Response(`File '${cleanPath}' not found`, {
            status: 404,
            headers: {
              "content-type": "text/plain",
              "X-Content-Type-Options": "nosniff",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        const mime = getMimeType(file.path);
        let body: string | Uint8Array = file.content;

        // If HTML file, rewrite root-relative links and inject head base, storage shim, and badge
        if (mime.startsWith("text/html")) {
          const siteBase = `/p/${encodeURIComponent(slug)}/`;
          let html = typeof body === "string" ? body : new TextDecoder().decode(body);

          // Rewrite root-relative links like src="/api.js" or href="/style.css" to src="/p/slug/api.js"
          html = html.replace(/\b(src|href)=["']\/(?!\/)([^"']*)["']/gi, (match, attr, relPath) => {
            if (relPath.startsWith("p/") || relPath.startsWith("http")) return match;
            return `${attr}="${siteBase}${relPath}"`;
          });

          const headInjection = `
  <base href="${siteBase}">
  <script id="__dl_storage_shim__">
${getStorageShimScript()}
  </script>`;

          if (/<head\b[^>]*>/i.test(html)) {
            html = html.replace(/<head\b([^>]*)>/i, `<head$1>${headInjection}`);
          } else if (/<html\b[^>]*>/i.test(html)) {
            html = html.replace(/<html\b([^>]*)>/i, `<html$1><head>${headInjection}</head>`);
          } else {
            html = `<head>${headInjection}</head>\n${html}`;
          }

          if (pub.show_badge !== false) {
            const badgeHtml = `
  <a href="https://devloadable.ai.studio/" target="_blank" rel="noopener" style="position:fixed;bottom:12px;right:12px;z-index:2147483647;font-family:system-ui,-apple-system,sans-serif;font-size:12px;line-height:1;padding:6px 12px;border-radius:9999px;background:rgba(9,9,11,0.85);color:#f4f4f5;border:1px solid rgba(255,255,255,0.12);text-decoration:none;backdrop-filter:blur(6px);box-shadow:0 2px 8px rgba(0,0,0,0.3);display:inline-flex;align-items:center;gap:6px;transition:opacity 0.2s;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
    <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#ffffff;box-shadow:0 0 6px rgba(255,255,255,0.6);"></span>
    Built with DevLoadable
  </a>`;
            if (/<\/body>/i.test(html)) {
              html = html.replace(/<\/body>/i, `${badgeHtml}\n</body>`);
            } else {
              html += badgeHtml;
            }
          }
          body = html;
        } else if (file.content.startsWith("data:") && file.content.includes(";base64,")) {
          // If stored as base64 data URI (binary uploads), decode to binary buffer
          try {
            const base64Data = file.content.split(";base64,")[1];
            if (typeof Buffer !== "undefined") {
              body = Buffer.from(base64Data, "base64");
            }
          } catch {
            // fallback
          }
        }

        return new Response(body as BodyInit, {
          headers: {
            "content-type": mime,
            "cache-control": "public, max-age=60",
            "Content-Security-Policy":
              "sandbox allow-scripts allow-forms allow-popups allow-modals",
            "X-Content-Type-Options": "nosniff",
            "X-Robots-Tag": "noindex, nofollow",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
