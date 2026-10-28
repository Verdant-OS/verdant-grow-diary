/**
 * Codex P2 on #2562: growRepo must keep the database error code so the grow
 * read retry policy stops on a permanent error instead of retrying it.
 * Exercised through the real repository boundary, not a pre-coded mock error.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ calls: 0, error: null as unknown }));

vi.mock("@/integrations/supabase/client", () => {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "or", "in", "is"]) builder[method] = () => builder;
  builder.order = async () => {
    state.calls += 1;
    return { data: null, error: state.error };
  };
  return { supabase: { from: () => builder } };
});

import { fetchTents } from "@/lib/growRepo";
import { readTransientValue } from "@/lib/growsReadRetryRules";

const GROW_ID = "11111111-1111-4111-8111-111111111111";
const noSleep = { sleep: async () => undefined };

describe("growRepo error codes reach the grow read retry policy", () => {
  beforeEach(() => {
    state.calls = 0;
  });

  it("stops after one attempt on a permanent permission error", async () => {
    state.error = { code: "42501", message: "permission denied for table tents" };
    await expect(readTransientValue(() => fetchTents(GROW_ID), noSleep)).rejects.toMatchObject({
      code: "42501",
    });
    expect(state.calls).toBe(1);
  });

  it("still retries a transient error", async () => {
    state.error = { code: "503", message: "service unavailable" };
    await expect(readTransientValue(() => fetchTents(GROW_ID), noSleep)).rejects.toBeTruthy();
    expect(state.calls).toBeGreaterThan(1);
  });
});
