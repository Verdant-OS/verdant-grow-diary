import { describe, expect, it } from "vitest";
import {
  handleEcowittCustomUploadRequest,
  sha256Hex,
  type EcowittCustomUploadPorts,
} from "../../supabase/functions/_shared/ecowittCustomUploadHttp";
import type {
  EcowittCustomUploadClaim,
  EcowittCustomUploadStoredReading,
} from "@/lib/ecowittCustomUploadIngestRules";

const PASSKEY = "ab".repeat(16);
const TOKEN = "ef".repeat(24);
const NOW = new Date("2026-11-02T18:00:30.000Z");

function claim(passkeySha256: string | null): EcowittCustomUploadClaim {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    userId: "11111111-1111-4111-8111-111111111111",
    tentId: "22222222-2222-4222-8222-222222222222",
    passkeySha256,
    stationtype: passkeySha256 === null ? null : "GW1200-fixture",
    intervalSeconds: 16,
    revokedAt: null,
    lastReceivedAt: null,
    lastCapturedAt: null,
  };
}

function formBody(): string {
  const body = new URLSearchParams({
    PASSKEY,
    stationtype: "GW1200B",
    dateutc: "2026-11-02 18:00:00",
    tempinf: "70",
    humidityin: "40",
    temp2f: "72",
    humidity2: "55",
    soilmoisture2: "40",
    co2: "800",
  });
  return body.toString();
}

function channels() {
  return async () => ({ ok: true as const, airChannels: [2], soilChannels: [2, 3, 4] });
}

