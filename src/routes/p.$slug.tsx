import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { pageMeta } from "@/lib/page-meta";
import { getStorageShimScript } from "@/lib/preview-builder";

export const Route = createFileRoute("/p/$slug")({
  head: () =>
    pageMeta(
      "Published website",
      "A website created and published with DevLoadable. Part of ZarGPT.",
    ),
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const supabase = supabaseAdmin;

        const { data: initialPub, error: pubErr } = await supabase
          .from("publications")
          .select("project_id,entry_path,show_badge")
          .eq("slug", params.slug)
          .maybeSingle();

        let pub: { project_id: string; entry_path: string | null; show_badge?: boolean } | null =
          initialPub;

        if (pubErr && pubErr.message?.includes("show_badge")) {
          const fallback = await supabase
            .from("publications")
            .select("project_id,entry_path")
            .eq("slug", params.slug)
            .maybeSingle();
          pub = fallback.data ? { ...fallback.data, show_badge: true } : null;
        }

        if (!pub) {
          return new Response("Not found", {
            status: 404,
            headers: {
              "content-type": "text/plain",
              "X-Content-Type-Options": "nosniff",
            },
          });
        }

        const entryPath = pub.entry_path || "index.html";
        const { data: files } = await supabase
          .from("project_files")
          .select("path,content")
          .eq("project_id", pub.project_id);

        const indexFile = files?.find(
          (f) =>
            f.path === entryPath ||
            f.path === entryPath.replace(/^\.?\//, "") ||
            f.path === "index.html",
        );

        if (!indexFile) {
          return new Response("Empty site", {
            status: 404,
            headers: {
              "content-type": "text/plain",
              "X-Content-Type-Options": "nosniff",
            },
          });
        }

        let html = indexFile.content;
        const siteBase = `/p/${encodeURIComponent(params.slug)}/`;

        // Rewrite root-relative links like src="/api.js" to src="/p/slug/api.js"
        html = html.replace(/\b(src|href)=["']\/(?!\/)([^"']*)["']/gi, (match, attr, relPath) => {
          if (relPath.startsWith("p/") || relPath.startsWith("http")) return match;
          return `${attr}="${siteBase}${relPath}"`;
        });

        // Injected head tags: base URL for relative links + storage shim script
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

        // Inject badge before </body> if show_badge is true
        if (pub.show_badge !== false) {
          const badgeHtml = `
  <a href="https://zargpt.ai.studio/" target="_blank" rel="noopener" style="position:fixed;bottom:12px;right:12px;z-index:2147483647;font-family:system-ui,-apple-system,sans-serif;font-size:12px;line-height:1;padding:6px 12px;border-radius:9999px;background:rgba(9,9,11,0.85);color:#f4f4f5;border:1px solid rgba(255,255,255,0.12);text-decoration:none;backdrop-filter:blur(6px);box-shadow:0 2px 8px rgba(0,0,0,0.3);display:inline-flex;align-items:center;gap:6px;transition:opacity 0.2s;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
    <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#ffffff;box-shadow:0 0 6px rgba(255,255,255,0.6);"></span>
    Built with DevLoadable
  </a>`;

          if (/<\/body>/i.test(html)) {
            html = html.replace(/<\/body>/i, `${badgeHtml}\n</body>`);
          } else {
            html += badgeHtml;
          }
        }

        return new Response(html, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=60",
            "Content-Security-Policy":
              "sandbox allow-scripts allow-forms allow-popups allow-modals",
            "X-Content-Type-Options": "nosniff",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
