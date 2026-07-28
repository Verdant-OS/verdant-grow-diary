import { describe, expect, it } from "vitest";

import {
  SCHEMA_AUDIT_ACCESS_PROFILES,
  accessProfileForTable,
  evaluateRlsAudit,
  summarizeRlsFindings,
  type RlsAuditInput,
  type RlsPolicyAudit,
} from "./rlsAuditRules";

const ownerPolicies: RlsPolicyAudit[] = [
  {
    name: "owner select",
    command: "SELECT",
    roles: ["authenticated"],
    permissive: true,
    qual: "auth.uid() = user_id",
    with_check: null,
  },
  {
    name: "owner insert",
    command: "INSERT",
    roles: ["authenticated"],
    permissive: true,
    qual: null,
    with_check: "auth.uid() = user_id",
  },
  {
    name: "owner update",
    command: "UPDATE",
    roles: ["authenticated"],
    permissive: true,
    qual: "auth.uid() = user_id",
    with_check: "auth.uid() = user_id",
  },
  {
    name: "owner delete",
    command: "DELETE",
    roles: ["authenticated"],
    permissive: true,
    qual: "auth.uid() = user_id",
    with_check: null,
  },
];

const base: RlsAuditInput = {
  table: "plants",
  exists: true,
  rls_enabled: true,
  rls_forced: false,
  policy_count: ownerPolicies.length,
  grants: {
    PUBLIC: [],
    anon: [],
    authenticated: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    service_role: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  },
  column_grants: {
    PUBLIC: {},
    anon: {},
    authenticated: {},
    service_role: {},
  },
  policies: ownerPolicies,
  access_profile: "owner_crud",
};

describe("accessProfileForTable", () => {
  it("covers the page's complete current critical-table census", () => {
    expect(Object.keys(SCHEMA_AUDIT_ACCESS_PROFILES).sort()).toEqual([
      "action_queue",
      "ai_credit_grants",
      "ai_credit_spends",
      "billing_subscriptions",
      "feeding_events",
      "founders",
      "pheno_crosses",
      "pheno_reversals",
      "plants",
      "quicklog_audit_events",
      "quicklog_idempotency",
      "referrals",
      "soil_moisture_calibrations",
      "subscriptions",
      "tents",
    ]);
  });

  it("uses audited real-table profiles and fails unknown tables closed", () => {
    expect(accessProfileForTable("feeding_events")).toBe("authenticated_read_only");
    expect(accessProfileForTable("founders")).toBe("owner_preference_update");
    expect(accessProfileForTable("pheno_reversals")).toBe("append_select_insert");
    expect(accessProfileForTable("plants")).toBe("owner_crud");
    expect(accessProfileForTable("not_reviewed")).toBe("unknown");
  });
});

