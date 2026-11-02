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
  };
}

function formBody(): string {
  const body = new URLSearchParams({
    PASSKEY,
    stationtype: "GW1200-fixture",
    dateutc: "2026-11-02 18:00:00",
    tempinf: "72",
    humidityin: "55",
    soilmoisture1: "40",
    co2: "800",
  });
  return body.toString();
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
      touchClaim: async () => {
        events.push("touch");
        return { ok: true };
      },
      insertReadings: async (rows) => {
        events.push("insert");
        inserted = rows;
        return { ok: true };
      },
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
    expect(inserted[0]?.capturedAt).toBe("2026-11-02T18:00:00Z");
    expect(events[0]).toBe(`lookup:${await sha256Hex(TOKEN)}`);
    expect(events[1]?.startsWith("entitlement:")).toBe(true);
    expect(events.indexOf("insert")).toBeGreaterThan(
      events.findIndex((event) => event.startsWith("entitlement:")),
    );
    expect(events.some((event) => event.startsWith("bind:"))).toBe(true);
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
      reason: "passkey_mismatch",
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
});
