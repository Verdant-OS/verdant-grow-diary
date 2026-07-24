/**
 * genetics-propagation-rls-harness-static
 *
 * The runtime harness needs a disposable Supabase stack, so it cannot run in the
 * unit suite. This test pins its safety envelope + coverage statically: it
 * defaults to a no-op, refuses the production project ref, requires loopback for
 * the local lane, and exercises each mandated trust-boundary proof.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const HARNESS = "scripts/run-genetics-propagation-rls-harness.ts";
const PKG = "package.json";

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8");
}

describe("genetics propagation RLS harness (static)", () => {
  const src = read(HARNESS);

  it("defaults to a no-op unless explicitly opted in", () => {
    expect(src).toMatch(/GENETICS_PROP_RLS_HARNESS/);
    expect(src).toMatch(/--confirm-local-security-lane/);
    expect(src).toMatch(/SKIP —/);
    expect(src).toMatch(/process\.exit\(0\)/);
  });

  it("refuses the Verdant production project ref and requires loopback for the local lane", () => {
    expect(src).toMatch(/knkwiiywfkbqznbxwqfh/);
    expect(src).toMatch(/refusing Verdant production database/);
    expect(src).toMatch(/local security lane requires a loopback database/);
  });

  it("uses genuinely signed-in anon clients (real RLS), service_role only for setup", () => {
    expect(src).toMatch(/signInWithPassword/);
    expect(src).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(src).toMatch(/SUPABASE_ANON_KEY/);
  });

  it("covers every mandated trust-boundary proof", () => {
    // owner success
    expect(src).toMatch(/owner creates accession/);
    // stranger + operator denial
    expect(src).toMatch(/stranger cannot read owner accession/);
    expect(src).toMatch(/operator cannot read owner accession/);
    // client user_id spoof rejection
    expect(src).toMatch(/client user_id spoof is ignored/);
    // cross-tenant linkage rejection
    expect(src).toMatch(/cross-tenant mother is rejected/);
    expect(src).toMatch(/cross-tenant assign is a hard reject/);
    // no information leakage
    expect(src).toMatch(/identical envelopes \(no oracle\)/);
    // immutable evidence/audit
    expect(src).toMatch(/screening rows are immutable/);
    expect(src).toMatch(/assignment audit is immutable/);
    // cycle rejection
    expect(src).toMatch(/self-cycle assignment is rejected/);
    // idempotent repeat + concurrent
    expect(src).toMatch(/idempotent replay \+ concurrent return the original id/);
    expect(src).toMatch(/idempotent replay created exactly one row/);
    // atomic rollback
    expect(src).toMatch(/failed multi-assign leaves no partial rows/);
    expect(src).toMatch(/corrected retry \(same key\) succeeds/);
    // quarantine clearance rules
    expect(src).toMatch(/release without a negative is refused/);
    expect(src).toMatch(/another subject's certificate cannot clear/);
    expect(src).toMatch(/a matching current negative clears/);
  });

  it("tears down disposable users and verifies zero leftovers", () => {
    expect(src).toMatch(/deleteUser/);
    expect(src).toMatch(/has zero leftovers/);
  });

  it("exposes package aliases but does NOT join test:security-db-local", () => {
    const pkg = read(PKG);
    expect(pkg).toMatch(
      /"test:genetics-propagation-rls": "bun run scripts\/run-genetics-propagation-rls-harness\.ts"/,
    );
    expect(pkg).toMatch(
      /"test:genetics-propagation-rls:local-lane": "bun run scripts\/run-genetics-propagation-rls-harness\.ts --confirm-local-security-lane"/,
    );
    const securityLane = pkg.match(/"test:security-db-local":\s*"([^"]*)"/);
    expect(securityLane).toBeTruthy();
    expect(securityLane![1]).not.toMatch(/genetics-propagation/);
  });
});
