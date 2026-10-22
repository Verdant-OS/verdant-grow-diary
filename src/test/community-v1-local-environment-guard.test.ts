import { describe, expect, it } from "vitest";
import { requireLocalCommunityEnvironment } from "../../scripts/security/community-v1-db-proof.mjs";

describe("requireLocalCommunityEnvironment", () => {
  const valid = {
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_ANON_KEY: "fake-anon",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service",
    SUPABASE_DB_URL: "postgresql://postgres:fake-password@127.0.0.1:54322/postgres",
  };

  it("accepts distinct loopback API and database URLs", () => {
    const parsed = requireLocalCommunityEnvironment(valid);
    expect(parsed.api.hostname).toBe("127.0.0.1");
    expect(parsed.database.hostname).toBe("127.0.0.1");
  });

  it.each([
    ["https API URL", { ...valid, SUPABASE_URL: "https://127.0.0.1:54321" }],
    ["API path suffix", { ...valid, SUPABASE_URL: "http://127.0.0.1:54321/rest/v1" }],
    ["API query string", { ...valid, SUPABASE_URL: "http://127.0.0.1:54321?apikey=x" }],
    [
      "remote database host",
      { ...valid, SUPABASE_DB_URL: "postgresql://u:p@db.example.com/postgres" },
    ],
    [
      "database query override",
      { ...valid, SUPABASE_DB_URL: `${valid.SUPABASE_DB_URL}?host=evil` },
    ],
    [
      "identical anon and service keys",
      { ...valid, SUPABASE_SERVICE_ROLE_KEY: valid.SUPABASE_ANON_KEY },
    ],
    [
      "missing database password",
      { ...valid, SUPABASE_DB_URL: "postgresql://postgres@127.0.0.1/postgres" },
    ],
  ])("blocks unsafe env: %s", (_label, env) => {
    expect(() => requireLocalCommunityEnvironment(env)).toThrow(/BLOCKED/);
  });
});
