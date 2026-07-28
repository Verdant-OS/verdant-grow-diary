import { describe, it, expect } from "vitest";
import { evaluateRlsAudit, summarizeRlsFindings, type RlsAuditInput } from "./rlsAuditRules";

const base: RlsAuditInput = {
  table: "grows",
  exists: true,
  rls_enabled: true,
  rls_forced: false,
  policy_count: 4,
  grants: {
    authenticated: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    service_role: ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"],
  },
};

describe("evaluateRlsAudit", () => {
  it("returns no findings for a well-configured user-facing table", () => {
    expect(evaluateRlsAudit([base])).toEqual([]);
  });

  it("flags a missing table as critical", () => {
    const f = evaluateRlsAudit([{ ...base, exists: false }]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ code: "table_missing", severity: "critical" });
  });

  it("flags disabled RLS as critical", () => {
    const f = evaluateRlsAudit([{ ...base, rls_enabled: false }]);
    expect(f.some((x) => x.code === "rls_disabled" && x.severity === "critical")).toBe(true);
  });

  it("flags RLS enabled but zero policies as warning", () => {
    const f = evaluateRlsAudit([{ ...base, policy_count: 0 }]);
    expect(f.some((x) => x.code === "rls_enabled_no_policies")).toBe(true);
  });

  it("flags anon write grants as critical", () => {
    const f = evaluateRlsAudit([
      { ...base, grants: { ...base.grants, anon: ["SELECT", "INSERT"] } },
    ]);
    expect(f.some((x) => x.code === "anon_write_grant" && x.severity === "critical")).toBe(true);
  });

  it("flags anon SELECT only as info", () => {
    const f = evaluateRlsAudit([
      { ...base, grants: { ...base.grants, anon: ["SELECT"] } },
    ]);
    expect(f.some((x) => x.code === "anon_read_grant" && x.severity === "info")).toBe(true);
    expect(f.some((x) => x.code === "anon_write_grant")).toBe(false);
  });

  it("flags authenticated missing CRUD as warning", () => {
    const f = evaluateRlsAudit([
      { ...base, grants: { ...base.grants, authenticated: ["SELECT"] } },
    ]);
    expect(f.some((x) => x.code === "authenticated_missing_crud")).toBe(true);
  });

  it("flags service_role missing CRUD as warning", () => {
    const f = evaluateRlsAudit([
      { ...base, grants: { ...base.grants, service_role: ["SELECT"] } },
    ]);
    expect(f.some((x) => x.code === "service_role_missing_all")).toBe(true);
  });

  it("summarizeRlsFindings buckets by severity", () => {
    const f = evaluateRlsAudit([
      { ...base, rls_enabled: false },
      { ...base, table: "t2", grants: { ...base.grants, anon: ["SELECT"] } },
      { ...base, table: "t3", grants: { ...base.grants, authenticated: ["SELECT"] } },
    ]);
    const s = summarizeRlsFindings(f);
    expect(s.critical).toBeGreaterThanOrEqual(1);
    expect(s.warning).toBeGreaterThanOrEqual(1);
    expect(s.info).toBeGreaterThanOrEqual(1);
  });
});
