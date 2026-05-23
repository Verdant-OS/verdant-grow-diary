import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateBridgeOwnerScope } from "@/lib/piIngestBridgeOwnerScopeRules";
import type { BridgeCredentialMetadata } from "@/lib/piIngestBridgeCredentialMetadataResolver";

function cred(
  overrides: Partial<BridgeCredentialMetadata> = {},
): BridgeCredentialMetadata {
  return {
    id: "id-1",
    userId: "user-1",
    bridgeId: "bridge-1",
    secretHint: null,
    allowedTentIds: ["tent-1"],
    isActive: true,
    secretStatus: "active_encrypted",
    createdAt: "2026-05-01T00:00:00Z",
    updatedAt: "2026-05-02T00:00:00Z",
    lastUsedAt: null,
    ...overrides,
  };
}

describe("evaluateBridgeOwnerScope — happy path", () => {
  it("returns ok when bridge owner matches tent owner", () => {
    expect(
      evaluateBridgeOwnerScope({
        credential: cred({ userId: "user-1" }),
        tentOwnerUserId: "user-1",
      }),
    ).toEqual({ ok: true });
  });
});

describe("evaluateBridgeOwnerScope — rejections", () => {
  it("rejects unknown_bridge when credential is null/undefined", () => {
    expect(
      evaluateBridgeOwnerScope({
        credential: null,
        tentOwnerUserId: "user-1",
      }),
    ).toEqual({ ok: false, reason: "unknown_bridge" });
    expect(
      evaluateBridgeOwnerScope({
        credential: undefined,
        tentOwnerUserId: "user-1",
      }),
    ).toEqual({ ok: false, reason: "unknown_bridge" });
  });

  it("rejects unknown_bridge when credential.userId is missing/empty", () => {
    for (const u of ["", "   ", null, undefined]) {
      expect(
        evaluateBridgeOwnerScope({
          credential: cred({ userId: u as unknown as string }),
          tentOwnerUserId: "user-1",
        }),
      ).toEqual({ ok: false, reason: "unknown_bridge" });
    }
  });

  it("rejects inactive credential", () => {
    expect(
      evaluateBridgeOwnerScope({
        credential: cred({ isActive: false }),
        tentOwnerUserId: "user-1",
      }),
    ).toEqual({ ok: false, reason: "inactive" });
  });

  it("rejects missing_tent_owner for null/undefined/empty/whitespace", () => {
    for (const t of [null, undefined, "", "   "]) {
      expect(
        evaluateBridgeOwnerScope({
          credential: cred(),
          tentOwnerUserId: t,
        }),
      ).toEqual({ ok: false, reason: "missing_tent_owner" });
    }
  });

  it("rejects owner_mismatch when tent owner differs from bridge owner", () => {
    expect(
      evaluateBridgeOwnerScope({
        credential: cred({ userId: "user-A" }),
        tentOwnerUserId: "user-B",
      }),
    ).toEqual({ ok: false, reason: "owner_mismatch" });
  });
});

describe("evaluateBridgeOwnerScope — precedence", () => {
  it("unknown_bridge beats every other reason", () => {
    expect(
      evaluateBridgeOwnerScope({ credential: null, tentOwnerUserId: null }),
    ).toEqual({ ok: false, reason: "unknown_bridge" });
  });

  it("inactive beats missing_tent_owner and owner_mismatch", () => {
    expect(
      evaluateBridgeOwnerScope({
        credential: cred({ isActive: false, userId: "user-A" }),
        tentOwnerUserId: null,
      }),
    ).toEqual({ ok: false, reason: "inactive" });
    expect(
      evaluateBridgeOwnerScope({
        credential: cred({ isActive: false, userId: "user-A" }),
        tentOwnerUserId: "user-B",
      }),
    ).toEqual({ ok: false, reason: "inactive" });
  });

  it("missing_tent_owner beats owner_mismatch", () => {
    expect(
      evaluateBridgeOwnerScope({
        credential: cred({ userId: "user-A" }),
        tentOwnerUserId: null,
      }),
    ).toEqual({ ok: false, reason: "missing_tent_owner" });
  });
});

describe("evaluateBridgeOwnerScope — defensive input", () => {
  it("handles missing input object without throwing", () => {
    const out = evaluateBridgeOwnerScope(
      undefined as unknown as Parameters<typeof evaluateBridgeOwnerScope>[0],
    );
    expect(out).toEqual({ ok: false, reason: "unknown_bridge" });
  });

  it("is case-sensitive on user ids", () => {
    expect(
      evaluateBridgeOwnerScope({
        credential: cred({ userId: "User-1" }),
        tentOwnerUserId: "user-1",
      }),
    ).toEqual({ ok: false, reason: "owner_mismatch" });
  });
});

describe("evaluateBridgeOwnerScope — static safety", () => {
  const RAW = readFileSync(
    resolve(__dirname, "../lib/piIngestBridgeOwnerScopeRules.ts"),
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
