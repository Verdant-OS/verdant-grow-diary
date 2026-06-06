/**
 * Tests for One-Tent Proof Record pure export rules.
 */
import { describe, expect, it } from "vitest";
import {
  ALLOWED_SOURCE_LABELS,
  ONE_TENT_PROOF_RECORD_KIND,
  ONE_TENT_PROOF_RECORD_VERSION,
  REDACTED_FIELD_NAMES,
  buildOneTentProofRecord,
  buildProofRecordFilename,
  canExportProofRecord,
  computeProofIntegrity,
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
    expect(r.noLiveDataPromise).toMatch(/unverified/i);
  });

  it("renders missing fields as null and never fabricates values", () => {
    const r = buildOneTentProofRecord({});
    expect(r.scope.growId).toBeNull();
    expect(r.scope.growName).toBeNull();
    expect(r.quickLog.diaryEntryId).toBeNull();
    expect(r.quickLog.actionType).toBeNull();
    expect(r.quickLog.photoAttached).toBeNull();
    expect(r.timeline.rowId).toBeNull();
    expect(r.timeline.routeObserved).toBeNull();
    expect(r.timeline.chipVisible).toBeNull();
    expect(r.aiDoctor.sessionId).toBeNull();
    expect(r.aiDoctor.confidence).toBeNull();
    expect(r.aiDoctor.riskLevel).toBeNull();
    expect(r.aiDoctor.missingInfoPresent).toBeNull();
    expect(r.aiDoctor.doNotDoPresent).toBeNull();
    expect(r.reading.metric).toBeNull();
    expect(r.reading.value).toBeNull();
    expect(r.reading.sourceLabel).toBeNull();
    expect(r.target.originalValue).toBeNull();
    expect(r.target.restored).toBeNull();
    expect(r.target.restoredAt).toBeNull();
    expect(r.target.restoreDiaryEntryId).toBeNull();
    expect(r.alert.id).toBeNull();
    expect(r.action.id).toBeNull();
    expect(r.action.linkedAlertId).toBeNull();
    expect(r.action.approvalGate.requiredObserved).toBeNull();
    expect(r.action.approvalGate.approvedAt).toBeNull();
    expect(r.followup.diaryEntryId).toBeNull();
    expect(r.followup.timelineChipVisible).toBeNull();
  });

  it("round-trips new quickLog/timeline/aiDoctor/approvalGate fields", () => {
    const r = buildOneTentProofRecord({
      quickLog: { diaryEntryId: "diary-1", actionType: "water", photoAttached: true },
      timeline: { rowId: "row-1", routeObserved: "/timeline", chipVisible: true },
      aiDoctor: {
        sessionId: "sess-1",
        confidence: "low",
        riskLevel: "medium",
        missingInfoPresent: true,
        doNotDoPresent: true,
      },
      action: {
        id: "act-1",
        linkedAlertId: "alert-1",
        approvalGate: { requiredObserved: true, approvedAt: "2026-06-06T12:00:00Z" },
      },
      target: {
        restored: true,
        restoredAt: "2026-06-06T15:00:00Z",
        restoreDiaryEntryId: "diary-2",
      },
    });
    expect(r.quickLog).toEqual({ diaryEntryId: "diary-1", actionType: "water", photoAttached: true });
    expect(r.timeline).toEqual({ rowId: "row-1", routeObserved: "/timeline", chipVisible: true });
    expect(r.aiDoctor).toEqual({
      sessionId: "sess-1",
      confidence: "low",
      riskLevel: "medium",
      missingInfoPresent: true,
      doNotDoPresent: true,
    });
    expect(r.action.linkedAlertId).toBe("alert-1");
    expect(r.action.approvalGate).toEqual({
      requiredObserved: true,
      approvedAt: "2026-06-06T12:00:00Z",
    });
    expect(r.target.restoredAt).toBe("2026-06-06T15:00:00Z");
    expect(r.target.restoreDiaryEntryId).toBe("diary-2");
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

describe("integrity block", () => {
  it("unverified is always true", () => {
    expect(buildOneTentProofRecord({}).integrity.unverified).toBe(true);
    expect(
      buildOneTentProofRecord({
        scope: { growId: "g", tentId: "t", plantId: "p" },
        quickLog: { diaryEntryId: "d" },
      }).integrity.unverified,
    ).toBe(true);
  });

  it("missingFields is deterministic and alphabetized for an empty record", () => {
    const m = buildOneTentProofRecord({}).integrity.missingFields;
    expect(m).toEqual([
      "action.id",
      "aiDoctor.sessionId",
      "alert.id",
      "followup.diaryEntryId",
      "quickLog.diaryEntryId",
      "reading.sourceLabel",
      "scope.growId",
      "scope.plantId",
      "scope.tentId",
      "timeline.rowId",
    ]);
    expect([...m]).toEqual([...m].sort());
  });

  it("missingFields shrinks as evidence is added", () => {
    const m = buildOneTentProofRecord({
      scope: { growId: "g", tentId: "t", plantId: "p" },
      quickLog: { diaryEntryId: "d" },
    }).integrity.missingFields;
    expect(m).not.toContain("scope.growId");
    expect(m).not.toContain("scope.tentId");
    expect(m).not.toContain("scope.plantId");
    expect(m).not.toContain("quickLog.diaryEntryId");
    expect(m).toContain("alert.id");
  });

  it("chronologyValid: true when timestamps are ordered", () => {
    const r = buildOneTentProofRecord({
      reading: { capturedAt: "2026-06-06T10:00:00Z" },
      alert: { createdAt: "2026-06-06T11:00:00Z" },
      action: {
        approvalGate: { approvedAt: "2026-06-06T11:30:00Z" },
        completedAt: "2026-06-06T12:00:00Z",
      },
      target: { restoredAt: "2026-06-06T13:00:00Z" },
    });
    expect(r.integrity.chronologyValid).toBe(true);
  });

  it("chronologyValid: false when action completion predates alert creation", () => {
    const r = buildOneTentProofRecord({
      alert: { createdAt: "2026-06-06T12:00:00Z" },
      action: { completedAt: "2026-06-06T10:00:00Z" },
    });
    expect(r.integrity.chronologyValid).toBe(false);
  });

  it("chronologyValid: null when no comparable timestamps are present", () => {
    expect(buildOneTentProofRecord({}).integrity.chronologyValid).toBeNull();
    const onlyOne = buildOneTentProofRecord({
      alert: { createdAt: "2026-06-06T12:00:00Z" },
    });
    expect(onlyOne.integrity.chronologyValid).toBeNull();
  });

  it("routesValid: true when every provided route matches APP_ROUTES (with :param)", () => {
    const r = buildOneTentProofRecord({
      reading: { routeObserved: "/plants/abc-123" },
      snapshotRoute: "/tents",
      timeline: { routeObserved: "/timeline" },
    });
    expect(r.integrity.routesValid).toBe(true);
  });

  it("routesValid: false when any provided route is not registered", () => {
    const r = buildOneTentProofRecord({
      reading: { routeObserved: "/totally-fake-route" },
    });
    expect(r.integrity.routesValid).toBe(false);
  });

  it("routesValid: null when no route strings are provided", () => {
    expect(buildOneTentProofRecord({}).integrity.routesValid).toBeNull();
  });

  it("computeProofIntegrity is a pure function over the record", () => {
    const r = buildOneTentProofRecord({});
    expect(computeProofIntegrity(r)).toEqual(r.integrity);
  });
});

describe("canExportProofRecord", () => {
  it("false when scope ids are missing", () => {
    expect(canExportProofRecord(buildOneTentProofRecord({}))).toBe(false);
  });

  it("false when scope is complete but no loop-step evidence id is present", () => {
    const r = buildOneTentProofRecord({
      scope: { growId: "g", tentId: "t", plantId: "p" },
    });
    expect(canExportProofRecord(r)).toBe(false);
  });

  it("true when scope is complete and any loop-step evidence id is present", () => {
    const r = buildOneTentProofRecord({
      scope: { growId: "g", tentId: "t", plantId: "p" },
      quickLog: { diaryEntryId: "d" },
    });
    expect(canExportProofRecord(r)).toBe(true);
  });
});

describe("ALLOWED_SOURCE_LABELS", () => {
  it("includes the seven enum values exposed to the UI", () => {
    expect([...ALLOWED_SOURCE_LABELS]).toEqual([
      "manual",
      "live",
      "csv",
      "demo",
      "stale",
      "invalid",
      "unknown",
    ]);
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
      scope: { growName: "Tent A" },
      // denylisted top-level field — should be stripped by redaction pass
      user_id: "uuid-x",
    } as any);

    const json = serializeProofRecordToJson(r);
    expect(json).toContain("Tent A");
    expect(json).not.toContain("uuid-x");
    expect(json.toLowerCase()).not.toContain("user_id");
  });

  it("retains every standing entry in REDACTED_FIELD_NAMES", () => {
    expect(new Set(REDACTED_FIELD_NAMES)).toEqual(
      new Set([
        "user_id",
        "userId",
        "owner_id",
        "ownerId",
        "access_token",
        "accessToken",
        "refresh_token",
        "refreshToken",
        "service_role",
        "serviceRole",
        "service_role_key",
        "serviceRoleKey",
        "bridge_token",
        "bridgeToken",
        "auth_header",
        "authHeader",
        "authorization",
        "Authorization",
        "apiKey",
        "api_key",
      ]),
    );
  });
});

describe("serializeProofRecordToJson", () => {
  it("produces parseable JSON with stable kind/version", () => {
    const r = buildOneTentProofRecord({ scope: { growName: "G" } });
    const parsed = JSON.parse(serializeProofRecordToJson(r));
    expect(parsed.kind).toBe(ONE_TENT_PROOF_RECORD_KIND);
    expect(parsed.version).toBe(ONE_TENT_PROOF_RECORD_VERSION);
    expect(parsed.reviewOnly).toBe(true);
    expect(parsed.integrity.unverified).toBe(true);
  });

  it("snapshot: top-level JSON key order is stable", () => {
    const r = buildOneTentProofRecord({});
    const parsed = JSON.parse(serializeProofRecordToJson(r));
    expect(Object.keys(parsed)).toEqual([
      "kind",
      "version",
      "reviewOnly",
      "noLiveDataPromise",
      "assembledAt",
      "scope",
      "quickLog",
      "timeline",
      "reading",
      "snapshotRoute",
      "aiDoctor",
      "target",
      "alert",
      "action",
      "followup",
      "uxFrictionNotes",
      "notes",
      "integrity",
    ]);
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
