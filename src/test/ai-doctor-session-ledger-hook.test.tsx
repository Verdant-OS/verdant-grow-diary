/**
 * useAiDoctorSessionLedger — runtime behavior tests.
 *
 * Verifies: metadata-only select, newest-first + range pagination, hasMore
 * via the one-extra-row technique, archived-row exclusion from name maps,
 * empty-id-list short-circuiting (no `.in("id", [])` call), and that no
 * write/RPC/edge-function path is ever exercised.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// --- per-table supabase mock ---
const sessionsRangeSpy = vi.fn(async (_from: number, _to: number) => ({
  data: [] as unknown[],
  error: null as unknown,
}));
const sessionsOrderSpy = vi.fn((_col: string, _opts: unknown) => ({ range: sessionsRangeSpy }));
const sessionsSelectSpy = vi.fn((_select: string) => ({ order: sessionsOrderSpy }));

const growsInSpy = vi.fn(async (_col: string, _ids: string[]) => ({
  data: [] as unknown[],
  error: null as unknown,
}));
const growsSelectSpy = vi.fn((_select: string) => ({ in: growsInSpy }));

const tentsInSpy = vi.fn(async (_col: string, _ids: string[]) => ({
  data: [] as unknown[],
  error: null as unknown,
}));
const tentsSelectSpy = vi.fn((_select: string) => ({ in: tentsInSpy }));

const plantsInSpy = vi.fn(async (_col: string, _ids: string[]) => ({
  data: [] as unknown[],
  error: null as unknown,
}));
const plantsSelectSpy = vi.fn((_select: string) => ({ in: plantsInSpy }));

const fromSpy = vi.fn((table: string) => {
  if (table === "ai_doctor_sessions") return { select: sessionsSelectSpy };
  if (table === "grows") return { select: growsSelectSpy };
  if (table === "tents") return { select: tentsSelectSpy };
  if (table === "plants") return { select: plantsSelectSpy };
  throw new Error(`unexpected table in test mock: ${table}`);
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => fromSpy(table) },
}));

import {
  useAiDoctorSessionLedger,
  AI_DOCTOR_SESSION_LEDGER_PAGE_SIZE,
} from "@/hooks/useAiDoctorSessionLedger";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  fromSpy.mockClear();
  sessionsSelectSpy.mockClear();
  sessionsOrderSpy.mockClear();
  sessionsRangeSpy.mockClear();
  growsSelectSpy.mockClear();
  growsInSpy.mockClear();
  tentsSelectSpy.mockClear();
  tentsInSpy.mockClear();
  plantsSelectSpy.mockClear();
  plantsInSpy.mockClear();
  sessionsRangeSpy.mockResolvedValue({ data: [], error: null });
});

describe("useAiDoctorSessionLedger — metadata-only select contract", () => {
  it("selects only the approved metadata columns — never user_id/question/analysis/etc.", () => {
    renderHook(() => useAiDoctorSessionLedger(0), { wrapper });
    const arg = (sessionsSelectSpy.mock.calls.at(-1)?.[0] ?? "") as string;
    for (const forbidden of [
      "user_id",
      "question",
      "analysis",
      "diagnosis",
      "suggested_actions",
      "raw_confidence",
      "displayed_confidence",
      "context_confidence_ceiling",
      "context_sufficiency",
    ]) {
      expect(arg).not.toContain(forbidden);
    }
    for (const required of [
      "id",
      "created_at",
      "grow_id",
      "tent_id",
      "plant_id",
      "sensor_snapshot_status",
      "sensor_snapshot_reason_code",
      "counts_as_healthy_evidence",
      "sensor_evidence_mode",
      "sensor_evidence_evaluated_at",
    ]) {
      expect(arg).toContain(required);
    }
  });
});

describe("useAiDoctorSessionLedger — pagination", () => {
  it("orders newest-first and requests one extra row for hasMore detection", async () => {
    renderHook(() => useAiDoctorSessionLedger(0), { wrapper });
    await waitFor(() => expect(sessionsRangeSpy).toHaveBeenCalled());
    expect(sessionsOrderSpy).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(sessionsRangeSpy).toHaveBeenCalledWith(0, AI_DOCTOR_SESSION_LEDGER_PAGE_SIZE);
  });

  it("page 1 requests the next range window", async () => {
    renderHook(() => useAiDoctorSessionLedger(1), { wrapper });
    await waitFor(() => expect(sessionsRangeSpy).toHaveBeenCalled());
    const pageSize = AI_DOCTOR_SESSION_LEDGER_PAGE_SIZE;
    expect(sessionsRangeSpy).toHaveBeenCalledWith(pageSize, pageSize * 2);
  });

  it("hasMore is true only when the extra row beyond pageSize is present", async () => {
    const rows = Array.from({ length: AI_DOCTOR_SESSION_LEDGER_PAGE_SIZE + 1 }, (_, i) => ({
      id: `id-${i}`,
      created_at: "2026-01-01T00:00:00.000Z",
      grow_id: null,
      tent_id: null,
      plant_id: null,
      sensor_snapshot_status: null,
      sensor_snapshot_reason_code: null,
      counts_as_healthy_evidence: null,
      sensor_evidence_mode: null,
      sensor_evidence_evaluated_at: null,
    }));
    sessionsRangeSpy.mockResolvedValueOnce({ data: rows, error: null });
    const { result } = renderHook(() => useAiDoctorSessionLedger(0), { wrapper });
    await waitFor(() => expect(result.current.data?.hasMore).toBe(true));
    expect(result.current.data?.entries).toHaveLength(AI_DOCTOR_SESSION_LEDGER_PAGE_SIZE);
  });
});

describe("useAiDoctorSessionLedger — scope label resolution", () => {
  it("excludes archived rows from the resolved name map (they render as unavailable downstream)", async () => {
    sessionsRangeSpy.mockResolvedValueOnce({
      data: [
        {
          id: "s1",
          created_at: "2026-01-01T00:00:00.000Z",
          grow_id: "grow-1",
          tent_id: null,
          plant_id: null,
          sensor_snapshot_status: null,
          sensor_snapshot_reason_code: null,
          counts_as_healthy_evidence: null,
          sensor_evidence_mode: null,
          sensor_evidence_evaluated_at: null,
        },
      ],
      error: null,
    });
    growsInSpy.mockResolvedValueOnce({
      data: [{ id: "grow-1", name: "Archived Grow", is_archived: true }],
      error: null,
    });
    const { result } = renderHook(() => useAiDoctorSessionLedger(0), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    const entry = result.current.data!.entries[0];
    expect(entry.grow.label).toBe("Archived or unavailable");
    expect(entry.grow.archivedOrUnavailable).toBe(true);
  });

  it("resolves a non-archived name normally", async () => {
    sessionsRangeSpy.mockResolvedValueOnce({
      data: [
        {
          id: "s1",
          created_at: "2026-01-01T00:00:00.000Z",
          grow_id: "grow-1",
          tent_id: null,
          plant_id: null,
          sensor_snapshot_status: null,
          sensor_snapshot_reason_code: null,
          counts_as_healthy_evidence: null,
          sensor_evidence_mode: null,
          sensor_evidence_evaluated_at: null,
        },
      ],
      error: null,
    });
    growsInSpy.mockResolvedValueOnce({
      data: [{ id: "grow-1", name: "Flower Grow", is_archived: false }],
      error: null,
    });
    const { result } = renderHook(() => useAiDoctorSessionLedger(0), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data!.entries[0].grow.label).toBe("Flower Grow");
  });

  it("never calls .in() for a scope table when no rows reference it (short-circuits, no empty-list query)", async () => {
    sessionsRangeSpy.mockResolvedValueOnce({
      data: [
        {
          id: "s1",
          created_at: "2026-01-01T00:00:00.000Z",
          grow_id: null,
          tent_id: null,
          plant_id: null,
          sensor_snapshot_status: null,
          sensor_snapshot_reason_code: null,
          counts_as_healthy_evidence: null,
          sensor_evidence_mode: null,
          sensor_evidence_evaluated_at: null,
        },
      ],
      error: null,
    });
    const { result } = renderHook(() => useAiDoctorSessionLedger(0), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(growsInSpy).not.toHaveBeenCalled();
    expect(tentsInSpy).not.toHaveBeenCalled();
    expect(plantsInSpy).not.toHaveBeenCalled();
  });
});

describe("useAiDoctorSessionLedger — safety", () => {
  it("never touches sensor_readings or any write/RPC/edge-function surface", async () => {
    renderHook(() => useAiDoctorSessionLedger(0), { wrapper });
    await waitFor(() => expect(sessionsRangeSpy).toHaveBeenCalled());
    const calledTables = fromSpy.mock.calls.map((c) => c[0]);
    expect(calledTables).not.toContain("sensor_readings");
    expect(calledTables).not.toContain("action_queue");
    expect(calledTables).not.toContain("alerts");
  });
});
