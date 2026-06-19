/**
 * Webhook compatibility test for the EcoWitt live soil bridge.
 *
 * Proves the bridge produces a payload the Verdant `sensor-ingest-webhook`
 * accepts, using a mocked transport. NEVER performs a real network call.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  runEcowittDryRun,
  toCanonicalIngestPreview,
} from "../../scripts/ecowitt-live-soil-dry-run";
import {
  handleMqttMessage,
  forwardWithBackoff,
} from "../../scripts/ecowitt-live-soil-bridge";
import type { CanonicalWebhookPayload } from "@/lib/ecowittLiveSoilIngestRules";

const TENT = "11111111-1111-1111-1111-111111111111";
const TOKEN = "vbt_TEST_TOKEN_NEVER_LOG_ME_ZZZZ";
const FIXTURE = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../fixtures/ecowitt-live-soil-sample.json"),
    "utf8",
  ),
) as Record<string, unknown>;

function cleanFixture() {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(FIXTURE)) if (!k.startsWith("_")) out[k] = v;
  return out;
}

const NOW = new Date(`${(FIXTURE.dateutc as string).replace(" ", "T")}Z`);

describe("EcoWitt bridge → ingest webhook compatibility (mocked)", () => {
  it("canonical preview uses source='live', provider='ecowitt', transport='mqtt'", () => {
    const out = runEcowittDryRun({
      payload: cleanFixture(),
      defaultTentId: TENT,
      now: NOW,
    });
    expect(out.canonicalPreviews.length).toBeGreaterThan(0);
    const air = out.canonicalPreviews.find((p) => p.metrics.temp_f !== undefined)!;
    expect(air.source).toBe("live");
    expect(air.provider).toBe("ecowitt");
    expect(air.transport).toBe("mqtt");
    expect(air.tent_id).toBe(TENT);
    expect(typeof air.captured_at).toBe("string");
    expect(typeof air.metrics.humidity_pct).toBe("number");
    expect(typeof air.metrics.vpd_kpa).toBe("number");
  });

  it("forwards exactly one accepted payload via injected transport (no real fetch)", async () => {
    const calls: { url: string; auth: string; body: CanonicalWebhookPayload }[] = [];
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>)?.Authorization ?? "";
      calls.push({
        url,
        auth,
        body: JSON.parse(init!.body as string) as CanonicalWebhookPayload,
      });
      return new Response("{}", { status: 200 });
    });

    const logs: { msg: string; extra?: unknown }[] = [];
    const result = await handleMqttMessage(JSON.stringify(cleanFixture()), {
      env: {
        ingestUrl: "https://example.invalid/sensor-ingest-webhook",
        bridgeToken: TOKEN,
        defaultTentId: TENT,
        defaultPlantId: null,
        channelMap: {},
        dryRun: false,
      },
      forward: (p) =>
        forwardWithBackoff(p, {
          url: "https://example.invalid/sensor-ingest-webhook",
          bridgeToken: TOKEN,
          fetchImpl: fakeFetch as unknown as typeof fetch,
          maxAttempts: 1,
        }),
      log: (_l, msg, extra) => logs.push({ msg, extra }),
      now: NOW,
    });

    expect(result.accepted).toBeGreaterThan(0);
    expect(calls.length).toBe(result.accepted);
    expect(calls[0].auth).toMatch(/^Bearer\s+vbt_/);

    // body shape compatible with sensor-ingest-webhook
    const body = calls[0].body;
    expect(body.tent_id).toBe(TENT);
    expect(body.vendor).toBe("ecowitt");
    expect(body.metadata.transport).toBe("mqtt");
    expect(typeof body.captured_at).toBe("string");

    // canonical (audit) preview is "live"
    const preview = toCanonicalIngestPreview(body);
    expect(preview.source).toBe("live");
    expect(preview.provider).toBe("ecowitt");
  });

  it("never logs the bridge token in plain text", async () => {
    const fakeFetch = vi.fn(
      async () => new Response("{}", { status: 200 }),
    );
    const logged: string[] = [];
    await handleMqttMessage(JSON.stringify(cleanFixture()), {
      env: {
        ingestUrl: "https://example.invalid/sensor-ingest-webhook",
        bridgeToken: TOKEN,
        defaultTentId: TENT,
        defaultPlantId: null,
        channelMap: {},
        dryRun: false,
      },
      forward: (p) =>
        forwardWithBackoff(p, {
          url: "https://example.invalid/sensor-ingest-webhook",
          bridgeToken: TOKEN,
          fetchImpl: fakeFetch as unknown as typeof fetch,
          maxAttempts: 1,
        }),
      log: (_l, msg, extra) =>
        logged.push(`${msg} ${extra ? JSON.stringify(extra) : ""}`),
      now: NOW,
    });
    for (const line of logged) {
      expect(line).not.toContain(TOKEN);
      expect(line).not.toMatch(/Bearer\s+vbt_/);
    }
  });

  it("does not forward when normalized payload is invalid", async () => {
    const fakeFetch = vi.fn();
    const result = await handleMqttMessage(
      JSON.stringify({ tempf: 9999, humidity: 250 }),
      {
        env: {
          ingestUrl: "https://example.invalid/sensor-ingest-webhook",
          bridgeToken: TOKEN,
          defaultTentId: TENT,
          defaultPlantId: null,
          channelMap: {},
          dryRun: false,
        },
        forward: (p) =>
          forwardWithBackoff(p, {
            url: "https://example.invalid/sensor-ingest-webhook",
            bridgeToken: TOKEN,
            fetchImpl: fakeFetch as unknown as typeof fetch,
            maxAttempts: 1,
          }),
        log: () => {},
        now: NOW,
      },
    );
    expect(result.accepted).toBe(0);
    expect(fakeFetch).not.toHaveBeenCalled();
  });
});

describe("EcoWitt webhook-compat — bridge + dry-run script safety", () => {
  const bridgeSrc = readFileSync(
    resolve(__dirname, "../../scripts/ecowitt-live-soil-bridge.ts"),
    "utf8",
  );
  const drySrc = readFileSync(
    resolve(__dirname, "../../scripts/ecowitt-live-soil-dry-run.ts"),
    "utf8",
  );
  it("bridge does not import @supabase/supabase-js", () => {
    expect(bridgeSrc).not.toMatch(/from\s+["']@supabase\/supabase-js["']/);
    expect(drySrc).not.toMatch(/from\s+["']@supabase\/supabase-js["']/);
  });
  it("bridge does not reference service_role secrets", () => {
    expect(bridgeSrc).not.toMatch(/SERVICE_ROLE_KEY/);
    expect(drySrc).not.toMatch(/SERVICE_ROLE_KEY/);
  });
  it("dry-run script never calls real fetch", () => {
    expect(drySrc).not.toMatch(/\bfetch\s*\(/);
  });
});
