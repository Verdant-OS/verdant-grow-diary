/**
 * quicklogManualDiagnosticsRules — classification for /diagnostics/quicklog.
 *
 * Covers the happy path, boundary states (legacy link key, missing/multiple
 * mirrors, pre-migration column gaps), null/invalid untrusted details JSON,
 * deterministic ordering, ACL probe classification, and the diary↔grow-event
 * consistency report.
 */
import { describe, expect, it } from "vitest";
import {
  buildQuicklogConsistencyReport,
  buildQuicklogManualEntryDiagnostics,
  classifyQuicklogPrivateProbe,
  classifyQuicklogWrapperProbe,
  QUICKLOG_PRIVATE_HELPER_PROBES,
  readDetailsLoggedAt,
  readLinkedGrowEventId,
  sameInstant,
  summarizeQuicklogManualDiagnostics,
  type QuicklogDiagnosticsDiaryRow,
  type QuicklogDiagnosticsEventRow,
} from "@/lib/quicklogManualDiagnosticsRules";

const EVENT_ID = "d7147503-d7ac-4879-9f8a-74210fc0b504";
const OTHER_EVENT_ID = "b8833070-f4a3-4fcc-a66d-3d05391d9f8d";

function event(overrides: Partial<QuicklogDiagnosticsEventRow> = {}): QuicklogDiagnosticsEventRow {
  return {
    id: EVENT_ID,
    event_type: "watering",
    occurred_at: "2026-08-19T05:00:00+00:00",
    created_at: "2026-08-19T08:00:00+00:00",
    logged_at: "2026-08-19T08:00:00+00:00",
    ...overrides,
  };
}

function mirror(overrides: Partial<QuicklogDiagnosticsDiaryRow> = {}): QuicklogDiagnosticsDiaryRow {
  return {
    id: "diary-1",
    entry_at: "2026-08-19T05:00:00Z",
    logged_at: "2026-08-19T08:00:00Z",
    details: {
      linked_grow_event_id: EVENT_ID,
      logged_at: "2026-08-19T08:00:00Z",
    },
    ...overrides,
  };
}

describe("readLinkedGrowEventId — untrusted details JSON", () => {
  it("reads the modern key, lowercased", () => {
    const result = readLinkedGrowEventId({ linked_grow_event_id: EVENT_ID.toUpperCase() });
    expect(result).toEqual({ id: EVENT_ID, key: "linked_grow_event_id" });
  });

  it("falls back to the legacy grow_event_id key", () => {
    expect(readLinkedGrowEventId({ grow_event_id: EVENT_ID })).toEqual({
      id: EVENT_ID,
      key: "grow_event_id",
    });
  });

  it("prefers the modern key when both are present", () => {
    expect(
      readLinkedGrowEventId({ linked_grow_event_id: EVENT_ID, grow_event_id: OTHER_EVENT_ID }).key,
    ).toBe("linked_grow_event_id");
  });

  it("rejects null, arrays, scalars, malformed and non-string values", () => {
    for (const details of [
      null,
      undefined,
      "text",
      42,
      [EVENT_ID],
      { linked_grow_event_id: "not-a-uuid" },
      { linked_grow_event_id: 42 },
      { linked_grow_event_id: `${EVENT_ID} ` },
    ]) {
      expect(readLinkedGrowEventId(details).id).toBeNull();
    }
  });
});

describe("readDetailsLoggedAt — server parser acceptance rules", () => {
  it("accepts explicit-zone RFC3339 values", () => {
    expect(readDetailsLoggedAt({ logged_at: "2026-08-19T08:00:00Z" })).toEqual({
      present: true,
      parseable: true,
      value: "2026-08-19T08:00:00Z",
    });
    expect(readDetailsLoggedAt({ logged_at: "2026-08-19T08:00:00.123+02:00" }).parseable).toBe(
      true,
    );
  });

  it("marks zone-less, non-string, and junk values unparseable", () => {
    expect(readDetailsLoggedAt({ logged_at: "2026-08-19T08:00:00" }).parseable).toBe(false);
    expect(readDetailsLoggedAt({ logged_at: "yesterday afternoon-ish" }).parseable).toBe(false);
    expect(readDetailsLoggedAt({ logged_at: 1700000000 }).parseable).toBe(false);
  });

  it("reports absence distinctly from unparseability", () => {
    expect(readDetailsLoggedAt({})).toEqual({ present: false, parseable: false, value: null });
    expect(readDetailsLoggedAt(null).present).toBe(false);
  });
});

