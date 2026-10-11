/**
 * Client error reporting utility.
 * Lightweight, privacy-conscious and sanitized.
 */

export function captureError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;

  try {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const payload = {
      message: errorMsg.slice(0, 500),
      route: window.location.pathname,
      timestamp: new Date().toISOString(),
      ...context,
    };

    // Attempt reporting to server endpoint silently
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      // no-op on network failure or if route is disabled
    });
  } catch {
    // Safe no-op
  }
}
