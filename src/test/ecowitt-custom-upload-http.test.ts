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
      commitIngest: async (input) => {
        events.push(`commit:${input.capturedAt}:${input.passkeySha256}`);
        inserted = input.rows;
        return { ok: true, stored: input.rows.length, reason: "stored" };
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
      reason?: string;
    };
    expect(response.status).toBe(200);
    expect(payload).toEqual({ accepted: true, stored: 4 });
    expect(payload.reason).toBeUndefined();
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
    const commitAt = events.findIndex((event) => event.startsWith("commit:"));
    expect(commitAt).toBeGreaterThan(entitlementAt);
    expect(events.some((event) => event.startsWith("commit:2026-11-02T18:00:00Z:"))).toBe(true);
  });

  it("returns 503 on a failed insert and lets the retry commit", async () => {
    const events: string[] = [];
    let failInsert = true;
    const ports: EcowittCustomUploadPorts = {
      now: () => NOW,
      sha256Hex,
      lookupClaim: async () => claim(null),
      entitlement: async () => "allowed",
      commitIngest: async () => {
        events.push("commit");
        if (failInsert) return { ok: false, reason: "store_failed" };
        return { ok: true, stored: 4, reason: "stored" };
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
    expect(await failed.json()).toMatchObject({
      accepted: false,
      stored: 0,
      reason: "store_failed",
    });
    expect(events).toEqual(["commit"]);
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
    expect(events).toEqual(["commit", "commit"]);
  });

  it("stores nothing when the commit rejects or a replay hits the unique key", async () => {
    const events: string[] = [];
    const limited = await handleEcowittCustomUploadRequest(
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
        commitIngest: async () => {
          events.push("commit");
          return { ok: false, reason: "rate_limited" };
        },
        tentChannels: channels(),
      },
    );
    expect(limited.status).toBe(200);
    expect(await limited.json()).toEqual({ accepted: false, stored: 0, reason: "rejected" });
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
        commitIngest: async () => {
          events.push("duplicate");
          return { ok: false, reason: "duplicate" };
        },
        tentChannels: channels(),
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: false, stored: 0, reason: "duplicate" });
    expect(events).toEqual(["commit", "duplicate"]);
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
        commitIngest: async () => ({ ok: true, stored: 0, reason: "stored" }),
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
      commitIngest: async () => {
        inserts += 1;
        return { ok: true, stored: 1, reason: "stored" };
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
    expect(await oversized.json()).toEqual({ accepted: false, stored: 0 });
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
          commitIngest: async () => ({ ok: false, reason: "store_failed" }),
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