describe("sameInstant", () => {
  it("tolerates Z vs +00:00 formatting of the same instant", () => {
    expect(sameInstant("2026-08-19T08:00:00Z", "2026-08-19T08:00:00+00:00")).toBe(true);
  });
  it("rejects different instants, nulls, and junk", () => {
    expect(sameInstant("2026-08-19T08:00:00Z", "2026-08-19T08:00:01Z")).toBe(false);
    expect(sameInstant(null, "2026-08-19T08:00:00Z")).toBe(false);
    expect(sameInstant("junk", "2026-08-19T08:00:00Z")).toBe(false);
  });
});

describe("buildQuicklogManualEntryDiagnostics", () => {
  it("classifies a fully-linked wrapper save as ok with full parity", () => {
    const rows = buildQuicklogManualEntryDiagnostics({
      events: [event()],
      diaryEntries: [mirror()],
      auditEvents: [{ grow_event_id: EVENT_ID, status: "save_succeeded" }],
      loggedAtColumnAvailable: true,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      severity: "ok",
      mirrorStatus: "linked",
      loggedAtStatus: "parity",
      detailsLoggedAtStatus: "parity",
      entryAtMatchesOccurredAt: true,
      auditStatuses: ["save_succeeded"],
    });
  });

  it("orders the audit trail chronologically regardless of input order", () => {
    const rows = buildQuicklogManualEntryDiagnostics({
      events: [event()],
      diaryEntries: [mirror()],
      auditEvents: [
        {
          grow_event_id: EVENT_ID,
          status: "save_succeeded",
          created_at: "2026-08-19T08:00:01Z",
        },
        {
          grow_event_id: EVENT_ID,
          status: "save_started",
          created_at: "2026-08-19T08:00:00Z",
        },
      ],
      loggedAtColumnAvailable: true,
    });
    expect(rows[0].auditStatuses).toEqual(["save_started", "save_succeeded"]);
  });

  it("marks legacy-key links and missing mirrors as warn (historical states)", () => {
    const rows = buildQuicklogManualEntryDiagnostics({
      events: [event(), event({ id: OTHER_EVENT_ID, created_at: "2026-08-19T07:00:00Z" })],
      diaryEntries: [
        mirror({ details: { grow_event_id: EVENT_ID, logged_at: "2026-08-19T08:00:00Z" } }),
      ],
      loggedAtColumnAvailable: true,
    });
    expect(rows[0].mirrorStatus).toBe("linked_legacy_key");
    expect(rows[0].severity).toBe("warn");
    expect(rows[1].mirrorStatus).toBe("missing");
    expect(rows[1].severity).toBe("warn");
  });

  it("marks captured-timestamp divergence between the two rows as fail", () => {
    const rows = buildQuicklogManualEntryDiagnostics({
      events: [event()],
      diaryEntries: [
        mirror({
          logged_at: "2026-08-19T09:30:00Z",
          details: { linked_grow_event_id: EVENT_ID, logged_at: "2026-08-19T09:30:00Z" },
        }),
      ],
      loggedAtColumnAvailable: true,
    });
    expect(rows[0].loggedAtStatus).toBe("mismatch");
    expect(rows[0].severity).toBe("fail");
  });

  it("marks an unparseable mirror details stamp as fail", () => {
    const rows = buildQuicklogManualEntryDiagnostics({
      events: [event()],
      diaryEntries: [
        mirror({ details: { linked_grow_event_id: EVENT_ID, logged_at: "no-zone-here" } }),
      ],
      loggedAtColumnAvailable: true,
    });
    expect(rows[0].detailsLoggedAtStatus).toBe("unparseable");
    expect(rows[0].severity).toBe("fail");
  });

  it("marks multiple mirrors for one event as fail", () => {
    const rows = buildQuicklogManualEntryDiagnostics({
      events: [event()],
      diaryEntries: [mirror(), mirror({ id: "diary-2" })],
      loggedAtColumnAvailable: true,
    });
    expect(rows[0].mirrorStatus).toBe("multiple");
    expect(rows[0].severity).toBe("fail");
  });

  it("degrades to column_unavailable (warn, never healthy) when logged_at is missing from the schema", () => {
    const rows = buildQuicklogManualEntryDiagnostics({
      events: [event({ logged_at: undefined })],
      diaryEntries: [mirror({ logged_at: undefined, details: { linked_grow_event_id: EVENT_ID } })],
      loggedAtColumnAvailable: false,
    });
    expect(rows[0].loggedAtStatus).toBe("column_unavailable");
    expect(rows[0].severity).toBe("warn");
  });

  it("orders deterministically: created_at descending, id ascending on ties", () => {
    const rows = buildQuicklogManualEntryDiagnostics({
      events: [
        event({ id: OTHER_EVENT_ID, created_at: "2026-08-19T08:00:00Z" }),
        event({ id: EVENT_ID, created_at: "2026-08-19T08:00:00Z" }),
        event({ id: "00000000-0000-4000-8000-000000000001", created_at: "2026-08-19T09:00:00Z" }),
      ],
      diaryEntries: [],
      loggedAtColumnAvailable: true,
    });
    expect(rows.map((row) => row.growEventId)).toEqual([
      "00000000-0000-4000-8000-000000000001",
      OTHER_EVENT_ID,
      EVENT_ID,
    ]);
    const again = buildQuicklogManualEntryDiagnostics({
      events: [
        event({ id: EVENT_ID, created_at: "2026-08-19T08:00:00Z" }),
        event({ id: "00000000-0000-4000-8000-000000000001", created_at: "2026-08-19T09:00:00Z" }),
        event({ id: OTHER_EVENT_ID, created_at: "2026-08-19T08:00:00Z" }),
      ],
      diaryEntries: [],
      loggedAtColumnAvailable: true,
    });
    expect(again.map((row) => row.growEventId)).toEqual(rows.map((row) => row.growEventId));
  });

  it("summarizes severities with exact counts", () => {
    const rows = buildQuicklogManualEntryDiagnostics({
      events: [event(), event({ id: OTHER_EVENT_ID, created_at: "2026-08-19T07:00:00Z" })],
      diaryEntries: [mirror()],
      loggedAtColumnAvailable: true,
    });
    expect(summarizeQuicklogManualDiagnostics(rows)).toEqual({
      total: 2,
      ok: 1,
      warn: 1,
      fail: 0,
    });
  });
});

