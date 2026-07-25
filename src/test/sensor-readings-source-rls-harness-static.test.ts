import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const HARNESS = readFileSync(
  resolve(ROOT, "scripts/run-sensor-readings-source-rls-harness.ts"),
  "utf8",
);

describe("sensor provenance RLS harness fixture safety", () => {
  it("creates owner-scoped tents through signed-in clients", () => {
    expect(HARNESS).toContain(
      "const ownerClient = await signIn(ownerFixture.email, ownerFixture.password);",
    );
    expect(HARNESS).toContain(
      "const otherClient = await signIn(otherFixture.email, otherFixture.password);",
    );
    expect(HARNESS).toMatch(
      /ownerClient\s*[\r\n]+\s*\.from\("tents"\)\s*[\r\n]+\s*\.insert\(\{\s*user_id:\s*ownerFixture\.id/,
    );
    expect(HARNESS).toMatch(
      /otherClient\s*[\r\n]+\s*\.from\("tents"\)\s*[\r\n]+\s*\.insert\(\{\s*user_id:\s*otherFixture\.id/,
    );
    expect(HARNESS).not.toMatch(/admin\s*[\r\n]+\s*\.from\("tents"\)\s*[\r\n]+\s*\.insert\(/);
  });

  it("retains the explicit service-role trusted-source assertion", () => {
    expect(HARNESS).toContain('"service-role RLS bypass can INSERT trusted live provenance"');
    expect(HARNESS).toMatch(
      /admin\s*[\r\n]+\s*\.from\("sensor_readings"\)\s*[\r\n]+\s*\.insert\(serviceRoleRow\)/,
    );
  });

  it("keeps the remote-database opt-in guard and never prints credentials", () => {
    expect(HARNESS).toContain("SENSOR_READINGS_SOURCE_RLS_HARNESS_ALLOW_REMOTE");
    expect(HARNESS).toContain("refusing remote database");
    expect(HARNESS).not.toMatch(
      /console\.(?:log|error)\([^)]*(?:serviceRoleKey|anonKey|SUPABASE_SERVICE_ROLE_KEY)/,
    );
  });
});