describe("EcoWitt customized-upload HTTP handler", () => {
  it("binds the first PASSKEY, stores live rows, and never echoes the secret", async () => {
    const events: string[] = [];
    let inserted: readonly EcowittCustomUploadStoredReading[] = [];
    const ports: EcowittCustomUploadPorts = {
      now: () => NOW,
      sha256Hex,
      lookupClaim: async (tokenHash) => {
        events.push(`lookup:${tokenHash}`);
        return claim(null);
      },
      entitlement: async (userId) => {
        events.push(`entitlement:${userId}`);
        return "allowed";
      },
      bindClaim: async (_id, passkeyHash) => {
        events.push(`bind:${passkeyHash}`);
        return { ok: true };
      },
      touchClaim: async (_id, _receivedAt, capturedAt) => {
        events.push(`touch:${capturedAt}`);
        return { ok: true };
      },
      insertReadings: async (rows) => {
        events.push("insert");
        inserted = rows;
        return { ok: true };
      },
      tentChannels: channels(),
    };
    const response = await handleEcowittCustomUploadRequest(
      new Request(`https://example.test/ew/${TOKEN}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: formBody(),
      }),
      ports,
    );
    const payload = (await response.json()) as {
      accepted: boolean;
      stored: number;
      reason: string;
    };
    expect(response.status).toBe(200);
    expect(payload).toEqual({ accepted: true, stored: 4, reason: "stored" });
    expect(JSON.stringify(payload)).not.toContain(PASSKEY);
    expect(inserted[0]?.source).toBe("live");
    expect(
      inserted.flatMap((row) => row.rawPayload.channels.map((channel) => channel.rawKey)),
    ).not.toContain("tempinf");
    expect(
      inserted.flatMap((row) => row.rawPayload.channels.map((channel) => channel.rawKey)),
    ).toContain("temp2f");
    expect(inserted[0]?.capturedAt).toBe("2026-11-02T18:00:00Z");
    expect(events[0]).toBe(`lookup:${await sha256Hex(TOKEN)}`);
    expect(events[1]?.startsWith("entitlement:")).toBe(true);
    const entitlementAt = events.findIndex((event) => event.startsWith("entitlement:"));
    const touchAt = events.findIndex((event) => event.startsWith("touch:"));
    const bindAt = events.findIndex((event) => event.startsWith("bind:"));
    const insertAt = events.indexOf("insert");
    expect(insertAt).toBeGreaterThan(entitlementAt);
    expect(touchAt).toBeGreaterThan(insertAt);
    expect(bindAt).toBeGreaterThan(touchAt);
    expect(events.some((event) => event === "touch:2026-11-02T18:00:00Z")).toBe(true);
  });

  it("reserves the receipt after insert and retries a failed insert", async () => {
    const events: string[] = [];
    let failInsert = true;
    const ports: EcowittCustomUploadPorts = {
      now: () => NOW,
      sha256Hex,
      lookupClaim: async () => claim(null),
      entitlement: async () => "allowed",
      bindClaim: async () => {
        events.push("bind");
        return { ok: true };
      },
      touchClaim: async () => {
        events.push("touch");
        return { ok: true };
      },
      insertReadings: async () => {
        events.push("insert");
        if (failInsert) return { ok: false };
        return { ok: true };
      },
      tentChannels: channels(),
    };
    const failed = await handleEcowittCustomUploadRequest(
      new Request(`https://example.test/ew/${TOKEN}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: formBody(),
      }),
      ports,
    );
    expect(failed.status).toBe(503);
    expect(events).toEqual(["insert"]);
    failInsert = false;
    const retried = await handleEcowittCustomUploadRequest(
      new Request(`https://example.test/ew/${TOKEN}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: formBody(),
      }),
      ports,
    );
    expect(retried.status).toBe(200);
    expect(events).toEqual(["insert", "insert", "touch", "bind"]);
    const rpc = await handleEcowittCustomUploadRequest(
      new Request(`https://example.test/ew/${TOKEN}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: formBody(),
      }),
      {
        ...ports,
        touchClaim: async () => ({ ok: false, reason: "store_failed" }),
      },
    );
    expect(rpc.status).toBe(200);
    expect(await rpc.json()).toMatchObject({ accepted: true, reason: "stored", stored: 4 });
  });

  it("returns 200 after the readings are stored when the receipt or bind fails", async () => {
    const ports: EcowittCustomUploadPorts = {
      now: () => NOW,
      sha256Hex,
      lookupClaim: async () => claim(null),
      entitlement: async () => "allowed",
      bindClaim: async () => ({ ok: true }),
      touchClaim: async () => ({ ok: true }),
      insertReadings: async () => ({ ok: true }),
      tentChannels: channels(),
    };
    const request = () =>
      new Request(`https://example.test/ew/${TOKEN}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: formBody(),
      });
    const missing = await handleEcowittCustomUploadRequest(request(), {
      ...ports,
      touchClaim: async () => ({ ok: false, reason: "claim_not_found" }),
    });
    expect(missing.status).toBe(200);
    expect(await missing.json()).toMatchObject({ accepted: true, reason: "stored", stored: 4 });
    const unbound = await handleEcowittCustomUploadRequest(request(), {
      ...ports,
      bindClaim: async () => ({ ok: false }),
    });
    expect(unbound.status).toBe(200);
    expect(await unbound.json()).toMatchObject({ accepted: true, reason: "stored", stored: 4 });
  });

  it("returns 503 when the tent channel lookup fails", async () => {
    const response = await handleEcowittCustomUploadRequest(
      new Request(`https://example.test/ew/${TOKEN}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: formBody(),
      }),
      {
        now: () => NOW,
        sha256Hex,
        lookupClaim: async () => claim(null),
        entitlement: async () => "allowed",
        bindClaim: async () => ({ ok: true }),
        touchClaim: async () => ({ ok: true }),
        insertReadings: async () => ({ ok: true }),
        tentChannels: async () => ({ ok: false }),
      },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      accepted: false,
      reason: "store_failed",
      stored: 0,
    });
  });

  it("does not insert when a second PASSKEY arrives or the body is too large", async () => {
    const passkeyHash = await sha256Hex(PASSKEY);
    let inserts = 0;
    const ports: EcowittCustomUploadPorts = {
      now: () => NOW,
      sha256Hex,
      lookupClaim: async () => claim(passkeyHash),
      entitlement: async () => "allowed",
      bindClaim: async () => ({ ok: true }),
      touchClaim: async () => ({ ok: true }),
      insertReadings: async () => {
        inserts += 1;
        return { ok: true };
      },
      tentChannels: channels(),
    };
    const mismatch = await handleEcowittCustomUploadRequest(
      new Request(`https://example.test/ew/${TOKEN}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          PASSKEY: "cd".repeat(16),
          stationtype: "GW1200-fixture",
          dateutc: "2026-11-02 18:00:00",
          tempinf: "70",
        }).toString(),
      }),
      ports,
    );
    expect(await mismatch.json()).toMatchObject({
      accepted: false,
      reason: "rejected",
      stored: 0,
    });
    const oversized = await handleEcowittCustomUploadRequest(
      new Request(`https://example.test/ew/${TOKEN}`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "content-length": "70000",
        },
        body: "PASSKEY=abcd",
      }),
      {
        ...ports,
        lookupClaim: async () => {
          throw new Error("lookup should not run for an oversized body");
        },
      },
    );
    expect(oversized.status).toBe(200);
    expect(await oversized.json()).toMatchObject({ accepted: false, reason: "payload_too_large" });
    expect(inserts).toBe(0);
  });

  it("returns 503 when the reading insert fails", async () => {
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    };
    try {
      const response = await handleEcowittCustomUploadRequest(
        new Request(`https://example.test/ew/${TOKEN}`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: formBody(),
        }),
        {
          now: () => NOW,
          sha256Hex,
          lookupClaim: async () => claim(null),
          entitlement: async () => "allowed",
          bindClaim: async () => ({ ok: true }),
          touchClaim: async () => ({ ok: true }),
          insertReadings: async () => ({ ok: false }),
          tentChannels: channels(),
        },
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        accepted: false,
        reason: "store_failed",
        stored: 0,
      });
      expect(errors.some((line) => line.includes("insert_failed"))).toBe(true);
    } finally {
      console.error = original;
    }
  });
});
