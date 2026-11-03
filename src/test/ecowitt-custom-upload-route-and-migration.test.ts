/**
 * @source-scan-justified: the migration is not applied in this environment,
 * and the Cloudflare file is a byte copy of the route rules so a worker can
 * ship without importing application source. Both are delivery artifacts.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ecowittPlainHttpUpstreamUrl,
  planEcowittPlainHttpRoute,
} from "@/lib/ecowittPlainHttpRouteRules";

const ROOT = resolve(__dirname, "../..");
const MIGRATION = readFileSync(
  resolve(ROOT, "supabase/migrations/20261102150000_ecowitt_custom_upload_claims.sql"),
  "utf8",
);

describe("EcoWitt plain-HTTP route", () => {
  it("forwards only POST /ew/<token> and leaves every other path alone", () => {
    const token = "ef".repeat(24);
    expect(
      planEcowittPlainHttpRoute({ method: "POST", pathname: `/ew/${token}`, contentLength: 120 }),
    ).toEqual({ handled: true, forward: true, token, reason: "forward" });
    expect(
      planEcowittPlainHttpRoute({ method: "GET", pathname: "/", contentLength: null }).handled,
    ).toBe(false);
    expect(
      planEcowittPlainHttpRoute({ method: "POST", pathname: `/ew/${token}`, contentLength: 70_000 })
        .reason,
    ).toBe("payload_too_large");
    expect(ecowittPlainHttpUpstreamUrl("https://edge.example.test/functions/v1", token)).toBe(
      `https://edge.example.test/functions/v1/ecowitt-custom-upload/ew/${token}`,
    );
    expect(ecowittPlainHttpUpstreamUrl("https://user:secret@edge.example.test", token)).toBeNull();
  });

  it("keeps the worker file identical to the route rules", () => {
    const source = readFileSync(resolve(ROOT, "src/lib/ecowittPlainHttpRouteRules.ts"), "utf8");
    const worker = readFileSync(resolve(ROOT, "cloudflare/ecowitt-plain-http-ingest.ts"), "utf8");
    const rules = readFileSync(resolve(ROOT, "src/lib/ecowittCustomUploadIngestRules.ts"), "utf8");
    const shared = readFileSync(
      resolve(ROOT, "supabase/functions/_shared/ecowittCustomUploadIngestRules.ts"),
      "utf8",
    );
    expect(worker).toBe(source);
    expect(shared).toBe(rules);
  });
});

describe("EcoWitt claim migration", () => {
  it("enables RLS, keeps writes off anon, and hashes the token", () => {
    expect(MIGRATION).toContain(
      "ALTER TABLE public.ecowitt_custom_upload_claims ENABLE ROW LEVEL SECURITY",
    );
    expect(MIGRATION).toContain("SET search_path TO 'public', 'pg_temp'");
    expect(MIGRATION).not.toMatch(/GRANT\s+[^;]*\sTO\s+anon/i);
    expect(MIGRATION).not.toMatch(/CREATE\s+POLICY[\s\S]*FOR\s+INSERT/i);
    expect(MIGRATION).toContain("extensions.gen_random_bytes(24)");
    expect(MIGRATION).toContain("extensions.digest(convert_to(raw_token, 'utf8'), 'sha256')");
    expect(MIGRATION).not.toContain("encode(gen_random_bytes(");
    expect(MIGRATION).not.toContain("encode(digest(");
    expect(MIGRATION).toContain("last_captured_at timestamptz");
    expect(MIGRATION).toContain(
      "GRANT EXECUTE ON FUNCTION public.reserve_ecowitt_custom_upload_receipt(uuid, timestamptz, timestamptz) TO service_role",
    );
    expect(MIGRATION).toContain(
      "GRANT EXECUTE ON FUNCTION public.commit_ecowitt_custom_upload_ingest(uuid, timestamptz, timestamptz, text, text, jsonb)",
    );
    expect(MIGRATION).toContain("passkey_sha256 = NULL");
    expect(MIGRATION).toContain("p_captured_at <= v_last_captured");
    expect(MIGRATION).toContain("public.revoke_ecowitt_custom_upload_claim");
    expect(MIGRATION).toContain("public.rotate_ecowitt_custom_upload_claim");
    expect(MIGRATION).toMatch(
      /rotate_ecowitt_custom_upload_claim[\s\S]*IF NOT FOUND THEN\s*RAISE EXCEPTION 'claim not found';/,
    );
    expect(MIGRATION).not.toContain("PASSKEY");
  });
});
