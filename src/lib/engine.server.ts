/**
 * Server-only module that encapsulates upstream LLM communication.
 * This is the ONLY file in the repository that knows the upstream host, endpoints,
 * model identifiers, and vendor names.
 *
 * Public model IDs exposed to client:
 *   - "build-max" -> Flagship Build Max (defaults to upstream mercury-2.5)
 *   - "build-mini" -> Agile Build Mini (defaults to upstream mercury-2)
 */

export type PublicModelId = "build-max" | "build-mini";

// Internal legacy mapping for stored database entries or backward compat
export function normalizeModelId(rawId: string | null | undefined): PublicModelId {
  if (!rawId) return "build-max";
  const lower = rawId.toLowerCase().trim();
  if (
    lower === "build-mini" ||
    lower === "zargpt-mini" ||
    lower === "mercury2" ||
    lower === "inception" ||
    lower.includes("mini")
  ) {
    return "build-mini";
  }
  return "build-max";
}

export interface UpstreamConfig {
  baseUrl: string;
  modelMax: string;
  modelMini: string;
}

export function getUpstreamConfig(): UpstreamConfig {
  const baseUrl = (process.env.UPSTREAM_BASE_URL || "https://api.inceptionlabs.ai/v1").replace(
    /\/+$/,
    "",
  );
  const modelMax = process.env.UPSTREAM_MODEL_MAX || "mercury-2.5";
  const modelMini = process.env.UPSTREAM_MODEL_MINI || "mercury-2";

  return { baseUrl, modelMax, modelMini };
}

export function getKeyCount(): number {
  return process.env.INCEPTION_API_KEY ? 1 : 0;
}

export function getNextKey(customKey?: string | null): { key: string; id: number } {
  if (customKey && customKey.trim().length > 5) {
    return { key: customKey.trim(), id: 1 };
  }

  const defaultKey = process.env.INCEPTION_API_KEY?.trim();
  if (!defaultKey || defaultKey.length <= 5) {
    throw new Error(
      "No engine API key configured. Please set INCEPTION_API_KEY in your environment.",
    );
  }

  return { key: defaultKey, id: 1 };
}

export function markKeyCooldown(_keyString: string, _cooldownSeconds = 60) {
  // Single-key mode: no pool rotation needed
}

export function markKeySuccess(_keyString: string) {
  // Single-key mode: no pool rotation needed
}

/**
 * Strips all proprietary upstream and vendor names from strings
 */
export function sanitizeOutput(text: string): string {
  if (!text) return "";
  return text
    .replace(/mercury[-_ ]?2\.5/gi, "Build Max")
    .replace(/mercury[-_ ]?2/gi, "Build Mini")
    .replace(/mercury/gi, "DevLoadable Engine")
    .replace(/inception[-_ ]?labs/gi, "DevLoadable AI")
    .replace(/api\.inceptionlabs\.ai/gi, "engine.devloadable.internal")
    .replace(/inception/gi, "DevLoadable");
}

export function getUpstreamModel(publicId: PublicModelId): string {
  const config = getUpstreamConfig();
  return publicId === "build-mini" ? config.modelMini : config.modelMax;
}
