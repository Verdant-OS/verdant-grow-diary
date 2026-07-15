export const SUBSCRIBER_GROWTH_MIGRATION_CONTRACT = Object.freeze([
  Object.freeze({
    path: "supabase/migrations/20260714190000_restore_public_lead_insert_only.sql",
    markers: Object.freeze([
      'CREATE POLICY "Public can submit a lead"',
      "FOR INSERT",
      "TO anon, authenticated",
      "'pricing_interest_operator_outreach'",
      "REVOKE ALL ON TABLE public.leads FROM anon",
      "GRANT INSERT ON TABLE public.leads TO anon",
    ]),
    forbidden: Object.freeze([/GRANT\s+(?:SELECT|UPDATE|DELETE|TRUNCATE).*TO\s+anon/is]),
  }),
  Object.freeze({
    path: "supabase/migrations/20260714193000_subscriber_growth_operator_snapshot.sql",
    markers: Object.freeze([
      "CREATE OR REPLACE FUNCTION public.subscriber_growth_operator_snapshot()",
      "SECURITY DEFINER",
      "SET search_path = public, pg_temp",
      "public.has_role(auth.uid(), 'operator'::public.app_role)",
      "FROM public.billing_subscriptions AS bs",
      "bs.status = 'active'",
      "AS active_paid_core_activated",
      "AS pricing_interest_operator_outreach",
      "REVOKE ALL ON FUNCTION public.subscriber_growth_operator_snapshot() FROM anon",
      "GRANT EXECUTE ON FUNCTION public.subscriber_growth_operator_snapshot() TO authenticated",
    ]),
    forbidden: Object.freeze([/profiles\.tier/i, /FROM\s+public\.subscriptions\b/i]),
  }),
  Object.freeze({
    path: "supabase/migrations/20260714231627_signup_acquisition_attribution.sql",
    markers: Object.freeze([
      "CREATE TABLE IF NOT EXISTS public.signup_acquisition_attributions",
      "signup_acquisition_attributions_source_check",
      "'operator_outreach'",
      "ALTER TABLE public.signup_acquisition_attributions ENABLE ROW LEVEL SECURITY",
      "REVOKE ALL ON TABLE public.signup_acquisition_attributions FROM authenticated",
      "CREATE OR REPLACE FUNCTION public.handle_new_user()",
      "CREATE OR REPLACE FUNCTION public.signup_acquisition_operator_snapshot()",
      "public.has_role(auth.uid(), 'operator'::public.app_role)",
    ]),
    forbidden: Object.freeze([
      /CREATE\s+POLICY[\s\S]*ON\s+public\.signup_acquisition_attributions/i,
      /GRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE).*signup_acquisition_attributions/is,
    ]),
  }),
  Object.freeze({
    path: "supabase/migrations/20260715002000_signup_to_paid_operator_snapshot.sql",
    markers: Object.freeze([
      "CREATE OR REPLACE FUNCTION public.signup_to_paid_operator_snapshot()",
      "SECURITY DEFINER",
      "SET search_path = public, pg_temp",
      "public.has_role(auth.uid(), 'operator'::public.app_role)",
      "('operator_outreach'::text)",
      "FROM public.billing_subscriptions AS bs",
      "bs.status = 'active'",
      "REVOKE ALL ON FUNCTION public.signup_to_paid_operator_snapshot() FROM anon",
      "GRANT EXECUTE ON FUNCTION public.signup_to_paid_operator_snapshot() TO authenticated",
    ]),
    forbidden: Object.freeze([/profiles\.tier/i, /FROM\s+public\.subscriptions\b/i]),
  }),
]);

export function auditSubscriberGrowthMigrationContract(readFile) {
  const migrations = [];
  const issues = [];

  for (const contract of SUBSCRIBER_GROWTH_MIGRATION_CONTRACT) {
    let source = null;
    try {
      source = readFile(contract.path);
    } catch {
      issues.push(`${contract.path}:missing_file`);
    }

    if (typeof source !== "string") {
      migrations.push({ path: contract.path, ok: false });
      continue;
    }

    const migrationIssues = [];
    for (const marker of contract.markers) {
      if (!source.includes(marker)) migrationIssues.push(`missing_marker:${marker}`);
    }
    for (const pattern of contract.forbidden) {
      if (pattern.test(source)) migrationIssues.push(`forbidden_pattern:${pattern.source}`);
    }
    for (const issue of migrationIssues) issues.push(`${contract.path}:${issue}`);
    migrations.push({ path: contract.path, ok: migrationIssues.length === 0 });
  }

  return {
    ok: issues.length === 0,
    migrationsTotal: migrations.length,
    migrationsPassed: migrations.filter((migration) => migration.ok).length,
    migrations,
    issues,
  };
}