describe("classifyQuicklogPrivateProbe — five postgres-only helpers", () => {
  it("enumerates exactly the five private helpers", () => {
    expect(QUICKLOG_PRIVATE_HELPER_PROBES.map((probe) => probe.functionName)).toEqual([
      "quicklog_save_manual_pre_logged_at",
      "quicklog_try_parse_logged_at",
      "quicklog_try_parse_uuid",
      "quicklog_stamp_diary_logged_at",
      "quicklog_stamp_grow_event_logged_at",
    ]);
  });

  it("treats permission denial and non-exposure as sealed", () => {
    expect(
      classifyQuicklogPrivateProbe({
        succeeded: false,
        errorCode: "42501",
        errorMessage: "permission denied",
      }),
    ).toBe("sealed_permission");
    expect(
      classifyQuicklogPrivateProbe({
        succeeded: false,
        errorCode: "PGRST202",
        errorMessage: "not found",
      }),
    ).toBe("sealed_not_exposed");
    expect(
      classifyQuicklogPrivateProbe({
        succeeded: false,
        errorCode: "42883",
        errorMessage: "no function",
      }),
    ).toBe("sealed_not_exposed");
  });

  it("treats success AND trigger-only rejection (0A000) as exposure regressions", () => {
    expect(classifyQuicklogPrivateProbe({ succeeded: true })).toBe("exposed_regression");
    expect(
      classifyQuicklogPrivateProbe({
        succeeded: false,
        errorCode: "0A000",
        errorMessage: "trigger functions can only be called as triggers",
      }),
    ).toBe("exposed_regression");
  });

  it("separates network failures from unknown errors", () => {
    expect(
      classifyQuicklogPrivateProbe({
        succeeded: false,
        errorMessage: "TypeError: Failed to fetch",
      }),
    ).toBe("network_error");
    expect(
      classifyQuicklogPrivateProbe({ succeeded: false, errorCode: "XX000", errorMessage: "boom" }),
    ).toBe("unknown_error");
  });
});

