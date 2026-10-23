import { describe, expect, it } from "vitest";

import { requireLocalCommunityEnvironment } from "../../scripts/security/community-v1-db-proof.mjs";

const LOCAL_PROOF_ENV = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "fake-anon",
  SUPABASE_SERVICE_ROLE_KEY: "fake-service",
  SUPABASE_DB_URL: "postgresql://postgres:fake-password@127.0.0.1:54322/postgres",
};

describe("requireLocalCommunityEnvironment", () => {
  it("accepts loopback IPv4, localhost and bracketed IPv6 API hosts", () => {
    for (const url of ["http://127.0.0.1:54321", "http://localhost:54321", "http://[::1]:54321"]) {
      const parsed = requireLocalCommunityEnvironment({ ...LOCAL_PROOF_ENV, SUPABASE_URL: url });
      expect(parsed.api.hostname).toBeTruthy();
      expect(parsed.database.hostname.replace(/^\[|\]$/g, "")).toBeTruthy();
    }
  });

  it.each([
    { SUPABASE_ANON_KEY: "" },
    { SUPABASE_URL: "" },
    { SUPABASE_URL: "https://127.0.0.1:54321" },
    { SUPABASE_URL: "http://127.0.0.1:54321/nested" },
    { SUPABASE_DB_URL: "postgresql://postgres@127.0.0.1:54322/postgres" },
  ])("rejects unsafe or incomplete env before any proof runs: %j", (patch) => {
    expect(() => requireLocalCommunityEnvironment({ ...LOCAL_PROOF_ENV, ...patch })).toThrow(
      /BLOCKED/,
    );
  });
});
