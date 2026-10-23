/**
 * Direct tests for `updateOpenAlertContext` (src/lib/alerts.ts), which the
 * environment-alert persistence hook uses to refresh an open alert's wording
 * when a configured target replaces the stage/default range (#2199 review).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const calls: { method: string; args: unknown[] }[] = [];
  const state: { error: unknown } = { error: null };
  const chain = {
    update: (...args: unknown[]) => {
      calls.push({ method: "update", args });
      return chain;
    },
    eq: (...args: unknown[]) => {
      calls.push({ method: "eq", args });
      return chain;
    },
    then: (resolve: (value: { error: unknown }) => unknown) => resolve({ error: state.error }),
  };
  const from = vi.fn((table: string) => {
    calls.push({ method: "from", args: [table] });
    return chain;
  });
  return { calls, state, from };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => db.from(table) },
}));

import { updateOpenAlertContext } from "@/lib/alerts";

const REF = {
  id: "bbbbbbbb-1111-4222-8333-444444444444",
  type: "sensor_snapshot" as const,
  occurred_at: "2026-10-20T12:00:00.000Z",
  source: "manual" as const,
};

const CONTEXT = {
  title: "Humidity above target",
  reason: "Observed 85%; configured target 50–70%.",
  originating_timeline_events: [REF],
};

beforeEach(() => {
  db.calls.length = 0;
  db.state.error = null;
  db.from.mockClear();
});

describe("updateOpenAlertContext", () => {
  it("does not touch the database when there are no evidence refs", async () => {
    await expect(
      updateOpenAlertContext("alert-1", { ...CONTEXT, originating_timeline_events: [] }),
    ).resolves.toBe(false);
    await expect(
      updateOpenAlertContext("alert-1", { ...CONTEXT, originating_timeline_events: null }),
    ).resolves.toBe(false);
    await expect(
      updateOpenAlertContext("alert-1", {
        ...CONTEXT,
        originating_timeline_events: [{ ...REF, id: "   " }],
      }),
    ).resolves.toBe(false);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("updates title, reason and normalized refs on the open alert only", async () => {
    await expect(updateOpenAlertContext("alert-1", CONTEXT)).resolves.toBe(true);
    expect(db.calls).toEqual([
      { method: "from", args: ["alerts"] },
      {
        method: "update",
        args: [
          {
            title: CONTEXT.title,
            reason: CONTEXT.reason,
            originating_timeline_events: [REF],
          },
        ],
      },
      { method: "eq", args: ["id", "alert-1"] },
      { method: "eq", args: ["status", "open"] },
    ]);
  });

  it("never writes user_id, status or other ownership fields", async () => {
    await updateOpenAlertContext("alert-1", CONTEXT);
    const payload = db.calls.find((c) => c.method === "update")?.args[0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["originating_timeline_events", "reason", "title"]);
  });

  it("throws the Supabase error so the caller can surface or retry it", async () => {
    const error = { message: "network down", code: "08006" };
    db.state.error = error;
    await expect(updateOpenAlertContext("alert-1", CONTEXT)).rejects.toBe(error);
  });
});
