/**
 * Tests for the pure HMAC bridge authentication module.
 * No Supabase, no Edge Function, no network, no writes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  BridgeCredential,
  buildSigningString,
  computeHmacSha256Hex,
  constantTimeEqualHex,
  SIGNING_WINDOW_MS,
  verifyBridgeRequest,
} from "@/lib/piIngestAuthRules";

const SECRET = "super-secret-bridge-token-abc";
const OWNER = "owner-user-uuid-1";
const TENT = "tent-uuid-1";
const OTHER_TENT = "tent-uuid-2";
const BRIDGE = "pi-bridge-1";

const credential: BridgeCredential = {
  bridgeId: BRIDGE,
  secret: SECRET,
  ownerUserId: OWNER,
  allowedTentIds: [TENT],
  isActive: true,
};

const NOW = Date.parse("2026-05-23T12:00:00Z");
const TS = "2026-05-23T11:59:30Z"; // 30s old, within window

const RAW_BODY = JSON.stringify({
  tent_id: TENT,
  device_id: "pi-1",
  readings: [{ metric: "temperature_c", value: 24.2, unit: "c" }],
});

async function signedReq(overrides: Partial<Parameters<typeof verifyBridgeRequest>[0]> = {}) {
  const method = overrides.method ?? "POST";
  const path = overrides.path ?? "/functions/v1/pi-ingest-readings";
  const timestamp = overrides.timestamp ?? TS;
  const rawBody = overrides.rawBody ?? RAW_BODY;
  const signature = await computeHmacSha256Hex(
    SECRET,
    buildSigningString(method, path, timestamp ?? "", rawBody),
  );
  return {
    bridgeId: BRIDGE,
    signature,
    timestamp,
    method,
    path,
    rawBody,
    tentId: TENT,
    now: NOW,
    ...overrides,
  };
}

describe("piIngestAuthRules — happy path", () => {
  it("valid signature passes", async () => {
    const r = await verifyBridgeRequest(await signedReq(), [credential]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ownerUserId).toBe(OWNER);
      expect(r.bridgeId).toBe(BRIDGE);
      expect(r.tentId).toBe(TENT);
    }
  });

  it("ownerUserId comes from the credential, not the request body", async () => {
    const malicious = JSON.stringify({ user_id: "attacker", tent_id: TENT });
    const req = await signedReq({ rawBody: malicious });
    const r = await verifyBridgeRequest(req, [credential]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ownerUserId).toBe(OWNER);
  });

  it("uppercase hex signature is accepted (case-normalized comparison)", async () => {
    const req = await signedReq();
    const r = await verifyBridgeRequest(
      { ...req, signature: req.signature!.toUpperCase() },
      [credential],
    );
    expect(r.ok).toBe(true);
  });

  it("works with credentials provided as a Map", async () => {
    const map = new Map<string, BridgeCredential>([[BRIDGE, credential]]);
    const r = await verifyBridgeRequest(await signedReq(), map);
    expect(r.ok).toBe(true);
  });
});

describe("piIngestAuthRules — rejection branches", () => {
  it("missing bridgeId rejects", async () => {
    const req = await signedReq();
    const r = await verifyBridgeRequest({ ...req, bridgeId: "" }, [credential]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected failure');
    expect((r as { code: string }).code).toBe("missing_bridge_id");
  });

  it("unknown bridgeId rejects", async () => {
    const req = await signedReq({ bridgeId: "nope" });
    const r = await verifyBridgeRequest(req, [credential]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected failure');
    expect((r as { code: string }).code).toBe("unknown_bridge_id");
  });

  it("inactive credential rejects", async () => {
    const inactive = { ...credential, isActive: false };
    const r = await verifyBridgeRequest(await signedReq(), [inactive]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected failure');
    expect((r as { code: string }).code).toBe("inactive_credential");
  });

  it("missing signature rejects", async () => {
    const req = await signedReq();
    const r = await verifyBridgeRequest({ ...req, signature: "" }, [credential]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected failure');
    expect((r as { code: string }).code).toBe("missing_signature");
  });

  it("missing timestamp rejects", async () => {
    const req = await signedReq();
    const r = await verifyBridgeRequest({ ...req, timestamp: "" }, [credential]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected failure');
    expect((r as { code: string }).code).toBe("missing_timestamp");
  });

  it("invalid timestamp rejects", async () => {
    const req = await signedReq({ timestamp: "not-a-date" });
    const r = await verifyBridgeRequest(req, [credential]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected failure');
    expect((r as { code: string }).code).toBe("invalid_timestamp");
  });

  it("timestamp older than 5 minutes rejects", async () => {
    const old = new Date(NOW - SIGNING_WINDOW_MS - 1000).toISOString();
    const req = await signedReq({ timestamp: old });
    const r = await verifyBridgeRequest(req, [credential]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected failure');
    expect((r as { code: string }).code).toBe("timestamp_too_old");
  });

  it("timestamp more than 5 minutes in the future rejects", async () => {
    const future = new Date(NOW + SIGNING_WINDOW_MS + 1000).toISOString();
    const req = await signedReq({ timestamp: future });
    const r = await verifyBridgeRequest(req, [credential]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected failure');
    expect((r as { code: string }).code).toBe("timestamp_too_far_future");
  });

  it("missing tentId rejects", async () => {
    const req = await signedReq();
    const r = await verifyBridgeRequest({ ...req, tentId: "" }, [credential]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected failure');
    expect((r as { code: string }).code).toBe("missing_tent_id");
  });

  it("tentId not in allowedTentIds rejects", async () => {
    const req = await signedReq({ tentId: OTHER_TENT });
    const r = await verifyBridgeRequest(req, [credential]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected failure');
    expect((r as { code: string }).code).toBe("tent_not_allowed");
  });

  it("tampered rawBody rejects (signature stale)", async () => {
    const req = await signedReq();
    const r = await verifyBridgeRequest(
      { ...req, rawBody: req.rawBody + " " },
      [credential],
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected failure');
    expect((r as { code: string }).code).toBe("invalid_signature");
  });

  it("wrong HTTP method rejects", async () => {
    const req = await signedReq();
    const r = await verifyBridgeRequest({ ...req, method: "PUT" }, [credential]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected failure');
    expect((r as { code: string }).code).toBe("invalid_signature");
  });

  it("wrong path rejects", async () => {
    const req = await signedReq();
    const r = await verifyBridgeRequest(
      { ...req, path: "/functions/v1/other" },
      [credential],
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected failure');
    expect((r as { code: string }).code).toBe("invalid_signature");
  });

  it("wrong secret rejects", async () => {
    const wrong = { ...credential, secret: "different-secret" };
    const r = await verifyBridgeRequest(await signedReq(), [wrong]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected failure');
    expect((r as { code: string }).code).toBe("invalid_signature");
  });
});

describe("piIngestAuthRules — secret hygiene & determinism", () => {
  it("does not include the credential secret in success result", async () => {
    const r = await verifyBridgeRequest(await signedReq(), [credential]);
    expect(JSON.stringify(r)).not.toContain(SECRET);
  });

  it("does not include the credential secret in any failure result", async () => {
    const cases = [
      await verifyBridgeRequest({ ...(await signedReq()), bridgeId: "" }, [credential]),
      await verifyBridgeRequest(await signedReq({ bridgeId: "nope" }), [credential]),
      await verifyBridgeRequest({ ...(await signedReq()), signature: "" }, [credential]),
      await verifyBridgeRequest({ ...(await signedReq()), timestamp: "" }, [credential]),
      await verifyBridgeRequest(await signedReq({ tentId: OTHER_TENT }), [credential]),
    ];
    for (const r of cases) expect(JSON.stringify(r)).not.toContain(SECRET);
  });

  it("does not accept client-provided user_id (body field is ignored)", async () => {
    const body = JSON.stringify({ user_id: "attacker-user" });
    const r = await verifyBridgeRequest(await signedReq({ rawBody: body }), [credential]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ownerUserId).toBe(OWNER);
  });

  it("buildSigningString is deterministic and method-uppercased", () => {
    const a = buildSigningString("post", "/p", "2026-01-01T00:00:00Z", '{"k":1}');
    const b = buildSigningString("POST", "/p", "2026-01-01T00:00:00Z", '{"k":1}');
    expect(a).toBe(b);
    expect(a).toBe('POST\n/p\n2026-01-01T00:00:00Z\n{"k":1}');
  });

  it("constantTimeEqualHex rejects length mismatch and detects differences", () => {
    expect(constantTimeEqualHex("abcd", "abcd")).toBe(true);
    expect(constantTimeEqualHex("abcd", "abce")).toBe(false);
    expect(constantTimeEqualHex("abcd", "abcde")).toBe(false);
  });
});

// ------------- Static safety: module surface restrictions -------------

const SRC = readFileSync(
  resolve(__dirname, "../lib/piIngestAuthRules.ts"),
  "utf8",
);

describe("piIngestAuthRules — static safety", () => {
  it("does not import Supabase, React, or perform I/O", () => {
    expect(SRC).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(SRC).not.toMatch(/@supabase\/supabase-js/);
    expect(SRC).not.toMatch(/from\s+["']react["']/);
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/\.(insert|update|delete|upsert|rpc)\s*\(/);
  });

  it("does not reference forbidden integration surfaces", () => {
    expect(SRC).not.toMatch(/service_role/);
    expect(SRC).not.toMatch(/action_queue/);
    expect(SRC).not.toMatch(
      /\bmqtt\b|home[\s_-]?assistant|automation|device[\s_-]?control/i,
    );
  });
});
