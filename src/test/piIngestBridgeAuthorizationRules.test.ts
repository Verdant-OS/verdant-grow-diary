import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateBridgeAuthorization } from "@/lib/piIngestBridgeAuthorizationRules";
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

describe("evaluateBridgeAuthorization — happy path", () => {
  it("returns ok when owner matches and tent is allowed", () => {
    expect(
      evaluateBridgeAuthorization({
        credential: cred(),
        tentId: "tent-1",
        tentOwnerUserId: "user-1",
      }),
    ).toEqual({ ok: true });
  });
});

describe("evaluateBridgeAuthorization — owner stage rejections", () => {
  it("passes through unknown_bridge from owner stage", () => {
    expect(
      evaluateBridgeAuthorization({
        credential: null,
        tentId: "tent-1",
        tentOwnerUserId: "user-1",
      }),
    ).toEqual({ ok: false, stage: "owner", reason: "unknown_bridge" });
  });

  it("passes through inactive from owner stage", () => {
    expect(
      evaluateBridgeAuthorization({
        credential: cred({ isActive: false }),
        tentId: "tent-1",
        tentOwnerUserId: "user-1",
      }),
    ).toEqual({ ok: false, stage: "owner", reason: "inactive" });
  });

  it("passes through missing_tent_owner from owner stage", () => {
    expect(
      evaluateBridgeAuthorization({
        credential: cred(),
        tentId: "tent-1",
        tentOwnerUserId: null,
      }),
    ).toEqual({ ok: false, stage: "owner", reason: "missing_tent_owner" });
  });

  it("passes through owner_mismatch from owner stage", () => {
    expect(
      evaluateBridgeAuthorization({
        credential: cred({ userId: "user-A" }),
        tentId: "tent-1",
        tentOwnerUserId: "user-B",
      }),
    ).toEqual({ ok: false, stage: "owner", reason: "owner_mismatch" });
  });
});

describe("evaluateBridgeAuthorization — tent stage rejections", () => {
  it("passes through missing_tent_id from tent stage", () => {
    expect(
      evaluateBridgeAuthorization({
        credential: cred(),
        tentId: null,
        tentOwnerUserId: "user-1",
      }),
    ).toEqual({ ok: false, stage: "tent", reason: "missing_tent_id" });
  });

  it("passes through tent_not_allowed from tent stage", () => {
    expect(
      evaluateBridgeAuthorization({
        credential: cred(),
        tentId: "tent-99",
        tentOwnerUserId: "user-1",
      }),
    ).toEqual({ ok: false, stage: "tent", reason: "tent_not_allowed" });
  });
});

describe("evaluateBridgeAuthorization — stage ordering", () => {
  it("owner stage runs before tent stage (owner failure short-circuits tent failure)", () => {
    // Both owner (mismatch) and tent (not allowed) would fail; owner must win.
    const out = evaluateBridgeAuthorization({
      credential: cred({ userId: "user-A", allowedTentIds: [] }),
      tentId: "tent-99",
      tentOwnerUserId: "user-B",
    });
    expect(out).toEqual({
      ok: false,
      stage: "owner",
      reason: "owner_mismatch",
    });
  });

  it("owner unknown_bridge short-circuits a missing tentId", () => {
    expect(
      evaluateBridgeAuthorization({
        credential: null,
        tentId: null,
        tentOwnerUserId: "user-1",
      }),
    ).toEqual({ ok: false, stage: "owner", reason: "unknown_bridge" });
  });

  it("tent stage only reached after owner passes", () => {
    const out = evaluateBridgeAuthorization({
      credential: cred(),
      tentId: "tent-99",
      tentOwnerUserId: "user-1",
    });
    expect(out.ok).toBe(false);
    if (out.ok === false) expect(out.stage).toBe("tent");
  });
});

describe("evaluateBridgeAuthorization — defensive input", () => {
  it("handles missing input object without throwing", () => {
    const out = evaluateBridgeAuthorization(
      undefined as unknown as Parameters<typeof evaluateBridgeAuthorization>[0],
    );
    expect(out).toEqual({
      ok: false,
      stage: "owner",
      reason: "unknown_bridge",
    });
  });
});

describe("evaluateBridgeAuthorization — static safety", () => {
  const RAW = readFileSync(
    resolve(__dirname, "../lib/piIngestBridgeAuthorizationRules.ts"),
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
