import { describe, it, expect } from "vitest";
import { buildIngestAuditRecord } from "@/lib/sensorIngestAuditRules";

const USER = "11111111-1111-1111-1111-111111111111";
const TENT = "22222222-2222-2222-2222-222222222222";
const TOKEN = "33333333-3333-3333-3333-333333333333";
const CAPTURED = "2026-05-27T12:00:00.000Z";

describe("buildIngestAuditRecord", () => {
  it("builds a JWT audit record with null bridge_token_id", () => {
    const r = buildIngestAuditRecord({
      authKind: "jwt",
      userId: USER,
      tentId: TENT,
      source: "webhook_generic",
      capturedAt: CAPTURED,
      rowsReceived: 3,
      rowsInserted: 2,
    });
    expect(r).toEqual({
      user_id: USER,
      tent_id: TENT,
      auth_type: "jwt",
      bridge_token_id: null,
      source: "webhook_generic",
      captured_at: CAPTURED,
      rows_received: 3,
      rows_inserted: 2,
    });
  });

  it("builds a bridge audit record carrying the bridge_token_id", () => {
    const r = buildIngestAuditRecord({
      authKind: "bridge",
      userId: USER,
      tentId: TENT,
      bridgeTokenId: TOKEN,
      source: "esp32_diy",
      capturedAt: CAPTURED,
      rowsReceived: 1,
      rowsInserted: 1,
    });
    expect(r?.auth_type).toBe("bridge");
    expect(r?.bridge_token_id).toBe(TOKEN);
  });

  it("rejects JWT records that try to attach a bridge_token_id", () => {
    const r = buildIngestAuditRecord({
      authKind: "jwt",
      userId: USER,
      tentId: TENT,
      bridgeTokenId: TOKEN,
      source: "webhook_generic",
      capturedAt: CAPTURED,
      rowsReceived: 1,
      rowsInserted: 1,
    });
    expect(r).toBeNull();
  });

  it("rejects invalid uuid, missing source, bad date, or negative counts", () => {
    const base = {
      authKind: "bridge" as const,
      userId: USER,
      tentId: TENT,
      bridgeTokenId: TOKEN,
      source: "esp32_diy",
      capturedAt: CAPTURED,
      rowsReceived: 1,
      rowsInserted: 1,
    };
    expect(buildIngestAuditRecord({ ...base, userId: "nope" })).toBeNull();
    expect(buildIngestAuditRecord({ ...base, tentId: "nope" })).toBeNull();
    expect(buildIngestAuditRecord({ ...base, source: "" })).toBeNull();
    expect(buildIngestAuditRecord({ ...base, capturedAt: "not-a-date" })).toBeNull();
    expect(buildIngestAuditRecord({ ...base, rowsReceived: -1 })).toBeNull();
    expect(buildIngestAuditRecord({ ...base, rowsInserted: 5, rowsReceived: 1 })).toBeNull();
    expect(
      buildIngestAuditRecord({ ...(base as any), authKind: "other" }),
    ).toBeNull();
  });

  it("drops a malformed bridge_token_id on the bridge path instead of failing", () => {
    const r = buildIngestAuditRecord({
      authKind: "bridge",
      userId: USER,
      tentId: TENT,
      bridgeTokenId: "not-a-uuid",
      source: "esp32_diy",
      capturedAt: CAPTURED,
      rowsReceived: 2,
      rowsInserted: 2,
    });
    expect(r?.bridge_token_id).toBeNull();
  });
});
