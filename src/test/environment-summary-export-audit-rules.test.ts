import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ENVIRONMENT_SUMMARY_EXPORT_AUDIT_MAX_EVENTS,
  ENVIRONMENT_SUMMARY_EXPORT_AUDIT_STORAGE_KEY,
  clearEnvironmentSummaryExportAuditEvents,
  readEnvironmentSummaryExportAuditEvents,
  recordEnvironmentSummaryExportAuditEvent,
} from "@/lib/environmentSummaryExportAuditRules";

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      m.set(k, String(v));
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
    key: (i: number) => Array.from(m.keys())[i] ?? null,
  } as Storage;
}

describe("environmentSummaryExportAuditRules", () => {
  let storage: Storage;
  let nowDate: Date;
  let ids: string[];

  beforeEach(() => {
    storage = memStorage();
    nowDate = new Date("2026-06-08T12:00:00Z");
    ids = ["id-1", "id-2", "id-3"];
  });

  function opts() {
    let i = 0;
    return {
      storage,
      now: () => nowDate,
      idFactory: () => ids[i++] ?? `id-${i}`,
    };
  }

  it("records a full report print event to storage only", () => {
    const evt = recordEnvironmentSummaryExportAuditEvent(
      {
        eventType: "full_report_print_opened",
        reportMode: "full_report",
        startDate: "2026-06-01",
        endDate: "2026-06-07",
      },
      opts(),
    );
    expect(evt?.eventType).toBe("full_report_print_opened");
    expect(evt?.source).toBe("local_only");
    expect(evt?.dateRange).toEqual({
      startDate: "2026-06-01",
      endDate: "2026-06-07",
    });
    expect(evt?.occurredAt).toBe("2026-06-08T12:00:00.000Z");
    const stored = JSON.parse(
      storage.getItem(ENVIRONMENT_SUMMARY_EXPORT_AUDIT_STORAGE_KEY) ?? "[]",
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe("id-1");
  });

  it("records a drilldown print event with issue metadata", () => {
    const o = opts();
    const evt = recordEnvironmentSummaryExportAuditEvent(
      {
        eventType: "drilldown_print_opened",
        reportMode: "drilldown",
        startDate: "2026-06-01",
        endDate: "2026-06-07",
        issueRuleId: "source.review",
        issueLabel: "Source review required",
      },
      o,
    );
    expect(evt?.eventType).toBe("drilldown_print_opened");
    expect(evt?.issueRuleId).toBe("source.review");
    expect(evt?.issueLabel).toBe("Source review required");
    expect(evt?.source).toBe("local_only");
    const events = readEnvironmentSummaryExportAuditEvents({ storage });
    expect(events).toHaveLength(1);
    expect(events[0].reportMode).toBe("drilldown");
  });

  it("keeps only the last MAX events", () => {
    const max = ENVIRONMENT_SUMMARY_EXPORT_AUDIT_MAX_EVENTS;
    let i = 0;
    const o = {
      storage,
      now: () => nowDate,
      idFactory: () => `id-${i++}`,
    };
    for (let n = 0; n < max + 10; n++) {
      recordEnvironmentSummaryExportAuditEvent(
        {
          eventType: "full_report_print_opened",
          reportMode: "full_report",
          startDate: "2026-06-01",
          endDate: "2026-06-07",
        },
        o,
      );
    }
    const events = readEnvironmentSummaryExportAuditEvents({ storage });
    expect(events).toHaveLength(max);
    // Oldest dropped; newest preserved.
    expect(events[events.length - 1].id).toBe(`id-${max + 10 - 1}`);
    expect(events[0].id).toBe(`id-${10}`);
  });

  it("safely resets on corrupt storage", () => {
    storage.setItem(
      ENVIRONMENT_SUMMARY_EXPORT_AUDIT_STORAGE_KEY,
      "this-is-not-json{{",
    );
    const events = readEnvironmentSummaryExportAuditEvents({ storage });
    expect(events).toEqual([]);
    expect(storage.getItem(ENVIRONMENT_SUMMARY_EXPORT_AUDIT_STORAGE_KEY)).toBeNull();
  });

  it("clear removes all events", () => {
    recordEnvironmentSummaryExportAuditEvent(
      {
        eventType: "full_report_print_opened",
        reportMode: "full_report",
        startDate: "2026-06-01",
        endDate: "2026-06-07",
      },
      opts(),
    );
    clearEnvironmentSummaryExportAuditEvents({ storage });
    expect(readEnvironmentSummaryExportAuditEvents({ storage })).toEqual([]);
  });

  it("does not import or call Supabase", async () => {
    // Static guard: the module file must not import Supabase.
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      "src/lib/environmentSummaryExportAuditRules.ts",
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(src).not.toMatch(/supabase\.from\(/);
    expect(src).not.toMatch(/fetch\(/);
  });

  it("does not send network requests", () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch" as any)
      .mockImplementation((() => {
        throw new Error("fetch not allowed");
      }) as any);
    recordEnvironmentSummaryExportAuditEvent(
      {
        eventType: "full_report_print_opened",
        reportMode: "full_report",
        startDate: "2026-06-01",
        endDate: "2026-06-07",
      },
      opts(),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
