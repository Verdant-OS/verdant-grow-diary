import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  resolvePiIngestBridgeCredentialMetadata,
  type PiIngestBridgeCredentialSafeRow,
  type BridgeCredentialMetadata,
} from "@/lib/piIngestBridgeCredentialMetadataResolver";

function row(
  overrides: Partial<PiIngestBridgeCredentialSafeRow> = {},
): PiIngestBridgeCredentialSafeRow {
  return {
    id: "id-1",
    user_id: "user-1",
    bridge_id: "bridge-1",
    secret_hint: "hint",
    allowed_tent_ids: ["tent-1"],
    is_active: true,
    secret_status: "active_encrypted",
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-02T00:00:00Z",
    last_used_at: null,
    ...overrides,
  };
}

describe("resolvePiIngestBridgeCredentialMetadata — mapping", () => {
  it("maps snake_case columns to camelCase metadata", () => {
    const [out] = resolvePiIngestBridgeCredentialMetadata([row()]);
    const expected: BridgeCredentialMetadata = {
      id: "id-1",
      userId: "user-1",
      bridgeId: "bridge-1",
      secretHint: "hint",
      allowedTentIds: ["tent-1"],
      isActive: true,
      secretStatus: "active_encrypted",
      createdAt: "2026-05-01T00:00:00Z",
      updatedAt: "2026-05-02T00:00:00Z",
      lastUsedAt: null,
    };
    expect(out).toEqual(expected);
  });

  it("copies allowed_tent_ids defensively", () => {
    const tents = ["tent-1", "tent-2"];
    const [out] = resolvePiIngestBridgeCredentialMetadata([
      row({ allowed_tent_ids: tents }),
    ]);
    expect(out.allowedTentIds).toEqual(tents);
    expect(out.allowedTentIds).not.toBe(tents);
  });

  it("preserves null secret_hint and null last_used_at", () => {
    const [out] = resolvePiIngestBridgeCredentialMetadata([
      row({ secret_hint: null, last_used_at: null }),
    ]);
    expect(out.secretHint).toBeNull();
    expect(out.lastUsedAt).toBeNull();
  });
});

describe("resolvePiIngestBridgeCredentialMetadata — filtering", () => {
  it("returns [] for null/undefined/empty input", () => {
    expect(resolvePiIngestBridgeCredentialMetadata(null)).toEqual([]);
    expect(resolvePiIngestBridgeCredentialMetadata(undefined)).toEqual([]);
    expect(resolvePiIngestBridgeCredentialMetadata([])).toEqual([]);
  });

  it("skips inactive rows", () => {
    const out = resolvePiIngestBridgeCredentialMetadata([
      row({ id: "a", bridge_id: "a", is_active: false }),
      row({ id: "b", bridge_id: "b", is_active: true }),
    ]);
    expect(out.map((c) => c.bridgeId)).toEqual(["b"]);
  });

  it("skips malformed rows without throwing", () => {
    const out = resolvePiIngestBridgeCredentialMetadata([
      null,
      undefined,
      {},
      { id: 1, user_id: "x", bridge_id: "y" },
      row({ id: "ok", bridge_id: "ok" }),
    ] as unknown[]);
    expect(out).toHaveLength(1);
    expect(out[0].bridgeId).toBe("ok");
  });

  it("rejects rows with unknown secret_status", () => {
    const out = resolvePiIngestBridgeCredentialMetadata([
      row({ secret_status: "unexpected" as unknown as "disabled" }),
    ]);
    expect(out).toEqual([]);
  });
});

describe("resolvePiIngestBridgeCredentialMetadata — dedupe", () => {
  it("dedupes by (user_id, bridge_id), keeping most recently updated", () => {
    const out = resolvePiIngestBridgeCredentialMetadata([
      row({
        id: "old",
        user_id: "u1",
        bridge_id: "b1",
        updated_at: "2026-05-01T00:00:00Z",
      }),
      row({
        id: "new",
        user_id: "u1",
        bridge_id: "b1",
        updated_at: "2026-05-10T00:00:00Z",
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("new");
  });

  it("does not dedupe across different users or bridges", () => {
    const out = resolvePiIngestBridgeCredentialMetadata([
      row({ id: "1", user_id: "u1", bridge_id: "b1" }),
      row({ id: "2", user_id: "u2", bridge_id: "b1" }),
      row({ id: "3", user_id: "u1", bridge_id: "b2" }),
    ]);
    expect(out).toHaveLength(3);
  });
});

describe("resolvePiIngestBridgeCredentialMetadata — static safety", () => {
  const RAW = readFileSync(
    resolve(__dirname, "../lib/piIngestBridgeCredentialMetadataResolver.ts"),
    "utf8",
  );
  // Strip block + line comments so doc strings don't trip regex scans.
  const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it.each([
    ["no Supabase import", /from\s+["']@\/integrations\/supabase/],
    ["no service_role", /service_role/i],
    ["no secret_ciphertext field", /secret_ciphertext/],
    ["no secret_nonce field", /secret_nonce/],
    ["no secret_key_version field", /secret_key_version/],
    ["no secret_hash field", /secret_hash/],
    ["no decryption API (createDecipheriv)", /createDecipheriv/],
    ["no crypto.subtle.decrypt", /crypto\.subtle\.decrypt/],
    ["no Deno.env.get", /Deno\.env\.get/],
    ["no process.env reads", /process\.env\./],
    [
      "no plaintext secret field on the output type",
      /\bsecret\s*:\s*string/,
    ],
  ])("source has no forbidden surface: %s", (_l, re) => {
    expect(SRC).not.toMatch(re);
  });

  it("output objects never include a usable secret field", () => {
    const [out] = resolvePiIngestBridgeCredentialMetadata([row()]);
    expect(out).not.toHaveProperty("secret");
    expect(out).not.toHaveProperty("secret_hash");
    expect(out).not.toHaveProperty("secret_ciphertext");
    expect(out).not.toHaveProperty("secret_nonce");
    expect(out).not.toHaveProperty("secret_key_version");
  });
});
