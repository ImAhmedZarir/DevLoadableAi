import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { captureError } from "../lib/client-error";
import { supabase } from "@/integrations/supabase/client";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    captureError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "An unexpected error occurred."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=5" },
      { name: "theme-color", content: "#000000" },
      { title: "DevLoadable — AI Web App Builder & Live Editor" },
      {
        name: "description",
        content:
          "Build, edit, and publish web applications with AI assistance. Instant live preview, multi-file code workspace, and static site hosting with 1,000 free daily messages.",
      },
      { name: "author", content: "Ahmed Ishtiaque Zarir" },
      { property: "og:site_name", content: "DevLoadable" },
      { property: "og:title", content: "DevLoadable — AI Web App Builder & Live Editor" },
      {
        property: "og:description",
        content:
          "Build, edit, and publish web applications with AI assistance. Instant live preview, multi-file code workspace, and static site hosting with 1,000 free daily messages.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://devloadable.ai.studio/" },
      { property: "og:image", content: "https://devloadable.ai.studio/faviconandlogo.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "DevLoadable — AI Web App Builder & Live Editor" },
      {
        name: "twitter:description",
        content:
          "Build, edit, and publish web applications with AI assistance. Instant live preview, multi-file code workspace, and static site hosting with 1,000 free daily messages.",
      },
      { name: "twitter:image", content: "https://devloadable.ai.studio/faviconandlogo.png" },
      { name: "application-name", content: "DevLoadable" },
      { name: "apple-mobile-web-app-title", content: "DevLoadable" },
    ],
    links: [
      { rel: "canonical", href: "https://devloadable.ai.studio/" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&family=Geist:wght@300;400;500;600;700;800&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/faviconandlogo.png" },
      { rel: "apple-touch-icon", href: "/faviconandlogo.png" },
      { rel: "shortcut icon", href: "/faviconandlogo.png" },
      { rel: "alternate icon", type: "image/x-icon", href: "/favicon.ico" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient, router]);
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster theme="dark" richColors position="bottom-center" />
    </QueryClientProvider>
  );
}
