import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Normalized to LF: on a Windows checkout with autocrlf on, this file reads
// back with \r\n line endings. Without normalizing, `/--.*$/` below (and any
// other end-of-line-anchored regex) silently fails to match — `$` doesn't
// match immediately before a trailing \r, only before \n or absolute EOF —
// so the comment-stripping check would stop stripping without erroring, and
// a real future user_id leak in the RPC body could slip past this exact
// check undetected on such a checkout.
const SQL = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260813020000_funnel_events_sink.sql"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("funnel_events sink migration safety", () => {
  it("is client-writable ONLY for the caller's own row, never readable back", () => {
    expect(SQL).toContain("CREATE TABLE IF NOT EXISTS public.funnel_events");
    expect(SQL).toContain("user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE");
    expect(SQL).toContain("REVOKE ALL ON TABLE public.funnel_events FROM PUBLIC");
    expect(SQL).toContain("REVOKE ALL ON TABLE public.funnel_events FROM anon");
    expect(SQL).toContain("REVOKE ALL ON TABLE public.funnel_events FROM authenticated");
    expect(SQL).toContain(
      "GRANT INSERT (user_id, event_name, props) ON TABLE public.funnel_events TO authenticated",
    );
    expect(SQL).toContain("GRANT ALL ON TABLE public.funnel_events TO service_role");
    expect(SQL).toContain("ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY");
    expect(SQL).toContain('CREATE POLICY "Users insert own funnel_events"');
    expect(SQL).toContain("FOR INSERT");
    expect(SQL).toContain("WITH CHECK (auth.uid() = user_id)");
    // The load-bearing negative: no SELECT/UPDATE/DELETE grant or policy for
    // authenticated anywhere in the file. A future edit that adds one would
    // let a grower read back analytics rows — including other users' rows,
    // since a SELECT policy added without its own WITH CHECK would default
    // to unrestricted.
    expect(SQL).not.toMatch(
      /GRANT\s+(SELECT|UPDATE|DELETE|ALL)\s+ON TABLE public\.funnel_events\s+TO authenticated/,
    );
    expect(SQL).not.toMatch(/FOR (SELECT|UPDATE|DELETE)/);
    // Column-scoped, not table-wide: a table-wide INSERT grant would let a
    // direct REST call (bypassing the app) supply its own `id` or, worse,
    // an arbitrary `created_at` — WITH CHECK above only constrains user_id,
    // so a forged created_at would otherwise sit inside every rolling
    // window in funnel_events_operator_summary() for as long as it's
    // forward-dated. A future edit widening this back to a bare
    // "GRANT INSERT ON TABLE ... TO authenticated" must fail here.
    expect(SQL).not.toMatch(/GRANT INSERT ON TABLE public\.funnel_events TO authenticated/);
    expect(SQL).not.toMatch(/GRANT INSERT\s*\([^)]*\bid\b[^)]*\)\s*ON TABLE public\.funnel_events/);
    expect(SQL).not.toMatch(
      /GRANT INSERT\s*\([^)]*\bcreated_at\b[^)]*\)\s*ON TABLE public\.funnel_events/,
    );
  });

  it("does not hardcode the event catalog as a DB-level enum", () => {
    // Deliberate: FUNNEL_EVENTS in TS is the single source of truth and
    // changes routinely. A hardcoded CHECK ... IN (...) would need a
    // migration on every catalog change and reject valid events in the gap.
    expect(SQL).not.toMatch(/event_name\s+text\s+NOT NULL\s+CHECK\s*\(\s*event_name\s+IN/);
    // Structural hygiene bound still applies.
    expect(SQL).toContain("CHECK (char_length(event_name) BETWEEN 1 AND 64)");
    expect(SQL).toContain("CHECK (jsonb_typeof(props) = 'object')");
  });

  it("the operator summary RPC returns aggregate counts only, never a row or an id", () => {
    expect(SQL).toContain("CREATE OR REPLACE FUNCTION public.funnel_events_operator_summary()");
    expect(SQL).toContain("STABLE");
    expect(SQL).toContain("SECURITY DEFINER");
    expect(SQL).toContain("SET search_path = public, pg_temp");
    expect(SQL).toContain("public.has_role(auth.uid(), 'operator'::public.app_role)");
    expect(SQL).toContain(
      "REVOKE ALL ON FUNCTION public.funnel_events_operator_summary() FROM PUBLIC",
    );
    expect(SQL).toContain(
      "REVOKE ALL ON FUNCTION public.funnel_events_operator_summary() FROM anon",
    );
    expect(SQL).toContain(
      "GRANT EXECUTE ON FUNCTION public.funnel_events_operator_summary() TO authenticated",
    );
    // Auth check comes before the operator check, and both come before any
    // real query runs — never leaks existence-of-data to an unauthenticated
    // or non-operator caller.
    // Bounded to the function's own definition — unbounded would run to the
    // end of the file and pick up the trailing COMMENT ON strings, which
    // legitimately mention "user_id" in prose about NOT leaking it.
    const fnBody = SQL.split(
      "CREATE OR REPLACE FUNCTION public.funnel_events_operator_summary()",
    )[1].split("REVOKE ALL ON FUNCTION public.funnel_events_operator_summary()")[0];
    const authIdx = fnBody.indexOf("auth.uid() IS NULL");
    const roleIdx = fnBody.indexOf("has_role(auth.uid()");
    const queryIdx = fnBody.indexOf("FROM public.funnel_events");
    expect(authIdx).toBeGreaterThan(-1);
    expect(roleIdx).toBeGreaterThan(authIdx);
    expect(queryIdx).toBeGreaterThan(roleIdx);
    // No per-row or per-user field in the returned aggregate. Strip SQL line
    // comments first — the file's own reassuring comment text about NOT
    // leaking user_id would otherwise trip this exact check.
    const fnBodyNoComments = fnBody
      .split("\n")
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n");
    expect(fnBodyNoComments).not.toMatch(/'user_id'|\buser_id\b/);
    expect(fnBody).not.toContain("SELECT *");
  });
});
