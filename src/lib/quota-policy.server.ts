import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const DEFAULT_DAILY_MESSAGE_LIMIT = 1000;
export const DEFAULT_UNLIMITED_MODE = false;

export interface QuotaEvaluation {
  allowed: boolean;
  limit: number;
  unlimited: boolean;
  resetAt: string; // ISO 8601 UTC midnight
  error?: string;
}

// In-memory burst & idempotency cache per user (lasts 60 seconds)
const recentRequestHashes = new Map<string, { timestamp: number; runId?: string }>();

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const cutoff = Date.now() - 60_000;
    for (const [key, val] of recentRequestHashes.entries()) {
      if (val.timestamp < cutoff) recentRequestHashes.delete(key);
    }
  }, 300_000).unref?.();
}

/**
 * Calculates UTC reset time (next 00:00:00 UTC)
 */
export function getUtcMidnightReset(): { resetAt: string; secondsUntilReset: number } {
  const now = new Date();
  const nextMidnightUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
  );
  const secondsUntilReset = Math.max(
    0,
    Math.floor((nextMidnightUtc.getTime() - now.getTime()) / 1000),
  );
  return {
    resetAt: nextMidnightUtc.toISOString(),
    secondsUntilReset,
  };
}

/**
 * Loads admin quota settings with safe integer parsing and strict fallback defaults
 */
export async function getEffectiveQuotaSettings(supabase: SupabaseClient<Database>): Promise<{
  limit: number;
  unlimited: boolean;
}> {
  try {
    const { data: settings } = await supabase
      .from("app_settings")
      .select("key,value")
      .in("key", ["daily_message_limit", "agent_unlimited_requests"]);

    const map = new Map<string, string>(
      ((settings ?? []) as Array<{ key: string; value: string }>).map((s) => [s.key, s.value]),
    );

    let limit = DEFAULT_DAILY_MESSAGE_LIMIT;
    const rawLimit = map.get("daily_message_limit");
    if (rawLimit) {
      const parsed = parseInt(rawLimit, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 50000) {
        limit = parsed;
      }
    }

    let unlimited = DEFAULT_UNLIMITED_MODE;
    const rawUnlimited = map.get("agent_unlimited_requests");
    if (rawUnlimited !== undefined) {
      unlimited = rawUnlimited === "true";
    }

    return { limit, unlimited };
  } catch {
    return { limit: DEFAULT_DAILY_MESSAGE_LIMIT, unlimited: DEFAULT_UNLIMITED_MODE };
  }
}

/**
 * Unified server-side quota consumption function used by EVERY generation and message entry point.
 * Fail-closed: Throws if durable check fails or limit is exceeded.
 */
export async function checkAndConsumeMessageQuota({
  supabase,
  userId,
  isAutofix = false,
  idempotencyKey,
}: {
  supabase: SupabaseClient<Database>;
  userId: string;
  isAutofix?: boolean;
  idempotencyKey?: string;
}): Promise<QuotaEvaluation> {
  const { resetAt } = getUtcMidnightReset();

  // 1. Idempotency check: duplicate submission within 10s does not double-count
  if (idempotencyKey) {
    const cacheKey = `${userId}:${idempotencyKey}`;
    const cached = recentRequestHashes.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 10_000) {
      return {
        allowed: true,
        limit: DEFAULT_DAILY_MESSAGE_LIMIT,
        unlimited: false,
        resetAt,
      };
    }
    recentRequestHashes.set(cacheKey, { timestamp: Date.now() });
  }

  // 2. Fetch validated settings
  const { limit, unlimited } = await getEffectiveQuotaSettings(supabase);

  // 3. Autofix runs share bounded compute budget and do not consume separate user message quota
  if (isAutofix) {
    return {
      allowed: true,
      limit,
      unlimited,
      resetAt,
    };
  }

  // 4. Atomic database check & increment
  let allowed = false;

  const { data: rpcAllowed, error: quotaErr } = await supabase.rpc("consume_daily_message", {
    _user: userId,
    _limit: limit,
    _unlimited: unlimited,
  });

  if (!quotaErr) {
    allowed = Boolean(rpcAllowed);
  } else if (quotaErr.code === "PGRST202") {
    // When consume_daily_message stored procedure is not installed in Postgres,
    // operate directly on the durable daily_usage table.
    const todayUtc = new Date().toISOString().slice(0, 10);
    if (unlimited) {
      allowed = true;
    } else {
      const { data: usageRow, error: usageErr } = await supabase
        .from("daily_usage")
        .select("messages_sent")
        .eq("user_id", userId)
        .eq("day", todayUtc)
        .maybeSingle();

      let currentCount = 0;
      let targetClient = supabase;

      if (usageErr) {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: adminUsage, error: adminErr } = await supabaseAdmin
            .from("daily_usage")
            .select("messages_sent")
            .eq("user_id", userId)
            .eq("day", todayUtc)
            .maybeSingle();
          if (adminErr) throw adminErr;
          currentCount = adminUsage?.messages_sent ?? 0;
          targetClient = supabaseAdmin;
        } catch {
          console.error("daily_usage table query error:", usageErr);
          throw new Error(
            "Service temporarily unavailable: unable to verify daily quota. Please try again in a few moments.",
          );
        }
      } else {
        currentCount = usageRow?.messages_sent ?? 0;
      }

      if (currentCount >= limit) {
        allowed = false;
      } else {
        const { error: upsertErr } = await targetClient.from("daily_usage").upsert(
          {
            user_id: userId,
            day: todayUtc,
            messages_sent: currentCount + 1,
          },
          { onConflict: "user_id,day" },
        );
        if (upsertErr) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { error: adminUpsertErr } = await supabaseAdmin.from("daily_usage").upsert(
              {
                user_id: userId,
                day: todayUtc,
                messages_sent: currentCount + 1,
              },
              { onConflict: "user_id,day" },
            );
            if (adminUpsertErr) throw adminUpsertErr;
          } catch {
            console.error("daily_usage table upsert error:", upsertErr);
            throw new Error(
              "Service temporarily unavailable: unable to verify daily quota. Please try again in a few moments.",
            );
          }
        }
        allowed = true;
      }
    }
  } else {
    // FAIL CLOSED: Database connection or network error
    console.error("consume_daily_message database error:", quotaErr);
    throw new Error(
      "Service temporarily unavailable: unable to verify daily quota. Please try again in a few moments.",
    );
  }

  if (allowed === false) {
    const resetTimeFormatted = resetAt.slice(11, 16);
    throw new Error(
      `Daily limit reached (${limit.toLocaleString()} messages per UTC day). Your allowance resets at ${resetTimeFormatted} UTC.`,
    );
  }

  return {
    allowed: true,
    limit,
    unlimited,
    resetAt,
  };
}