describe("classifyQuicklogWrapperProbe", () => {
  it("reads the expected validation rejection as reachable", () => {
    expect(
      classifyQuicklogWrapperProbe({
        succeeded: true,
        data: { ok: false, reason: "invalid_target_type" },
      }),
    ).toEqual({ status: "reachable_validating", reason: "invalid_target_type" });
  });

  it("fails closed when an HTTP-success payload does not match the exact probe contract", () => {
    for (const data of [
      null,
      {},
      { ok: false },
      { ok: false, reason: "save_failed" },
      { ok: "false", reason: "invalid_target_type" },
    ]) {
      expect(classifyQuicklogWrapperProbe({ succeeded: true, data }).status).toBe("unknown_error");
    }
  });

  it("flags a successful save of the probe payload as an unexpected write", () => {
    expect(
      classifyQuicklogWrapperProbe({ succeeded: true, data: { ok: true, grow_event_id: EVENT_ID } })
        .status,
    ).toBe("unexpected_write");
  });

  it("maps missing function to unavailable and permission denial to denied", () => {
    expect(classifyQuicklogWrapperProbe({ succeeded: false, errorCode: "PGRST202" }).status).toBe(
      "unavailable",
    );
    expect(classifyQuicklogWrapperProbe({ succeeded: false, errorCode: "42501" }).status).toBe(
      "denied",
    );
  });
});

