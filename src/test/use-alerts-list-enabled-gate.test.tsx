/**
 * use-alerts-list-enabled-gate
 *
 * Regression coverage for the /one-tent-loop-proof never-healthy E2E
 * failure: the page fired GET /rest/v1/alerts on an unauthenticated load
 * (before the auth redirect) because useAlertsList had no way to defer
 * its read. The hook now accepts { enabled } (default true) and the proof
 * page gates it on a real grow scope, mirroring usePlantAssignedTentActions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderHook, waitFor } from "@testing-library/react";

const listAlertsMock = vi.fn(async (_q: unknown) => []);

vi.mock("@/lib/alerts", () => ({
  listAlerts: (q: unknown) => listAlertsMock(q),
}));

import { useAlertsList } from "@/hooks/useAlertsList";

const ROOT = resolve(__dirname, "../..");
const PROOF_PAGE_SRC = readFileSync(resolve(ROOT, "src/pages/OneTentLoopLiveProof.tsx"), "utf8");

beforeEach(() => {
  listAlertsMock.mockClear();
});

describe("useAlertsList — enabled gate", () => {
  it("does not read alerts at all when enabled is false", async () => {
    const { result } = renderHook(() => useAlertsList({ status: "open" }, { enabled: false }));
    // Give any stray effect a tick to fire.
    await new Promise((r) => setTimeout(r, 20));
    expect(listAlertsMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
    expect(result.current.alerts).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("keeps the default behavior (reads immediately) when options are omitted", async () => {
    const { result } = renderHook(() => useAlertsList({ status: "open" }));
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(listAlertsMock).toHaveBeenCalledTimes(1);
  });

  it("starts reading once enabled flips from false to true", async () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useAlertsList({ growId: "g1" }, { enabled }),
      { initialProps: { enabled: false } },
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(listAlertsMock).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(listAlertsMock).toHaveBeenCalledTimes(1);
    expect(listAlertsMock).toHaveBeenCalledWith(expect.objectContaining({ growId: "g1" }));
  });
});

describe("/one-tent-loop-proof — alerts read stays grow-scoped (static)", () => {
  it("OneTentLoopLiveProof gates useAlertsList on activeGrowId", () => {
    // The call site must pass the enabled option tied to the grow scope so
    // an unauthenticated load (about to redirect) never fires
    // GET /rest/v1/alerts — the never-healthy E2E spec forbids it.
    expect(PROOF_PAGE_SRC).toMatch(
      /useAlertsList\(\s*\{[^}]*growId[^}]*\}\s*,\s*\{\s*enabled:\s*!!activeGrowId\s*\}\s*,?\s*\)/,
    );
  });
});
