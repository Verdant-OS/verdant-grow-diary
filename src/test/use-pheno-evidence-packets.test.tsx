import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const loadMock = vi.fn();
vi.mock("@/lib/phenoEvidenceReceiptService", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/phenoEvidenceReceiptService")
  >("@/lib/phenoEvidenceReceiptService");
  return { ...actual, loadPhenoEvidenceReceiptRows: (...a: unknown[]) => loadMock(...a) };
});

import { usePhenoEvidencePackets } from "@/hooks/usePhenoEvidencePackets";
import { buildQuickLogV2RefreshQueryKeys } from "@/lib/quickLogV2RefreshRules";

const GOALS = ["structure", "aroma"];

function receiptRow(plantId: string, goal: string, id = `d-${plantId}-${goal}`) {
  return {
    id,
    plant_id: plantId,
    entry_at: "2026-07-10T12:00:00.000Z",
    photo_url: null,
    details: {
      kind: "pheno_evidence_receipt",
      receipt_version: 1,
      source: "manual",
      evidence_only: true,
      hunt_id: "hunt-1",
      plant_id: plantId,
      evidence_goal: goal,
      stage: null,
      automatic_selection: false,
      action_queue_created: false,
      device_control: false,
    },
  };
}

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  loadMock.mockReset();
});

describe("usePhenoEvidencePackets", () => {
  it("disabled without a hunt or candidates — no fetch fired", () => {
    const { result } = renderHook(
      () => usePhenoEvidencePackets({ huntId: null, plantIds: ["p1"], configuredGoals: GOALS }),
      { wrapper },
    );
    expect(result.current.status).toBe("disabled");
    expect(loadMock).not.toHaveBeenCalled();
  });

  it("one batch call for the page; packets keyed per candidate", async () => {
    loadMock.mockResolvedValue({
      ok: true,
      rows: [receiptRow("p1", "aroma")],
      plantIds: ["p1", "p2"],
      truncated: false,
    });
    const { result } = renderHook(
      () =>
        usePhenoEvidencePackets({
          huntId: "hunt-1",
          plantIds: ["p2", "p1"],
          configuredGoals: GOALS,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(loadMock).toHaveBeenCalledWith({ huntId: "hunt-1", plantIds: ["p1", "p2"] });
    expect(result.current.packets.get("p1")!.recordedGoalCount).toBe(1);
    expect(result.current.packets.get("p2")!.recordedGoalCount).toBe(0);
    expect(result.current.truncated).toBe(false);
  });

  it("id-set membership change forms a new query (stale result dropped by key)", async () => {
    loadMock.mockResolvedValue({ ok: true, rows: [], plantIds: ["p1"], truncated: false });
    const { result, rerender } = renderHook(
      (props: { ids: string[] }) =>
        usePhenoEvidencePackets({
          huntId: "hunt-1",
          plantIds: props.ids,
          configuredGoals: GOALS,
        }),
      { wrapper, initialProps: { ids: ["p1"] } },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender({ ids: ["p1", "p2"] });
    await waitFor(() => expect(loadMock).toHaveBeenCalledTimes(2));
    expect(loadMock).toHaveBeenLastCalledWith({ huntId: "hunt-1", plantIds: ["p1", "p2"] });
  });

  it("same id-set in a different order reuses the cached batch (no refetch)", async () => {
    loadMock.mockResolvedValue({ ok: true, rows: [], plantIds: ["p1", "p2"], truncated: false });
    const { result, rerender } = renderHook(
      (props: { ids: string[] }) =>
        usePhenoEvidencePackets({
          huntId: "hunt-1",
          plantIds: props.ids,
          configuredGoals: GOALS,
        }),
      { wrapper, initialProps: { ids: ["p2", "p1"] } },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender({ ids: ["p1", "p2"] });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(loadMock).toHaveBeenCalledTimes(1);
  });

  it("load failure yields explicit unavailable packets for every candidate", async () => {
    loadMock.mockResolvedValue({ ok: false, error: "nope" });
    const { result } = renderHook(
      () =>
        usePhenoEvidencePackets({
          huntId: "hunt-1",
          plantIds: ["p1", "p2"],
          configuredGoals: GOALS,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.packets.get("p1")!.state).toBe("unavailable");
    expect(result.current.packets.get("p2")!.state).toBe("unavailable");
  });

  it("truncated batches surface truncated packets, never complete", async () => {
    loadMock.mockResolvedValue({
      ok: true,
      rows: [receiptRow("p1", "structure"), receiptRow("p1", "aroma")],
      plantIds: ["p1"],
      truncated: true,
    });
    const { result } = renderHook(
      () =>
        usePhenoEvidencePackets({ huntId: "hunt-1", plantIds: ["p1"], configuredGoals: GOALS }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.truncated).toBe(true);
    expect(result.current.packets.get("p1")!.state).toBe("truncated");
  });

  it("query key lives under the pheno_evidence_receipts family that Quick Log saves invalidate", async () => {
    loadMock.mockResolvedValue({ ok: true, rows: [], plantIds: ["p1"], truncated: false });
    const { result } = renderHook(
      () =>
        usePhenoEvidencePackets({ huntId: "hunt-1", plantIds: ["p1"], configuredGoals: GOALS }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const cached = client
      .getQueryCache()
      .findAll({ queryKey: ["pheno_evidence_receipts"] });
    expect(cached.length).toBe(1);
    // And the Quick Log v2 refresh plan invalidates exactly that prefix.
    const keys = buildQuickLogV2RefreshQueryKeys({
      targetType: "plant",
      targetId: "p1",
      tentId: null,
    });
    expect(keys).toContainEqual(["pheno_evidence_receipts"]);
  });

  it("invalidating the family refetches the packets (save → refresh loop)", async () => {
    loadMock.mockResolvedValue({ ok: true, rows: [], plantIds: ["p1"], truncated: false });
    const { result } = renderHook(
      () =>
        usePhenoEvidencePackets({ huntId: "hunt-1", plantIds: ["p1"], configuredGoals: GOALS }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(loadMock).toHaveBeenCalledTimes(1);
    await client.invalidateQueries({ queryKey: ["pheno_evidence_receipts"] });
    await waitFor(() => expect(loadMock).toHaveBeenCalledTimes(2));
  });
});
