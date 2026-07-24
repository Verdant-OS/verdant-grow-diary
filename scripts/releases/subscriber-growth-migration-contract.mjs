export const SUBSCRIBER_GROWTH_MIGRATION_CONTRACT = Object.freeze([
  Object.freeze({
    path: "supabase/migrations/20260714190000_restore_public_lead_insert_only.sql",
    markers: Object.freeze([
      'CREATE POLICY "Public can submit a lead"',
      "FOR INSERT",
      "TO anon, authenticated",
      "'pricing_interest_operator_outreach'",
      "length(COALESCE(name, '')) <= 100",
      "length(COALESCE(company, '')) <= 120",
      "role IS NULL",
      "operator_notes IS NULL",
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
      "FROM public.subscriptions AS s",
      "s.environment = 'live'",
      "SELECT DISTINCT ON (candidate.user_id)",
      "LEFT JOIN active_paid AS ap ON ap.user_id = pr.user_id",
      "AS has_connected_core",
      "count(*) FILTER (WHERE af.has_connected_core)",
      "AS active_paid_core_activated",
      "AS pricing_interest_operator_outreach",
      "REVOKE ALL ON FUNCTION public.subscriber_growth_operator_snapshot() FROM anon",
      "GRANT EXECUTE ON FUNCTION public.subscriber_growth_operator_snapshot() TO authenticated",
    ]),
    forbidden: Object.freeze([/profiles\.tier/i]),
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
      "NEW.raw_user_meta_data->'marketing_opt_in' = 'true'::jsonb",
      "marketing_opt_in_at",
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
      "FROM public.subscriptions AS s",
      "s.environment = 'live'",
      "SELECT DISTINCT ON (candidate.user_id)",
      "REVOKE ALL ON FUNCTION public.signup_to_paid_operator_snapshot() FROM anon",
      "GRANT EXECUTE ON FUNCTION public.signup_to_paid_operator_snapshot() TO authenticated",
    ]),
    forbidden: Object.freeze([/profiles\.tier/i]),
  }),
  Object.freeze({
    path: "supabase/migrations/20260717010000_paid_return_cohort_measurement.sql",
    markers: Object.freeze([
      "CREATE TABLE IF NOT EXISTS public.paid_return_cohort_memberships",
      "user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE",
      "REVOKE ALL ON TABLE public.paid_return_cohort_memberships FROM authenticated",
      "CREATE OR REPLACE FUNCTION public.record_paid_return_cohort_membership()",
      "NEW.environment = 'live'",
      "NEW.status = 'active'",
      "ON CONFLICT (user_id) DO NOTHING",
      "AFTER INSERT ON public.subscriptions",
      "AFTER UPDATE OF status, price_id, environment ON public.subscriptions",
      "CREATE OR REPLACE FUNCTION public.paid_return_operator_snapshot()",
      "SECURITY DEFINER",
      "SET search_path = public, pg_temp",
      "public.has_role(auth.uid(), 'operator'::public.app_role)",
      "FROM public.grow_events AS ge",
      "ge.source = 'manual'",
      "ge.event_type IN ('watering', 'observation')",
      "CREATE INDEX IF NOT EXISTS paid_return_manual_grow_events_user_created_idx",
      "CREATE TABLE IF NOT EXISTS public.ai_doctor_review_completions",
      "REVOKE ALL ON TABLE public.ai_doctor_review_completions FROM authenticated",
      "CREATE OR REPLACE FUNCTION public.record_ai_doctor_review_completion(",
      "p_expected_user_id uuid",
      "v_spend.feature IS DISTINCT FROM 'ai_doctor_review'",
      "v_spend.status IS DISTINCT FROM 'spent'",
      "REVOKE ALL ON FUNCTION public.record_ai_doctor_review_completion(uuid, uuid) FROM authenticated",
      "GRANT EXECUTE ON FUNCTION public.record_ai_doctor_review_completion(uuid, uuid) TO service_role",
      "FROM public.ai_doctor_review_completions AS completion",
      "server_completed_ai_doctor_returned_60d",
      "Client-persisted AI sessions are excluded",
      "tracked.first_paid_at + interval '60 days' <= now()",
      "REVOKE ALL ON FUNCTION public.paid_return_operator_snapshot() FROM anon",
      "GRANT EXECUTE ON FUNCTION public.paid_return_operator_snapshot() TO authenticated",
    ]),
    forbidden: Object.freeze([/profiles\.tier/i, /sensor_readings/i, /ai_doctor_sessions/i]),
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
