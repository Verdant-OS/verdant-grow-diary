/**
 * #1845 review — ActionDetail reloads the action after a refresh or a
 * transition. The refs usually keep the same ids, but the stored reading may
 * have been superseded since, so each load of the action must re-read the
 * rows and show "not checked" until the new read settles.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { EvidenceSensorRow } from "@/lib/actionEvidenceVerificationRules";
import type { OriginatingTimelineEventRef } from "@/lib/originatingTimelineEventRules";

const fetchRows = vi.fn<(ids: string[]) => Promise<EvidenceSensorRow[]>>();
vi.mock("@/lib/actionEvidenceVerificationService", () => ({
  fetchEvidenceSensorRows: (ids: string[]) => fetchRows(ids),
}));

import { useActionEvidenceVerification } from "@/hooks/useActionEvidenceVerification";

const TENT = "11111111-1111-4111-8111-111111111111";
const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AT = "2026-09-30T12:00:00.000Z";
const REFS: OriginatingTimelineEventRef[] = [
  { id: ID, type: "sensor_snapshot", occurred_at: AT, source: "live" },
];
const ROW: EvidenceSensorRow = {
  id: ID,
  tent_id: TENT,
  metric: "humidity_pct",
  source: "live",
  quality: "ok",
  captured_at: AT,
  ts: AT,
  correction_valid: true,
};

beforeEach(() => {
  fetchRows.mockReset();
});

describe("useActionEvidenceVerification — re-reads on each action load", () => {
  it("a new revision with the same ids re-reads and drops a superseded reading", async () => {
    fetchRows.mockResolvedValueOnce([ROW]);
    const { result, rerender } = renderHook(
      ({ revision }) => useActionEvidenceVerification(REFS, TENT, "humidity", revision),
      { initialProps: { revision: {} as unknown } },
    );
    await waitFor(() => expect(result.current.get(ID)?.status).toBe("verified"));

    let settle: (rows: EvidenceSensorRow[]) => void = () => {};
    fetchRows.mockReturnValueOnce(new Promise((r) => (settle = r)));
    rerender({ revision: {} });
    await waitFor(() => expect(result.current.get(ID)?.reason).toBe("not_checked"));

    settle([]);
    await waitFor(() => expect(result.current.get(ID)?.reason).toBe("not_found"));
    expect(fetchRows).toHaveBeenCalledTimes(2);
  });

  it("re-rendering with the same revision does not re-read", async () => {
    fetchRows.mockResolvedValue([ROW]);
    const revision = {};
    const { result, rerender } = renderHook(() =>
      useActionEvidenceVerification(REFS, TENT, "humidity", revision),
    );
    await waitFor(() => expect(result.current.get(ID)?.status).toBe("verified"));
    rerender();
    rerender();
    expect(fetchRows).toHaveBeenCalledTimes(1);
  });
});
