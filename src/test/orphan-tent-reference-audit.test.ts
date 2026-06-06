import { describe, it, expect } from "vitest";
import {
  ORPHAN_TENT_TABLES,
  buildAllOrphanTentAuditSql,
  buildOrphanTentAuditSql,
  redactTentId,
  renderOrphanReport,
  summarizeOrphanRows,
  type OrphanTentRow,
} from "@/lib/orphanTentReferenceAudit";

describe("orphanTentReferenceAudit — pure SQL builders", () => {
  it("covers every requested table", () => {
    for (const t of [
      "sensor_readings",
      "plants",
      "diary_entries",
      "grow_events",
      "ai_doctor_sessions",
      "bridge_tokens",
      "sensor_ingest_audit_log",
      "alerts",
      "action_queue",
    ]) {
      expect(ORPHAN_TENT_TABLES).toContain(t);
    }
  });

  it("builds a read-only LEFT JOIN against public.tents per table", () => {
    for (const t of ORPHAN_TENT_TABLES) {
      const sql = buildOrphanTentAuditSql(t);
      expect(sql).toMatch(new RegExp(`FROM public\\.${t}\\b`));
      expect(sql).toMatch(/LEFT JOIN public\.tents/);
      expect(sql).toMatch(/x\.tent_id IS NOT NULL/);
      expect(sql).toMatch(/t\.id IS NULL/);
      expect(sql).toMatch(/GROUP BY x\.tent_id/);
    }
  });

  it("never emits a write/DDL statement", () => {
    const sql = buildAllOrphanTentAuditSql();
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|GRANT|CREATE)\b/i);
  });

  it("rejects unknown tables instead of interpolating them", () => {
    // @ts-expect-error – runtime guard test
    expect(() => buildOrphanTentAuditSql("users; DROP TABLE tents;--")).toThrow();
    // @ts-expect-error – runtime guard test
    expect(() => buildOrphanTentAuditSql("auth.users")).toThrow();
  });
});

describe("orphanTentReferenceAudit — redaction & summarization", () => {
  it("redacts tent_id to last 4 only", () => {
    expect(redactTentId("d43e3ea9-5790-4fe2-89f3-7102b7e44b62")).toBe("********…4b62");
    expect(redactTentId("short")).toBe("********");
    expect(redactTentId("")).toBeNull();
    expect(redactTentId(null)).toBeNull();
    expect(redactTentId(undefined)).toBeNull();
  });

  it("summarizes per-table totals and never exposes raw uuids in summary previews", () => {
    const rows: OrphanTentRow[] = [
      { table_name: "sensor_readings", missing_tent_id: "d43e3ea9-5790-4fe2-89f3-7102b7e44b62", orphan_count: 8 },
      { table_name: "plants", missing_tent_id: "d43e3ea9-5790-4fe2-89f3-7102b7e44b62", orphan_count: 2 },
      { table_name: "diary_entries", missing_tent_id: "d43e3ea9-5790-4fe2-89f3-7102b7e44b62", orphan_count: 2 },
    ];
    const summary = summarizeOrphanRows(rows);
    const byTable = Object.fromEntries(summary.map((s) => [s.table, s]));
    expect(byTable.sensor_readings.totalOrphanRows).toBe(8);
    expect(byTable.plants.totalOrphanRows).toBe(2);
    expect(byTable.diary_entries.totalOrphanRows).toBe(2);
    expect(byTable.alerts.totalOrphanRows).toBe(0);
    for (const s of summary) {
      if (s.topMissingTentIdPreview) {
        expect(s.topMissingTentIdPreview).not.toContain("d43e3ea9-5790-4fe2-89f3-7102b7e44b62");
        expect(s.topMissingTentIdPreview).toMatch(/^\*+…[0-9a-f]{4}$/);
      }
    }
  });

  it("renders an operator-safe report with no user_id leakage", () => {
    const rows: OrphanTentRow[] = [
      { table_name: "sensor_readings", missing_tent_id: "d43e3ea9-5790-4fe2-89f3-7102b7e44b62", orphan_count: 8 },
    ];
    const text = renderOrphanReport(summarizeOrphanRows(rows));
    expect(text).toMatch(/Orphan tent_id reference audit/);
    expect(text).toMatch(/sensor_readings/);
    expect(text).toMatch(/TOTAL orphan rows across 9 tables: 8/);
    expect(text.toLowerCase()).not.toMatch(/user_id|auth\.uid|email|raw_payload/);
    expect(text).not.toContain("d43e3ea9-5790-4fe2-89f3-7102b7e44b62");
  });

  it("ignores malformed / zero / negative counts", () => {
    const rows = [
      { table_name: "plants", missing_tent_id: "abc", orphan_count: 0 },
      { table_name: "plants", missing_tent_id: "abc", orphan_count: Number.NaN as unknown as number },
      { table_name: "plants", missing_tent_id: "abc", orphan_count: -3 },
    ] as OrphanTentRow[];
    const summary = summarizeOrphanRows(rows);
    const plants = summary.find((s) => s.table === "plants")!;
    expect(plants.totalOrphanRows).toBe(0);
    expect(plants.distinctMissingTents).toBe(0);
  });
});
