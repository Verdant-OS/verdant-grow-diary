import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(__dirname, "../../supabase/migrations/20260728060547_secure_public_support_forms.sql"),
  "utf8",
);
const flat = migration.replace(/\s+/g, " ");
const feedbackPage = readFileSync(resolve(__dirname, "../pages/support/Feedback.tsx"), "utf8");
const contactPage = readFileSync(resolve(__dirname, "../pages/support/Contact.tsx"), "utf8");
const seed = readFileSync(resolve(__dirname, "../../supabase/seed.sql"), "utf8").replace(
  /\s+/g,
  " ",
);
const packageJson = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8")) as {
  scripts: Record<string, string>;
};
const securityWorkflow = readFileSync(
  resolve(__dirname, "../../.github/workflows/security-db-local.yml"),
  "utf8",
);

describe("public support form RLS hardening", () => {
  it("retires the two historical permissive insert policies", () => {
    expect(flat).toContain(
      'DROP POLICY IF EXISTS "Anyone can submit feedback" ON public.customer_feedback',
    );
    expect(flat).toContain(
      'DROP POLICY IF EXISTS "Anyone can send a contact message" ON public.contact_messages',
    );
    expect(flat).not.toMatch(/WITH CHECK\s*\(\s*true\s*\)/i);
  });

  it("uses least-privilege column grants for public inserts", () => {
    expect(flat).toMatch(
      /REVOKE ALL PRIVILEGES ON TABLE public\.customer_feedback FROM PUBLIC, anon, authenticated/i,
    );
    expect(flat).toMatch(
      /REVOKE ALL PRIVILEGES ON TABLE public\.contact_messages FROM PUBLIC, anon, authenticated/i,
    );
    expect(flat).toMatch(
      /GRANT INSERT\s*\(\s*overall_rating,[^;]*user_agent\s*\)\s*ON public\.customer_feedback TO anon, authenticated/i,
    );
    expect(flat).toMatch(
      /GRANT INSERT\s*\(\s*name,\s*email,\s*category,\s*message,\s*grow_context,\s*user_agent\s*\)\s*ON public\.contact_messages TO anon, authenticated/i,
    );

    const publicInsertGrants = flat.match(
      /GRANT INSERT\s*\([^;]+\)\s*ON public\.(?:customer_feedback|contact_messages) TO anon, authenticated/gi,
    );
    expect(publicInsertGrants).toHaveLength(2);
    for (const grant of publicInsertGrants ?? []) {
      expect(grant).not.toMatch(
        /\b(?:id|user_id|created_at|reviewed_at|reviewed_by|admin_notes|attachment_path)\b/i,
      );
    }
    expect(flat).toMatch(
      /ALTER TABLE public\.customer_feedback ALTER COLUMN user_id SET DEFAULT auth\.uid\(\)/i,
    );
    expect(flat).toMatch(
      /ALTER TABLE public\.contact_messages ALTER COLUMN user_id SET DEFAULT auth\.uid\(\)/i,
    );
  });

  it("preserves operator read and review-column access without public mutations", () => {
    for (const table of ["customer_feedback", "contact_messages"]) {
      expect(flat).toContain(`GRANT SELECT ON public.${table} TO authenticated`);
      expect(flat).toContain(
        `GRANT UPDATE (reviewed_at, reviewed_by, admin_notes) ON public.${table} TO authenticated`,
      );
      expect(flat).toContain(`GRANT ALL ON public.${table} TO service_role`);
      expect(flat).not.toMatch(
        new RegExp(
          `GRANT (?:DELETE|TRUNCATE|TRIGGER|REFERENCES) ON public\\.${table} TO (?:anon|authenticated)`,
          "i",
        ),
      );
    }
  });

  it("lets the database derive user attribution instead of trusting session data in the browser", () => {
    for (const page of [feedbackPage, contactPage]) {
      expect(page).not.toContain("supabase.auth.getSession()");
      expect(page).not.toMatch(/\buser_id\s*:/);
    }
  });

  it("reapplies the exact support-table ACL contract after local blanket grants", () => {
    for (const table of ["customer_feedback", "contact_messages"]) {
      expect(seed).toContain(
        `REVOKE ALL PRIVILEGES ON TABLE public.${table} FROM PUBLIC, anon, authenticated`,
      );
      expect(seed).toContain(`GRANT SELECT ON public.${table} TO authenticated`);
      expect(seed).toContain(
        `GRANT UPDATE (reviewed_at, reviewed_by, admin_notes) ON public.${table} TO authenticated`,
      );
      expect(seed).toContain(`GRANT ALL ON public.${table} TO service_role`);
    }
    expect(seed).toMatch(
      /GRANT INSERT\s*\(\s*overall_rating,[^;]*user_agent\s*\)\s*ON public\.customer_feedback TO anon, authenticated/i,
    );
    expect(seed).toMatch(
      /GRANT INSERT\s*\(\s*name,\s*email,\s*category,\s*message,\s*grow_context,\s*user_agent\s*\)\s*ON public\.contact_messages TO anon, authenticated/i,
    );
  });

  it("runs the real support-form harness in the opt-in DB security lane", () => {
    expect(packageJson.scripts["test:public-support-forms-db-security"]).toBe(
      "bun run scripts/run-support-forms-rls-harness.ts --confirm-local-security-lane",
    );
    expect(packageJson.scripts["test:security-db-local"]).toContain(
      "bun run test:public-support-forms-db-security",
    );
    expect(securityWorkflow).toContain("name: Public support forms RLS");
    expect(securityWorkflow).toContain(
      "bun run test:public-support-forms-db-security 2>&1 | tee public-support-forms-db.log",
    );
    expect(securityWorkflow).toContain("public-support-forms-db.log");
  });

  it("binds attribution to auth.uid and rejects forged workflow state", () => {
    const policies =
      flat.match(
        /CREATE POLICY "[^"]+" ON public\.(?:customer_feedback|contact_messages) FOR INSERT TO anon, authenticated WITH CHECK \([^;]+;/gi,
      ) ?? [];
    expect(policies).toHaveLength(2);

    for (const policy of policies) {
      expect(policy).toMatch(/user_id IS NOT DISTINCT FROM \(select auth\.uid\(\)\)/i);
      expect(policy).toMatch(/reviewed_at IS NULL/i);
      expect(policy).toMatch(/reviewed_by IS NULL/i);
      expect(policy).toMatch(/admin_notes IS NULL/i);
      expect(policy).toMatch(/created_at >= \(select now\(\)\) - interval '5 minutes'/i);
      expect(policy).toMatch(/created_at <= \(select now\(\)\) \+ interval '1 minute'/i);
    }
    expect(policies.find((policy) => /public\.contact_messages/i.test(policy))).toMatch(
      /attachment_path IS NULL/i,
    );
  });

  it("enforces the browser payload length and category boundaries server-side", () => {
    for (const [column, limit] of [
      ["whats_working", 4000],
      ["whats_friction", 4000],
      ["one_improvement", 4000],
      ["grow_context", 500],
      ["contact_email", 320],
      ["user_agent", 500],
      ["name", 120],
      ["email", 320],
      ["message", 8000],
    ] as const) {
      expect(flat).toContain(`char_length(${column}) <= ${limit}`);
    }
    for (const category of [
      "technical_support",
      "bug_report",
      "feature_idea",
      "billing_account",
      "hardware_integration",
      "other",
    ]) {
      expect(flat).toContain(`'${category}'`);
    }
  });
});