describe("evaluateRlsAudit", () => {
  it("returns no findings for complete owner CRUD evidence", () => {
    expect(evaluateRlsAudit([base])).toEqual([]);
  });

  it("uses profile-specific authenticated grants", () => {
    const readPolicy = ownerPolicies[0];
    const readOnly: RlsAuditInput = {
      ...base,
      table: "feeding_events",
      access_profile: "authenticated_read_only",
      policy_count: 1,
      policies: [readPolicy],
      grants: { ...base.grants, authenticated: ["SELECT"] },
    };
    expect(evaluateRlsAudit([readOnly])).toEqual([]);

    const mismatched = evaluateRlsAudit([
      { ...readOnly, grants: { ...readOnly.grants, authenticated: ["SELECT", "UPDATE"] } },
    ]);
    expect(mismatched).toContainEqual(
      expect.objectContaining({ code: "authenticated_grants_mismatch", severity: "warning" }),
    );
  });

  it("accepts reviewed append and service-only boundaries", () => {
    const appendOnly: RlsAuditInput = {
      ...base,
      table: "pheno_reversals",
      access_profile: "append_select_insert",
      policy_count: 2,
      policies: [ownerPolicies[0], ownerPolicies[1]],
      grants: { ...base.grants, authenticated: ["SELECT", "INSERT"] },
    };
    const serviceOnly: RlsAuditInput = {
      ...base,
      table: "internal_events",
      access_profile: "service_only",
      policy_count: 0,
      policies: [],
      grants: { ...base.grants, authenticated: [] },
    };
    expect(evaluateRlsAudit([appendOnly, serviceOnly])).toEqual([]);
  });

  it("models founders as owner preference update with exact column grants", () => {
    const founders: RlsAuditInput = {
      ...base,
      table: "founders",
      access_profile: "owner_preference_update",
      policy_count: 2,
      policies: [ownerPolicies[0], ownerPolicies[2]],
      grants: { ...base.grants, authenticated: ["SELECT"] },
      column_grants: {
        ...base.column_grants,
        authenticated: {
          display_name: ["UPDATE"],
          display_style: ["UPDATE"],
          optional_link: ["UPDATE"],
          show_on_wall: ["UPDATE"],
        },
      },
    };
    expect(evaluateRlsAudit([founders])).toEqual([]);
  });

  it("requires the founders UPDATE policy promised by its narrow column grants", () => {
    const findings = evaluateRlsAudit([
      {
        ...base,
        table: "founders",
        access_profile: "owner_preference_update",
        policy_count: 1,
        policies: [ownerPolicies[0]],
        grants: { ...base.grants, authenticated: ["SELECT"] },
        column_grants: {
          ...base.column_grants,
          authenticated: {
            display_name: ["UPDATE"],
            display_style: ["UPDATE"],
            optional_link: ["UPDATE"],
            show_on_wall: ["UPDATE"],
          },
        },
      },
    ]);
    expect(findings).toContainEqual(
      expect.objectContaining({
        code: "required_policy_missing",
        severity: "warning",
        message: expect.stringContaining("UPDATE"),
      }),
    );
  });

  it("marks unknown profiles and incomplete catalog evidence unverified", () => {
    const findings = evaluateRlsAudit([
      {
        ...base,
        table: "not_reviewed",
        access_profile: "unknown",
        rls_enabled: null,
        rls_forced: null,
        grants: null,
        policies: null,
        policy_count: null,
      },
    ]);
    expect(findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "access_profile_unknown",
        "rls_state_unverified",
        "grants_unverified",
        "policies_unverified",
      ]),
    );
    expect(findings.every((finding) => finding.severity === "unverified")).toBe(true);
  });

  it("fails malformed grant and policy members closed without throwing", () => {
    const malformed = {
      ...base,
      grants: { ...base.grants, PUBLIC: "SELECT" },
      policies: [null],
      policy_count: 1,
    } as unknown as RlsAuditInput;
    const findings = evaluateRlsAudit([malformed]);
    expect(findings).toContainEqual(
      expect.objectContaining({ code: "grants_unverified", severity: "unverified" }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({ code: "policies_unverified", severity: "unverified" }),
    );
  });

  it("fails malformed grant members and missing column-grant evidence closed", () => {
    const malformed = {
      ...base,
      grants: { ...base.grants, PUBLIC: [42] },
      column_grants: null,
    } as unknown as RlsAuditInput;
    const findings = evaluateRlsAudit([malformed]);
    expect(findings).toContainEqual(
      expect.objectContaining({ code: "grants_unverified", severity: "unverified" }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({ code: "column_grants_unverified", severity: "unverified" }),
    );
  });

  it("fails malformed table-existence evidence closed", () => {
    const findings = evaluateRlsAudit([{ ...base, exists: "yes" } as unknown as RlsAuditInput]);
    expect(findings).toEqual([
      expect.objectContaining({
        code: "table_existence_unverified",
        severity: "unverified",
      }),
    ]);
  });

  it("flags every direct PUBLIC or anon grant on private tables", () => {
    const findings = evaluateRlsAudit([
      {
        ...base,
        grants: { ...base.grants, PUBLIC: ["SELECT"], anon: ["INSERT"] },
      },
    ]);
    expect(findings.filter((finding) => finding.code === "public_or_anon_grant")).toHaveLength(2);
    expect(
      findings
        .filter((finding) => finding.code === "public_or_anon_grant")
        .every((finding) => finding.severity === "critical"),
    ).toBe(true);
  });

  it("flags public column grants and mismatched authenticated column grants", () => {
    const findings = evaluateRlsAudit([
      {
        ...base,
        column_grants: {
          ...base.column_grants,
          PUBLIC: { display_name: ["SELECT"] },
          authenticated: { status: ["UPDATE"] },
        },
      },
    ]);
    expect(findings).toContainEqual(
      expect.objectContaining({ code: "public_or_anon_column_grant", severity: "critical" }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        code: "authenticated_column_grants_mismatch",
        severity: "warning",
      }),
    );
  });

  it("flags PUBLIC/anon policy roles and literal true expressions", () => {
    const unsafe: RlsPolicyAudit = {
      name: "public insert",
      command: "INSERT",
      roles: ["public", "anon"],
      permissive: true,
      qual: null,
      with_check: "(true)",
    };
    const findings = evaluateRlsAudit([{ ...base, policy_count: 1, policies: [unsafe] }]);
    expect(findings).toContainEqual(
      expect.objectContaining({ code: "policy_public_or_anon_role", severity: "critical" }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({ code: "policy_literal_true", severity: "critical" }),
    );
  });

  it("flags required USING and WITH CHECK clauses when absent", () => {
    const update: RlsPolicyAudit = {
      name: "owner update",
      command: "UPDATE",
      roles: ["authenticated"],
      permissive: true,
      qual: null,
      with_check: null,
    };
    const findings = evaluateRlsAudit([{ ...base, policy_count: 1, policies: [update] }]);
    expect(findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["policy_missing_using", "policy_missing_with_check"]),
    );
  });

  it("flags owner DML without a recognizable auth.uid ownership boundary", () => {
    const unsafeOwner: RlsPolicyAudit = {
      name: "owner insert",
      command: "INSERT",
      roles: ["authenticated"],
      permissive: true,
      qual: null,
      with_check: "tenant_id IS NOT NULL",
    };
    const findings = evaluateRlsAudit([{ ...base, policy_count: 1, policies: [unsafeOwner] }]);
    expect(findings).toContainEqual(
      expect.objectContaining({ code: "owner_policy_missing_identity", severity: "critical" }),
    );
  });

  it("does not accept identity tokens without a binding comparison", () => {
    const unsafeOwner: RlsPolicyAudit = {
      name: "owner insert",
      command: "INSERT",
      roles: ["authenticated"],
      permissive: true,
      qual: null,
      with_check: "auth.uid() IS NOT NULL AND user_id IS NOT NULL",
    };
    const findings = evaluateRlsAudit([{ ...base, policy_count: 1, policies: [unsafeOwner] }]);
    expect(findings).toContainEqual(
      expect.objectContaining({ code: "owner_policy_missing_identity", severity: "critical" }),
    );
  });

  it("requires every top-level OR branch to be identity- or operator-scoped", () => {
    const tautologicalOwner: RlsPolicyAudit = {
      name: "owner select",
      command: "SELECT",
      roles: ["authenticated"],
      permissive: true,
      qual: "auth.uid() = user_id OR true",
      with_check: null,
    };
    const safeOwnerOrOperator: RlsPolicyAudit = {
      ...tautologicalOwner,
      qual: "auth.uid() = user_id OR public.has_role(auth.uid(), 'operator'::public.app_role)",
    };
    expect(
      evaluateRlsAudit([{ ...base, policy_count: 1, policies: [tautologicalOwner] }]),
    ).toContainEqual(
      expect.objectContaining({ code: "unsafe_permissive_policy", severity: "critical" }),
    );
    expect(
      evaluateRlsAudit([{ ...base, policy_count: 1, policies: [safeOwnerOrOperator] }]).some(
        (finding) => finding.code === "unsafe_permissive_policy",
      ),
    ).toBe(false);
  });

  it("rejects negated, inverted, and fallback-wrapped identity guards", () => {
    for (const qual of [
      "NOT (auth.uid() = user_id)",
      "(auth.uid() = user_id) IS NOT TRUE",
      "coalesce(auth.uid() = user_id, true)",
      "NOT public.has_role(auth.uid(), 'operator'::public.app_role)",
    ]) {
      const policy: RlsPolicyAudit = {
        name: "owner select",
        command: "SELECT",
        roles: ["authenticated"],
        permissive: true,
        qual,
        with_check: null,
      };
      expect(
        evaluateRlsAudit([{ ...base, policy_count: 1, policies: [policy] }]),
        qual,
      ).toContainEqual(
        expect.objectContaining({ code: "unsafe_permissive_policy", severity: "critical" }),
      );
    }
  });

  it("flags an unscoped permissive SELECT policy on a private table", () => {
    const unsafeSelect: RlsPolicyAudit = {
      name: "authenticated readers",
      command: "SELECT",
      roles: ["authenticated"],
      permissive: true,
      qual: "status IS NOT NULL",
      with_check: null,
    };
    const findings = evaluateRlsAudit([
      {
        ...base,
        access_profile: "authenticated_read_only",
        grants: { ...base.grants, authenticated: ["SELECT"] },
        policy_count: 1,
        policies: [unsafeSelect],
      },
    ]);
    expect(findings).toContainEqual(
      expect.objectContaining({ code: "unsafe_permissive_policy", severity: "critical" }),
    );
  });

  it("does not count a restrictive-only policy as an access-enabling policy", () => {
    const restrictive = { ...ownerPolicies[0], permissive: false };
    const findings = evaluateRlsAudit([
      {
        ...base,
        access_profile: "authenticated_read_only",
        grants: { ...base.grants, authenticated: ["SELECT"] },
        policy_count: 1,
        policies: [restrictive],
      },
    ]);
    expect(findings).toContainEqual(
      expect.objectContaining({ code: "required_policy_missing", severity: "warning" }),
    );
  });

  it("accepts an explicit operator role boundary for a permissive DML policy", () => {
    const operatorUpdate: RlsPolicyAudit = {
      name: "operators update",
      command: "UPDATE",
      roles: ["authenticated"],
      permissive: true,
      qual: "public.has_role(auth.uid(), 'operator'::public.app_role)",
      with_check: "public.has_role(auth.uid(), 'operator'::public.app_role)",
    };
    const findings = evaluateRlsAudit([
      {
        ...base,
        policy_count: ownerPolicies.length + 1,
        policies: [...ownerPolicies, operatorUpdate],
      },
    ]);
    expect(
      findings.some(
        (finding) =>
          finding.code === "unsafe_permissive_policy" ||
          finding.code === "owner_policy_missing_identity",
      ),
    ).toBe(false);
  });

  it("marks policy count collisions unverified and missing required commands unresolved", () => {
    const findings = evaluateRlsAudit([
      { ...base, policy_count: 99, policies: [ownerPolicies[0]] },
    ]);
    expect(findings).toContainEqual(
      expect.objectContaining({ code: "policy_count_mismatch", severity: "unverified" }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({ code: "required_policy_missing", severity: "warning" }),
    );
  });

  it("summarizes critical, warning, unverified, and info independently", () => {
    const summary = summarizeRlsFindings([
      { table: "a", severity: "critical", code: "rls_disabled", message: "x" },
      {
        table: "b",
        severity: "warning",
        code: "required_policy_missing",
        message: "x",
      },
      {
        table: "c",
        severity: "unverified",
        code: "policies_unverified",
        message: "x",
      },
      {
        table: "d",
        severity: "info",
        code: "policies_unverified",
        message: "x",
      },
    ]);
    expect(summary).toEqual({ total: 4, critical: 1, warning: 1, unverified: 1, info: 1 });
  });
});
