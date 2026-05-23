import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateBridgeTentScope } from "@/lib/piIngestBridgeTentScopeRules";
import type { BridgeCredentialMetadata } from "@/lib/piIngestBridgeCredentialMetadataResolver";

function cred(
  overrides: Partial<BridgeCredentialMetadata> = {},
): BridgeCredentialMetadata {
  return {
    id: "id-1",
    userId: "user-1",
    bridgeId: "bridge-1",
    secretHint: null,
    allowedTentIds: ["tent-1", "tent-2"],
    isActive: true,
    secretStatus: "active_encrypted",
    createdAt: "2026-05-01T00:00:00Z",
    updatedAt: "2026-05-02T00:00:00Z",
    lastUsedAt: null,
    ...overrides,
  };
}

describe("evaluateBridgeTentScope — happy path", () => {
  it("returns ok when tent is in allowedTentIds", () => {
    expect(
      evaluateBridgeTentScope({ credential: cred(), tentId: "tent-1" }),
    ).toEqual({ ok: true });
    expect(
      evaluateBridgeTentScope({ credential: cred(), tentId: "tent-2" }),
    ).toEqual({ ok: true });
  });
});

describe("evaluateBridgeTentScope — rejections", () => {
  it("rejects unknown_bridge when credential is null/undefined", () => {
    expect(
      evaluateBridgeTentScope({ credential: null, tentId: "tent-1" }),
    ).toEqual({ ok: false, reason: "unknown_bridge" });
    expect(
      evaluateBridgeTentScope({ credential: undefined, tentId: "tent-1" }),
    ).toEqual({ ok: false, reason: "unknown_bridge" });
  });

  it("rejects inactive credential", () => {
    expect(
      evaluateBridgeTentScope({
        credential: cred({ isActive: false }),
        tentId: "tent-1",
      }),
    ).toEqual({ ok: false, reason: "inactive" });
  });

  it("rejects missing_tent_id for null/undefined/empty tentId", () => {
    for (const t of [null, undefined, "", "   "]) {
      expect(
        evaluateBridgeTentScope({ credential: cred(), tentId: t }),
      ).toEqual({ ok: false, reason: "missing_tent_id" });
    }
  });

  it("rejects tent_not_allowed when tent is not in allowedTentIds", () => {
    expect(
      evaluateBridgeTentScope({ credential: cred(), tentId: "tent-99" }),
    ).toEqual({ ok: false, reason: "tent_not_allowed" });
  });

  it("rejects tent_not_allowed when allowedTentIds is empty", () => {
    expect(
      evaluateBridgeTentScope({
        credential: cred({ allowedTentIds: [] }),
        tentId: "tent-1",
      }),
    ).toEqual({ ok: false, reason: "tent_not_allowed" });
  });

  it("rejects tent_not_allowed when allowedTentIds is not an array", () => {
    expect(
      evaluateBridgeTentScope({
        credential: cred({
          allowedTentIds: null as unknown as string[],
        }),
        tentId: "tent-1",
      }),
    ).toEqual({ ok: false, reason: "tent_not_allowed" });
  });
});

describe("evaluateBridgeTentScope — precedence", () => {
  it("unknown_bridge beats every other reason", () => {
    expect(
      evaluateBridgeTentScope({ credential: null, tentId: null }),
    ).toEqual({ ok: false, reason: "unknown_bridge" });
  });

  it("inactive beats missing_tent_id and tent_not_allowed", () => {
    expect(
      evaluateBridgeTentScope({
        credential: cred({ isActive: false, allowedTentIds: [] }),
        tentId: null,
      }),
    ).toEqual({ ok: false, reason: "inactive" });
  });

  it("missing_tent_id beats tent_not_allowed", () => {
    expect(
      evaluateBridgeTentScope({
        credential: cred({ allowedTentIds: [] }),
        tentId: null,
      }),
    ).toEqual({ ok: false, reason: "missing_tent_id" });
  });
});

describe("evaluateBridgeTentScope — defensive input", () => {
  it("handles missing input object without throwing", () => {
    const out = evaluateBridgeTentScope(
      undefined as unknown as Parameters<typeof evaluateBridgeTentScope>[0],
    );
    expect(out).toEqual({ ok: false, reason: "unknown_bridge" });
  });
});

describe("evaluateBridgeTentScope — static safety", () => {
  const RAW = readFileSync(
    resolve(__dirname, "../lib/piIngestBridgeTentScopeRules.ts"),
    "utf8",
  );
  const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it.each([
    ["no Supabase import", /from\s+["']@\/integrations\/supabase/],
    ["no service_role", /service_role/i],
    ["no secret_ciphertext", /secret_ciphertext/],
    ["no secret_nonce", /secret_nonce/],
    ["no secret_key_version", /secret_key_version/],
    ["no secret_hash", /secret_hash/],
    ["no createDecipheriv", /createDecipheriv/],
    ["no crypto.subtle.decrypt", /crypto\.subtle\.decrypt/],
    ["no Deno.env.get", /Deno\.env\.get/],
    ["no process.env reads", /process\.env\./],
    ["no plaintext secret field", /\bsecret\s*:\s*string/],
  ])("source has no forbidden surface: %s", (_l, re) => {
    expect(SRC).not.toMatch(re);
  });
});
