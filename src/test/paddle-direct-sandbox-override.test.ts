/**
 * The direct sandbox transport stays only because an explicit override is
 * part of the module. This asserts that record, not the file text.
 */
import { describe, expect, it } from "vitest";
import {
  DIRECT_SANDBOX_TRANSPORT_OVERRIDE,
  directEventEnrichesProductCatalog,
} from "../../supabase/functions/_shared/paddleDirectTransport";

describe("direct sandbox transport override", () => {
  it("records the current approval to keep the env-gated sandbox transport", () => {
    expect(DIRECT_SANDBOX_TRANSPORT_OVERRIDE).toEqual({
      agentsSection: "72-77",
      approvedBy: "Cheeko via Verdante",
      approvedOn: "2026-10-19",
      keepsDirectSandboxTransport: true,
      productionPathWhenUnset: "gateway",
    });
  });

  it("enriches product metadata only for subscription upsert events", () => {
    expect(directEventEnrichesProductCatalog("subscription.created")).toBe(true);
    expect(directEventEnrichesProductCatalog("subscription.updated")).toBe(true);
    expect(directEventEnrichesProductCatalog("subscription.canceled")).toBe(false);
    expect(directEventEnrichesProductCatalog("transaction.completed")).toBe(false);
    expect(directEventEnrichesProductCatalog(undefined)).toBe(false);
  });
});
