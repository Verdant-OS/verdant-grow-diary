/**
 * A Quick Log save must refresh the one-tent irrigation ledger.
 *
 * The tent and plant irrigation panels (dryback strip, watering cadence,
 * irrigation history) read `useTentIrrigationLedger`, keyed under
 * IRRIGATION_LEDGER_QUERY_KEY_PREFIX. Before this fix the post-save refresh
 * never invalidated that prefix, so a just-saved Water entry stayed missing
 * from those panels until the grower reloaded the page.
 */
import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  applyQuickLogV2Refresh,
  buildQuickLogV2RefreshQueryKeys,
} from "@/lib/quickLogV2RefreshRules";
import { IRRIGATION_LEDGER_QUERY_KEY_PREFIX } from "@/lib/irrigation/irrigationLedgerRules";

const tentLedgerKey = [...IRRIGATION_LEDGER_QUERY_KEY_PREFIX, "owner-1", "tent-1", "all", 25];
const plantLedgerKey = [...IRRIGATION_LEDGER_QUERY_KEY_PREFIX, "owner-1", "tent-1", "plant-1", 25];

function seededClient(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(tentLedgerKey, { pages: [], pageParams: [null] });
  client.setQueryData(plantLedgerKey, { pages: [], pageParams: [null] });
  return client;
}

describe("Quick Log v2 refresh reaches the irrigation ledger", () => {
  it("the refresh plan includes the irrigation ledger prefix for tent and plant saves", () => {
    const prefix = JSON.stringify([...IRRIGATION_LEDGER_QUERY_KEY_PREFIX]);
    const tentKeys = buildQuickLogV2RefreshQueryKeys({
      targetType: "tent",
      targetId: "tent-1",
      tentId: "tent-1",
    }).map((k) => JSON.stringify(k));
    const plantKeys = buildQuickLogV2RefreshQueryKeys({
      targetType: "plant",
      targetId: "plant-1",
      tentId: "tent-1",
    }).map((k) => JSON.stringify(k));
    expect(tentKeys).toContain(prefix);
    expect(plantKeys).toContain(prefix);
  });

  it("a tent-target save invalidates the cached tent and plant ledger queries", () => {
    const client = seededClient();
    applyQuickLogV2Refresh(client, { targetType: "tent", targetId: "tent-1", tentId: "tent-1" });
    expect(client.getQueryState(tentLedgerKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(plantLedgerKey)?.isInvalidated).toBe(true);
  });

  it("a plant-target save invalidates the cached ledger queries", () => {
    const client = seededClient();
    applyQuickLogV2Refresh(client, { targetType: "plant", targetId: "plant-1", tentId: "tent-1" });
    expect(client.getQueryState(plantLedgerKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(tentLedgerKey)?.isInvalidated).toBe(true);
  });
});
