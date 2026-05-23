/**
 * Static guardrails for src/lib/piIngestServerSecretResolverTypes.ts.
 *
 * Types/contracts only — verifies exported names, runtime sentinels,
 * and that the module remains free of any runtime resolver logic
 * (no crypto, no Supabase, no env reads, no Deno).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as Types from "@/lib/piIngestServerSecretResolverTypes";
import {
  BRIDGE_SECRET_RESOLVER_FAILURE_REASONS,
  BRIDGE_SECRET_STATUSES,
  type BridgeSecretResolverFailure,
  type BridgeSecretResolverFailureReason,
  type BridgeSecretResolverResult,
  type BridgeSecretStatus,
  type ResolveBridgeSecretInput,
  type ResolvedBridgeSecret,
} from "@/lib/piIngestServerSecretResolverTypes";

const SRC = resolve(
  __dirname,
  "../../src/lib/piIngestServerSecretResolverTypes.ts",
);
const TEXT = existsSync(SRC) ? readFileSync(SRC, "utf8") : "";

describe("piIngestServerSecretResolverTypes — module existence", () => {
  it("source file exists", () => {
    expect(existsSync(SRC)).toBe(true);
  });
});

describe("piIngestServerSecretResolverTypes — runtime sentinels", () => {
  it("exports every failure reason in the union", () => {
    expect([...BRIDGE_SECRET_RESOLVER_FAILURE_REASONS].sort()).toEqual(
      [
        "missing_credential",
        "inactive_credential",
        "missing_ciphertext",
        "missing_nonce",
        "missing_key_version",
        "unknown_key_version",
        "missing_env_key",
        "decrypt_failed",
        "invalid_secret_status",
      ].sort(),
    );
  });

  it("exports every allowed secret status", () => {
    expect([...BRIDGE_SECRET_STATUSES].sort()).toEqual(
      ["pending_rotation", "active_encrypted", "disabled"].sort(),
    );
  });

  it("does not export any success-path factory or resolver function", () => {
    for (const [name, value] of Object.entries(Types)) {
      if (typeof value === "function") {
        throw new Error(`Unexpected exported function: ${name}`);
      }
    }
  });
});

describe("piIngestServerSecretResolverTypes — shape compatibility", () => {
  it("accepts a structurally valid ResolveBridgeSecretInput", () => {
    const input: ResolveBridgeSecretInput = {
      bridgeId: "bridge-1",
      secretCiphertext: new Uint8Array([1, 2, 3]),
      secretNonce: "nonce-b64",
      secretKeyVersion: 1,
      secretStatus: "active_encrypted",
    };
    expect(input.bridgeId).toBe("bridge-1");
    expect(input.secretKeyVersion).toBe(1);
  });

  it("ResolvedBridgeSecret discriminates with ok:true", () => {
    const ok: ResolvedBridgeSecret = {
      ok: true,
      bridgeId: "bridge-1",
      secret: "in-memory-only",
    };
    expect(ok.ok).toBe(true);
    expect(ok.bridgeId).toBe("bridge-1");
  });

  it("BridgeSecretResolverFailure discriminates with ok:false", () => {
    const reason: BridgeSecretResolverFailureReason = "decrypt_failed";
    const fail: BridgeSecretResolverFailure = {
      ok: false,
      reason,
      message: "generic failure",
    };
    expect(fail.ok).toBe(false);
    expect(fail.reason).toBe("decrypt_failed");
  });

  it("BridgeSecretResolverResult narrows via ok discriminator", () => {
    const results: BridgeSecretResolverResult[] = [
      { ok: true, bridgeId: "b", secret: "s" },
      { ok: false, reason: "missing_credential", message: "m" },
    ];
    for (const r of results) {
      if (r.ok === true) {
        expect(typeof r.secret).toBe("string");
      } else {
        expect(typeof r.reason).toBe("string");
        expect(typeof r.message).toBe("string");
      }
    }
  });

  it("BridgeSecretStatus union admits only the documented values", () => {
    const allowed: BridgeSecretStatus[] = [
      "pending_rotation",
      "active_encrypted",
      "disabled",
    ];
    expect(allowed).toHaveLength(3);
  });
});

describe("piIngestServerSecretResolverTypes — forbidden surfaces (static scan)", () => {
  it.each([
    [/from\s+["']@?\/?integrations\/supabase/i, "supabase client import"],
    [/createClient\s*\(/, "supabase createClient"],
    [/service_role/i, "service_role reference"],
    [/crypto\.subtle/i, "crypto.subtle usage"],
    [/\bcreateDecipheriv\b/, "node crypto decipher"],
    [/\bcreateCipheriv\b/, "node crypto cipher"],
    [/\bDeno\b/, "Deno global"],
    [/process\.env\b/, "process.env read"],
    [/import\.meta\.env\b/, "vite env read"],
    [/PI_INGEST_SECRET_KEY/, "env key name reference"],
    [/from\s+["']node:crypto["']/, "node:crypto import"],
    [/from\s+["']crypto["']/, "crypto import"],
  ])("does not contain %s (%s)", (re) => {
    expect(TEXT).not.toMatch(re as RegExp);
  });

  it("does not export any resolver function", () => {
    expect(TEXT).not.toMatch(/export\s+(async\s+)?function\s+resolve/i);
  });

  it("contains no real or sample secret material", () => {
    expect(TEXT).not.toMatch(/-----BEGIN [A-Z ]+-----/);
    expect(TEXT).not.toMatch(/sk_live_/);
    expect(TEXT).not.toMatch(/sk_test_/);
  });
});
