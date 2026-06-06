/**
 * Tests for One-Tent Proof Record pure export rules.
 *
 * Safety scope:
 *  - Builds valid JSON proof record.
 *  - Redacts user_id, tokens, service_role, bridge tokens, auth headers.
 *  - Filename pattern is correct.
 *  - Manual + demo/stale/invalid source labels are preserved.
 *  - Missing fields render as missing (null), not fabricated.
 */
import { describe, expect, it } from "vitest";
import {
  ONE_TENT_PROOF_RECORD_KIND,
  ONE_TENT_PROOF_RECORD_VERSION,
  REDACTED_FIELD_NAMES,
  buildOneTentProofRecord,
  buildProofRecordFilename,
  formatProofRecordTimestamp,
  redactRecordInput,
  serializeProofRecordToJson,
} from "@/lib/oneTentProofRecordExportRules";

describe("buildOneTentProofRecord", () => {
  it("returns a kind/version-tagged review-only record for empty input", () => {
    const r = buildOneTentProofRecord(undefined);
    expect(r.kind).toBe(ONE_TENT_PROOF_RECORD_KIND);
    expect(r.version).toBe(ONE_TENT_PROOF_RECORD_VERSION);
    expect(r.reviewOnly).toBe(true);
    expect(r.noLiveDataPromise).toMatch(/review only/i);
  });

  it("renders missing fields as null and never fabricates values", () => {
    const r = buildOneTentProofRecord({});
    expect(r.scope.growId).toBeNull();
    expect(r.scope.growName).toBeNull();
    expect(r.reading.metric).toBeNull();
    expect(r.reading.value).toBeNull();
    expect(r.reading.sourceLabel).toBeNull();
    expect(r.target.originalValue).toBeNull();
    expect(r.target.restored).toBeNull();
    expect(r.alert.id).toBeNull();
    expect(r.action.id).toBeNull();
    expect(r.followup.diaryEntryId).toBeNull();
    expect(r.followup.timelineChipVisible).toBeNull();
  });

  it("preserves the manual source label verbatim", () => {
    const r = buildOneTentProofRecord({
      reading: { sourceLabel: "manual", metric: "temp", value: 24.5, unit: "C" },
    });
    expect(r.reading.sourceLabel).toBe("manual");
    expect(r.reading.value).toBe(24.5);
    expect(r.reading.unit).toBe("C");
  });

  it.each(["demo", "stale", "invalid", "live", "csv", "unknown"] as const)(
    "preserves the %s source label",
    (label) => {
      const r = buildOneTentProofRecord({ reading: { sourceLabel: label } });
      expect(r.reading.sourceLabel).toBe(label);
    },
  );

  it("rejects unknown source labels (becomes null, not fabricated)", () => {
    const r = buildOneTentProofRecord({
      // @ts-expect-error testing unknown label
      reading: { sourceLabel: "totally-made-up" },
    });
    expect(r.reading.sourceLabel).toBeNull();
  });

  it("captures original + temporary target with restored=true/false explicitly", () => {
    const r = buildOneTentProofRecord({
      target: { metric: "humidity", originalValue: 60, temporaryValue: 70, restored: true },
    });
    expect(r.target.originalValue).toBe(60);
    expect(r.target.temporaryValue).toBe(70);
    expect(r.target.restored).toBe(true);
  });
});

describe("redactRecordInput", () => {
  it("strips all denylisted internal/private field names", () => {
    const dirty = {
      scope: { growName: "G1", user_id: "uuid-1", ownerId: "uuid-2" },
      reading: {
        metric: "temp",
        access_token: "tok-a",
        refreshToken: "tok-r",
        authorization: "Bearer abc",
        bridge_token: "bt-1",
        service_role_key: "sr-key",
        apiKey: "ak",
      },
      nested: { authHeader: "x", inner: { Authorization: "y", keep: "ok" } },
    };
    const clean = redactRecordInput(dirty) as Record<string, any>;
    expect(JSON.stringify(clean)).not.toMatch(/tok-a|tok-r|sr-key|Bearer abc|bt-1|uuid-1|uuid-2|ak/);
    expect(clean.nested.inner.keep).toBe("ok");
    for (const name of REDACTED_FIELD_NAMES) {
      expect(JSON.stringify(clean).toLowerCase()).not.toContain(`"${name.toLowerCase()}":`);
    }
  });

  it("does not leak redacted fields into the built record", () => {
    const r = buildOneTentProofRecord({
      scope: {
        growName: "Tent A",
      },
      // denylisted top-level field — should be stripped by redaction pass
      user_id: "uuid-x",
    } as any);

    const json = serializeProofRecordToJson(r);
    expect(json).toContain("Tent A");
    expect(json).not.toContain("uuid-x");
    expect(json.toLowerCase()).not.toContain("user_id");
  });
});

describe("serializeProofRecordToJson", () => {
  it("produces parseable JSON with stable kind/version", () => {
    const r = buildOneTentProofRecord({ scope: { growName: "G" } });
    const parsed = JSON.parse(serializeProofRecordToJson(r));
    expect(parsed.kind).toBe(ONE_TENT_PROOF_RECORD_KIND);
    expect(parsed.version).toBe(ONE_TENT_PROOF_RECORD_VERSION);
    expect(parsed.reviewOnly).toBe(true);
  });
});

describe("buildProofRecordFilename", () => {
  it("matches verdant-one-tent-proof-record-YYYYMMDD-HHMMSS.json", () => {
    const d = new Date(Date.UTC(2026, 5, 7, 9, 3, 5));
    expect(formatProofRecordTimestamp(d)).toBe("20260607-090305");
    expect(buildProofRecordFilename(d)).toBe(
      "verdant-one-tent-proof-record-20260607-090305.json",
    );
    expect(buildProofRecordFilename(d)).toMatch(
      /^verdant-one-tent-proof-record-\d{8}-\d{6}\.json$/,
    );
  });
});