describe("buildQuicklogConsistencyReport", () => {
  const healthyDiary = mirror({ id: "diary-1" });
  const healthyEvent = event();

  it("counts healthy links and standalone entries", () => {
    const report = buildQuicklogConsistencyReport({
      diaryEntries: [healthyDiary, mirror({ id: "diary-2", details: { kind: "standalone note" } })],
      growEvents: [healthyEvent],
      loggedAtColumnAvailable: true,
    });
    expect(report.healthyLinks).toBe(1);
    expect(report.unlinkedDiaryEntries).toBe(1);
    expect(report.danglingDiaryLinks).toHaveLength(0);
    expect(report.occurrenceMismatches).toHaveLength(0);
    expect(report.loggedAtMismatches).toHaveLength(0);
    expect(report.unmirroredManualEvents).toHaveLength(0);
  });

  it("reports a link whose grow event no longer exists as dangling", () => {
    const report = buildQuicklogConsistencyReport({
      diaryEntries: [mirror({ id: "diary-3", details: { linked_grow_event_id: OTHER_EVENT_ID } })],
      growEvents: [healthyEvent],
      loggedAtColumnAvailable: true,
    });
    expect(report.danglingDiaryLinks).toEqual([
      {
        diaryEntryId: "diary-3",
        linkedGrowEventId: OTHER_EVENT_ID,
        linkKey: "linked_grow_event_id",
      },
    ]);
    expect(report.unmirroredManualEvents.map((item) => item.growEventId)).toEqual([EVENT_ID]);
  });

  it("reports occurrence and captured-timestamp disagreements per pair", () => {
    const report = buildQuicklogConsistencyReport({
      diaryEntries: [
        mirror({ id: "diary-4", entry_at: "2026-08-19T06:00:00Z" }),
        mirror({
          id: "diary-5",
          logged_at: "2026-08-19T11:00:00Z",
          details: { linked_grow_event_id: OTHER_EVENT_ID },
        }),
      ],
      growEvents: [healthyEvent, event({ id: OTHER_EVENT_ID, created_at: "2026-08-19T07:00:00Z" })],
      loggedAtColumnAvailable: true,
    });
    expect(report.occurrenceMismatches).toEqual([
      {
        diaryEntryId: "diary-4",
        growEventId: EVENT_ID,
        entryAt: "2026-08-19T06:00:00Z",
        occurredAt: "2026-08-19T05:00:00+00:00",
      },
    ]);
    expect(report.loggedAtMismatches).toEqual([
      {
        diaryEntryId: "diary-5",
        growEventId: OTHER_EVENT_ID,
        diaryLoggedAt: "2026-08-19T11:00:00Z",
        eventLoggedAt: "2026-08-19T08:00:00+00:00",
      },
    ]);
    expect(report.healthyLinks).toBe(0);
  });

  it("never counts unprovable Captured parity as healthy (both-null or columns absent)", () => {
    const bare = buildQuicklogConsistencyReport({
      diaryEntries: [mirror({ logged_at: null, details: { linked_grow_event_id: EVENT_ID } })],
      growEvents: [event({ logged_at: null })],
      loggedAtColumnAvailable: true,
    });
    expect(bare.loggedAtMismatches).toHaveLength(0);
    expect(bare.healthyLinks).toBe(0);
    expect(bare.linksWithoutCapturedParity).toBe(1);

    const withoutColumns = buildQuicklogConsistencyReport({
      diaryEntries: [
        mirror({ logged_at: "2026-08-19T11:00:00Z", details: { linked_grow_event_id: EVENT_ID } }),
      ],
      growEvents: [event()],
      loggedAtColumnAvailable: false,
    });
    expect(withoutColumns.loggedAtMismatches).toHaveLength(0);
    expect(withoutColumns.healthyLinks).toBe(0);
    expect(withoutColumns.linksWithoutCapturedParity).toBe(1);
  });

  it("rejects impossible calendar dates the platform Date would normalize", () => {
    expect(readDetailsLoggedAt({ logged_at: "2026-02-30T08:00:00Z" }).parseable).toBe(false);
    expect(readDetailsLoggedAt({ logged_at: "2026-13-01T08:00:00Z" }).parseable).toBe(false);
    expect(readDetailsLoggedAt({ logged_at: "2026-08-19T99:00:00Z" }).parseable).toBe(false);
    expect(readDetailsLoggedAt({ logged_at: "2026-02-28T23:59:59Z" }).parseable).toBe(true);
  });

  it("accepts low years instead of tripping Date.UTC's 1900-century remap", () => {
    // Date.UTC(99, 0, 1) is 1999, so a year-based round trip through Date.UTC
    // would report these server-acceptable stamps as unparseable.
    expect(readDetailsLoggedAt({ logged_at: "0099-01-01T00:00:00Z" }).parseable).toBe(true);
    expect(readDetailsLoggedAt({ logged_at: "0001-01-01T00:00:00Z" }).parseable).toBe(true);
    expect(readDetailsLoggedAt({ logged_at: "0100-06-15T12:30:00Z" }).parseable).toBe(true);
    // Impossible dates stay rejected in the low-year range too.
    expect(readDetailsLoggedAt({ logged_at: "0099-02-30T00:00:00Z" }).parseable).toBe(false);
    // PostgreSQL has no year zero (1 BC is followed by 1 AD).
    expect(readDetailsLoggedAt({ logged_at: "0000-01-01T00:00:00Z" }).parseable).toBe(false);
  });

  it("keeps PGRST204 (unknown column) out of the sealed classification", () => {
    expect(
      classifyQuicklogPrivateProbe({
        succeeded: false,
        errorCode: "PGRST204",
        errorMessage: "column not found in schema cache",
      }),
    ).toBe("unknown_error");
  });

  it("is deterministic for identical inputs in different order", () => {
    const inputA = {
      diaryEntries: [
        mirror({ id: "diary-b", details: { linked_grow_event_id: OTHER_EVENT_ID } }),
        mirror({ id: "diary-a" }),
      ],
      growEvents: [event({ id: OTHER_EVENT_ID, created_at: "2026-08-19T07:00:00Z" }), healthyEvent],
      loggedAtColumnAvailable: true,
    };
    const inputB = {
      diaryEntries: [...inputA.diaryEntries].reverse(),
      growEvents: [...inputA.growEvents].reverse(),
      loggedAtColumnAvailable: true,
    };
    expect(buildQuicklogConsistencyReport(inputA)).toEqual(buildQuicklogConsistencyReport(inputB));
  });
});
