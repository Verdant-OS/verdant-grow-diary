import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { QUERY_CLIENT_DEFAULT_OPTIONS, QUERY_STALE_TIME_MS } from "@/constants/queryClientDefaults";
import { diaryEntriesQueryKey } from "@/hooks/use-diary-entries";
import { refreshDailyCheckQueries } from "@/lib/dailyCheckRefreshRules";
import { LATEST_SENSOR_REALTIME_INVALIDATE_DEBOUNCE_MS } from "@/lib/sensor";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

describe("repeated query load reduction", () => {
  it("keeps loaded data fresh for 60 seconds and skips tab-focus reloads", () => {
    const client = new QueryClient({ defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS });
    const q = client.getDefaultOptions().queries;
    expect(QUERY_STALE_TIME_MS).toBe(60_000);
    expect(q?.staleTime).toBe(60_000);
    expect(q?.refetchOnWindowFocus).toBe(false);
  });

  it("files diary results under the signed-in account, under the shared prefix", () => {
    expect(diaryEntriesQueryKey("user-a")).toEqual(["diary_entries", "user-a"]);
    expect(diaryEntriesQueryKey("user-a")).not.toEqual(diaryEntriesQueryKey("user-b"));
    expect(diaryEntriesQueryKey(null)).toEqual(["diary_entries", "anon"]);
  });

  it("joins an in-flight refresh after a save instead of restarting it", () => {
    const calls: Array<{ key: ReadonlyArray<string>; cancel: boolean }> = [];
    refreshDailyCheckQueries({
      invalidateQueries: (args, options) => {
        calls.push({ key: args.queryKey, cancel: options.cancelRefetch });
      },
    });
    expect(calls).toEqual([
      { key: ["diary_entries"], cancel: false },
      { key: ["sensor_readings"], cancel: false },
    ]);
  });

  it("limits live sensor refreshes to once every 30 seconds per tent", () => {
    expect(LATEST_SENSOR_REALTIME_INVALIDATE_DEBOUNCE_MS).toBe(30_000);
  });
});
