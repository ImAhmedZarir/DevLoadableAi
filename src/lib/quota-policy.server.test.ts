import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DEFAULT_DAILY_MESSAGE_LIMIT,
  DEFAULT_UNLIMITED_MODE,
  getUtcMidnightReset,
  getEffectiveQuotaSettings,
  checkAndConsumeMessageQuota,
} from "./quota-policy.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

describe("Quota Policy Server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Constants & UTC Calculations", () => {
    it("advertises exactly 1,000 free daily messages and unlimited mode false by default", () => {
      expect(DEFAULT_DAILY_MESSAGE_LIMIT).toBe(1000);
      expect(DEFAULT_UNLIMITED_MODE).toBe(false);
    });

    it("calculates UTC reset time strictly at next 00:00:00.000 UTC", () => {
      const { resetAt, secondsUntilReset } = getUtcMidnightReset();
      const resetDate = new Date(resetAt);

      expect(resetDate.getUTCHours()).toBe(0);
      expect(resetDate.getUTCMinutes()).toBe(0);
      expect(resetDate.getUTCSeconds()).toBe(0);
      expect(resetDate.getUTCMilliseconds()).toBe(0);
      expect(secondsUntilReset).toBeGreaterThan(0);
      expect(secondsUntilReset).toBeLessThanOrEqual(86400);
    });
  });

  describe("getEffectiveQuotaSettings", () => {
    it("uses default settings if app_settings query returns empty", async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [] }),
          }),
        }),
      } as unknown as SupabaseClient<Database>;

      const settings = await getEffectiveQuotaSettings(mockSupabase);
      expect(settings.limit).toBe(1000);
      expect(settings.unlimited).toBe(false);
    });

    it("parses valid custom limit and unlimited mode correctly", async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                { key: "daily_message_limit", value: "2500" },
                { key: "agent_unlimited_requests", value: "true" },
              ],
            }),
          }),
        }),
      } as unknown as SupabaseClient<Database>;

      const settings = await getEffectiveQuotaSettings(mockSupabase);
      expect(settings.limit).toBe(2500);
      expect(settings.unlimited).toBe(true);
    });

    it("falls back to default if custom limit is out of safe range (e.g. negative or >50000)", async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ key: "daily_message_limit", value: "-50" }],
            }),
          }),
        }),
      } as unknown as SupabaseClient<Database>;

      const settings = await getEffectiveQuotaSettings(mockSupabase);
      expect(settings.limit).toBe(1000);
    });
  });

  describe("checkAndConsumeMessageQuota", () => {
    it("fails closed and throws an error if Supabase RPC fails", async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [] }),
          }),
        }),
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Database connection failed", code: "PGRST000" },
        }),
      } as unknown as SupabaseClient<Database>;

      await expect(
        checkAndConsumeMessageQuota({
          supabase: mockSupabase,
          userId: "user-test-fail-closed",
          isAutofix: false,
          idempotencyKey: "test-err-key",
        }),
      ).rejects.toThrow(/Service temporarily unavailable/);
    });

    it("throws a clear error with UTC reset when quota limit (1000) is exceeded", async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [] }),
          }),
        }),
        rpc: vi.fn().mockResolvedValue({
          data: false, // RPC rejected increment because count >= limit
          error: null,
        }),
      } as unknown as SupabaseClient<Database>;

      await expect(
        checkAndConsumeMessageQuota({
          supabase: mockSupabase,
          userId: "user-test-exceeded",
          isAutofix: false,
          idempotencyKey: "test-exceeded-key",
        }),
      ).rejects.toThrow(/Daily limit reached \(1,000 messages per UTC day\)/);
    }, 20000);

    it("allows request when quota is under limit and consumes one message", async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [] }),
          }),
        }),
        rpc: vi.fn().mockResolvedValue({
          data: true, // RPC incremented successfully
          error: null,
        }),
      } as unknown as SupabaseClient<Database>;

      const result = await checkAndConsumeMessageQuota({
        supabase: mockSupabase,
        userId: "user-test-success",
        isAutofix: false,
        idempotencyKey: "test-success-key",
      });

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(1000);
      expect(mockSupabase.rpc).toHaveBeenCalledWith("consume_daily_message", {
        _user: "user-test-success",
        _limit: 1000,
        _unlimited: false,
      });
    });

    it("caches idempotency key so immediate retry does not invoke RPC again", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: true,
        error: null,
      });

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [] }),
          }),
        }),
        rpc: mockRpc,
      } as unknown as SupabaseClient<Database>;

      const firstCall = await checkAndConsumeMessageQuota({
        supabase: mockSupabase,
        userId: "user-idempotent",
        isAutofix: false,
        idempotencyKey: "same-prompt-hash-123",
      });
      expect(firstCall.allowed).toBe(true);
      expect(mockRpc).toHaveBeenCalledTimes(1);

      // Immediate retry with same key
      const secondCall = await checkAndConsumeMessageQuota({
        supabase: mockSupabase,
        userId: "user-idempotent",
        isAutofix: false,
        idempotencyKey: "same-prompt-hash-123",
      });
      expect(secondCall.allowed).toBe(true);
      // RPC was NOT called again!
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });

    it("allows autofix runs without consuming daily user prompt quota", async () => {
      const mockRpc = vi.fn();
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [] }),
          }),
        }),
        rpc: mockRpc,
      } as unknown as SupabaseClient<Database>;

      const result = await checkAndConsumeMessageQuota({
        supabase: mockSupabase,
        userId: "user-autofix",
        isAutofix: true,
      });

      expect(result.allowed).toBe(true);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("falls back to daily_usage table when RPC is not installed (PGRST202) and allows under limit", async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "app_settings") {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: [] }),
              }),
            };
          }
          if (table === "daily_usage") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { messages_sent: 15 },
                      error: null,
                    }),
                  }),
                }),
              }),
              upsert: mockUpsert,
            };
          }
          return {};
        }),
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST202", message: "Function not found" },
        }),
      } as unknown as SupabaseClient<Database>;

      const result = await checkAndConsumeMessageQuota({
        supabase: mockSupabase,
        userId: "user-fallback-test",
        isAutofix: false,
        idempotencyKey: "fallback-key-1",
      });

      expect(result.allowed).toBe(true);
      expect(mockUpsert).toHaveBeenCalled();
    });

    it("falls back to daily_usage table when RPC is not installed (PGRST202) and throws when at limit", async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "app_settings") {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: [] }),
              }),
            };
          }
          if (table === "daily_usage") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { messages_sent: 1000 },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST202", message: "Function not found" },
        }),
      } as unknown as SupabaseClient<Database>;

      await expect(
        checkAndConsumeMessageQuota({
          supabase: mockSupabase,
          userId: "user-fallback-exceeded",
          isAutofix: false,
          idempotencyKey: "fallback-key-2",
        }),
      ).rejects.toThrow(/Daily limit reached \(1,000 messages per UTC day\)/);
    });
  });
});
