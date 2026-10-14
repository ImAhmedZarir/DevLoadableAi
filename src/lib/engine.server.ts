/**
 * Server-only module that encapsulates upstream LLM communication.
 * This is the ONLY file in the repository that knows the upstream host, endpoints,
 * model identifiers, and vendor names.
 *
 * Public model IDs exposed to client:
 *   - "build-max" -> Flagship Build Max (defaults to upstream mercury-2.5)
 *   - "build-mini" -> Agile Build Mini (defaults to upstream mercury-2)
 *
 * API KEYS (multi-key rotation):
 *   INCEPTION_API_KEY            (legacy single key, still works)
 *   INCEPTION_API_KEY1 ... INCEPTION_API_KEY100
 *   INCEPTION_API_KEYS           (optional, comma separated list)
 * All keys found are pooled. When a key gets 429/401/5xx it is put on cooldown
 * and the next healthy key is used automatically.
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

/* -------------------------------------------------------------------------- */
/*                               KEY POOL / ROTATION                          */
/* -------------------------------------------------------------------------- */

const MAX_KEY_SLOTS = 100;

// key string -> timestamp (ms) until which it must not be used
const cooldowns = new Map<string, number>();
// round-robin cursor (random start so serverless instances don't all hit key #1)
let cursor = Math.floor(Math.random() * 1000);

function loadKeyPool(): string[] {
  const seen = new Set<string>();
  const pool: string[] = [];
  const add = (raw: string | undefined | null) => {
    const k = raw?.trim();
    if (!k || k.length <= 5 || seen.has(k)) return;
    seen.add(k);
    pool.push(k);
  };

  add(process.env.INCEPTION_API_KEY);
  for (let i = 1; i <= MAX_KEY_SLOTS; i++) {
    add(process.env[`INCEPTION_API_KEY${i}`]);
  }
  const list = process.env.INCEPTION_API_KEYS;
  if (list) {
    for (const part of list.split(",")) add(part);
  }
  return pool;
}

export function getKeyCount(): number {
  return loadKeyPool().length;
}

function isCoolingDown(key: string, now: number): boolean {
  const until = cooldowns.get(key);
  if (!until) return false;
  if (until <= now) {
    cooldowns.delete(key);
    return false;
  }
  return true;
}

export function getNextKey(customKey?: string | null): { key: string; id: number } {
  const now = Date.now();

  // 1) A custom (admin-saved) key is used first, but only while it is healthy.
  const custom = customKey?.trim();
  if (custom && custom.length > 5 && !isCoolingDown(custom, now)) {
    return { key: custom, id: 0 };
  }

  const pool = loadKeyPool();
  if (pool.length === 0) {
    // Custom key exists but is cooling down and there is no env pool: reuse it anyway.
    if (custom && custom.length > 5) return { key: custom, id: 0 };
    throw new Error(
      "No engine API key configured. Please set INCEPTION_API_KEY1, INCEPTION_API_KEY2, ... in your environment.",
    );
  }

  // 2) Round-robin over healthy keys.
  for (let n = 0; n < pool.length; n++) {
    const idx = (cursor + n) % pool.length;
    const key = pool[idx];
    if (!isCoolingDown(key, now)) {
      cursor = idx + 1;
      return { key, id: idx + 1 };
    }
  }

  // 3) Everything is cooling down: use the one that recovers soonest (never hard-fail).
  let bestIdx = 0;
  let bestUntil = Infinity;
  pool.forEach((k, i) => {
    const until = cooldowns.get(k) ?? 0;
    if (until < bestUntil) {
      bestUntil = until;
      bestIdx = i;
    }
  });
  cursor = bestIdx + 1;
  return { key: pool[bestIdx], id: bestIdx + 1 };
}

export function markKeyCooldown(keyString: string, cooldownSeconds = 60) {
  if (!keyString) return;
  cooldowns.set(keyString, Date.now() + cooldownSeconds * 1000);
}

export function markKeySuccess(keyString: string) {
  if (!keyString) return;
  cooldowns.delete(keyString);
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
