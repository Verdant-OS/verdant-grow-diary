/**
 * Guard: the sign-in email hook sends directly through Lovable's managed
 * sender from Verdant's own domain, and never goes back to the auth_emails
 * queue without anyone noticing.
 *
 * Why this exists: Lovable switched auth-email-hook to a direct
 * `sendLovableEmail` call in 4e598b046 (2026-11-01), but that commit never
 * reached `verdant-grow-diary`. The deploy branch kept the older queue
 * version, Lovable's editor reported "Email update undone", and its managed
 * sign-in email function was not redeployed. Nothing in CI noticed, because
 * no test described the hook's send path. This file does.
 *
 * @source-scan-justified: auth-email-hook is a Deno module with npm:
 * specifiers and Deno globals, which vitest cannot import. The send path is
 * a property of the source itself. The manifest and migration assertions
 * below read resolved data, not source text.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import domainReach from "../../config/edge-function-domain-reach.json";

const ROOT = path.resolve(__dirname, "../..");
const HOOK = path.join(ROOT, "supabase/functions/auth-email-hook/index.ts");
const EMAIL_INFRA_MIGRATION = path.join(ROOT, "supabase/migrations/20260707153206_email_infra.sql");

const source = fs.readFileSync(HOOK, "utf-8");

function constant(name: string): string | undefined {
  return source.match(new RegExp(`const ${name} = "([^"]+)";`))?.[1];
}

describe("auth-email-hook sends sign-in email directly from Verdant's domain", () => {
  it("imports the managed sender and its structured error from a pinned email-js", () => {
    expect(source).toMatch(
      /import \{[^}]*\bsendLovableEmail\b[^}]*\} from "npm:@lovable\.dev\/email-js@\d+\.\d+\.\d+";/,
    );
    expect(source).toMatch(
      /import \{[^}]*\bEmailAPIError\b[^}]*\} from "npm:@lovable\.dev\/email-js@\d+\.\d+\.\d+";/,
    );
  });

  it("calls sendLovableEmail once and never enqueues onto auth_emails", () => {
    expect(source.match(/await sendLovableEmail\(/g)).toHaveLength(1);
    expect(source).not.toMatch(/enqueue_email/);
    expect(source).not.toMatch(/auth_emails/);
  });

  it("sends from Verdant's own domain through the notify subdomain", () => {
    expect(constant("SENDER_DOMAIN")).toBe("notify.verdantgrowdiary.com");
    expect(constant("FROM_DOMAIN")).toBe("verdantgrowdiary.com");
    expect(source).toContain("from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`");
    expect(source).toContain("sender_domain: SENDER_DOMAIN");
  });

  it("makes a Supabase Auth retry idempotent on the hook's run_id", () => {
    expect(source).toContain("idempotency_key: run_id");
  });

  it("keeps the recipient address out of the success log line", () => {
    const success = source.match(/console\.log\("Auth email sent", \{([^}]*)\}\)/);
    expect(success?.[1]).toBeDefined();
    expect(success?.[1]).not.toMatch(/payload\.data\.email|\bemail\s*:/);
  });

  it("only writes audit statuses the email_send_log constraint allows", () => {
    const writeLog = source.match(/const writeLog = async \(status: ([^,]+),/);
    const written = (writeLog?.[1] ?? "").match(/"([a-z_]+)"/g)?.map((s) => s.slice(1, -1));
    expect(written).toEqual(["sent", "suppressed", "failed"]);

    const sql = fs.readFileSync(EMAIL_INFRA_MIGRATION, "utf-8");
    const allowed = sql
      .match(/status TEXT NOT NULL CHECK \(status IN \(([^)]+)\)\)/)?.[1]
      .match(/'([a-z_]+)'/g)
      ?.map((s) => s.slice(1, -1));
    expect(allowed).toBeDefined();
    for (const status of written ?? []) expect(allowed).toContain(status);
  });
});

describe("edge-function domain-reach manifest matches the direct send path", () => {
  it("declares no queue RPC for auth-email-hook", () => {
    const entry = (
      domainReach as { functions: Record<string, { tables: string[]; rpcs: string[] }> }
    ).functions["auth-email-hook"];
    expect(entry.tables).toEqual(["email_send_log"]);
    expect(entry.rpcs).toEqual([]);
  });
});
