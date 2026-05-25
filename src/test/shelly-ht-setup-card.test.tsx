/**
 * Tests for Shelly H&T Gen4 read-only Setup card.
 *
 * Covers:
 *  - Pure rule transitions (not-configured / awaiting / receiving / stale)
 *  - Latest Shelly snapshot extraction
 *  - Component render across each state
 *  - Token / copy-URL safety (no raw token exposed)
 *  - Source-label reuse (manual + sim never become Shelly)
 *  - Static safety scans (no automation, action_queue, alerts,
 *    service_role, fake live labels, or duplicated source-label maps)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  deriveShellyHtSetupStatus,
  findLatestShellyHtSnapshot,
} from "@/lib/shellyHtSetupRules";
import {
  buildRecentSensorSnapshotHistory,
  type RecentSensorSnapshot,
} from "@/lib/recentSensorSnapshotHistoryRules";
import { SHELLY_HT_DEVICE_LABEL } from "@/lib/shellyHtWebhookRules";
import { SOURCE_LABEL } from "@/lib/sensorSnapshot";

// --- Pure rule tests --------------------------------------------------------

const NOW = new Date("2026-05-25T12:00:00.000Z").getTime();

function snap(over: Partial<RecentSensorSnapshot> = {}): RecentSensorSnapshot {
  return {
    ts: new Date(NOW - 60_000).toISOString(),
    source: "live",
    stale: false,
    temp: 24,
    rh: 55,
    vpd: 1.34,
    co2: null,
    deviceDetail: SHELLY_HT_DEVICE_LABEL,
    ...over,
  };
}

describe("deriveShellyHtSetupStatus — pure", () => {
  it("returns not-configured when configured=false", () => {
    const v = deriveShellyHtSetupStatus({
      configured: false,
      tentAssignedToCaller: false,
      latest: null,
      now: NOW,
    });
    expect(v.state).toBe("not-configured");
    expect(v.showLatest).toBe(false);
    expect(v.isStale).toBe(false);
  });

  it("returns awaiting-first-reading when configured but no readings", () => {
    const v = deriveShellyHtSetupStatus({
      configured: true,
      tentAssignedToCaller: true,
      latest: null,
      now: NOW,
    });
    expect(v.state).toBe("awaiting-first-reading");
    expect(v.showLatest).toBe(false);
  });

  it("returns receiving when fresh Shelly reading exists", () => {
    const v = deriveShellyHtSetupStatus({
      configured: true,
      tentAssignedToCaller: true,
      latest: snap(),
      now: NOW,
    });
    expect(v.state).toBe("receiving");
    expect(v.showLatest).toBe(true);
    expect(v.isStale).toBe(false);
  });

  it("returns stale when latest Shelly reading is older than threshold", () => {
    const oldTs = new Date(NOW - 60 * 60 * 1000).toISOString(); // 1h old
    const v = deriveShellyHtSetupStatus({
      configured: true,
      tentAssignedToCaller: true,
      latest: snap({ ts: oldTs }),
      now: NOW,
    });
    expect(v.state).toBe("stale");
    expect(v.isStale).toBe(true);
    expect(v.showLatest).toBe(true);
  });

  it("is deterministic across calls", () => {
    const args = {
      configured: true,
      tentAssignedToCaller: true,
      latest: snap(),
      now: NOW,
    } as const;
    expect(JSON.stringify(deriveShellyHtSetupStatus(args))).toBe(
      JSON.stringify(deriveShellyHtSetupStatus(args)),
    );
  });

  it("never emits fake 'Live sensor' wording in user copy", () => {
    for (const state of [
      { configured: false, tentAssignedToCaller: false, latest: null },
      { configured: true, tentAssignedToCaller: true, latest: null },
      { configured: true, tentAssignedToCaller: true, latest: snap() },
      {
        configured: true,
        tentAssignedToCaller: true,
        latest: snap({ ts: new Date(NOW - 3600_000).toISOString() }),
      },
    ] as const) {
      const v = deriveShellyHtSetupStatus({ ...state, now: NOW });
      expect(v.headline.toLowerCase()).not.toContain("live sensor");
      expect(v.body.toLowerCase()).not.toContain("guaranteed");
    }
  });
});

describe("findLatestShellyHtSnapshot — pure", () => {
  it("returns null on empty input", () => {
    expect(findLatestShellyHtSnapshot([], SHELLY_HT_DEVICE_LABEL)).toBeNull();
    expect(findLatestShellyHtSnapshot(null, SHELLY_HT_DEVICE_LABEL)).toBeNull();
  });

  it("returns first matching Shelly reading (history is newest-first)", () => {
    const manual = snap({
      ts: new Date(NOW - 30_000).toISOString(),
      source: "manual",
      deviceDetail: null,
    });
    const shelly = snap({
      ts: new Date(NOW - 90_000).toISOString(),
    });
    const r = findLatestShellyHtSnapshot([manual, shelly], SHELLY_HT_DEVICE_LABEL);
    expect(r).toBe(shelly);
  });

  it("returns null when no Shelly readings present", () => {
    const manual = snap({ source: "manual", deviceDetail: null });
    expect(
      findLatestShellyHtSnapshot([manual], SHELLY_HT_DEVICE_LABEL),
    ).toBeNull();
  });

  it("integrates with buildRecentSensorSnapshotHistory + device labels", () => {
    const ts = new Date(NOW - 60_000).toISOString();
    const history = buildRecentSensorSnapshotHistory(
      [
        {
          ts,
          metric: "temperature_c",
          value: 24,
          source: "pi_bridge",
          device_id: "shelly-ht-gen4:aa",
        },
        {
          ts,
          metric: "humidity_pct",
          value: 55,
          source: "pi_bridge",
          device_id: "shelly-ht-gen4:aa",
        },
      ],
      { now: NOW },
    );
    const r = findLatestShellyHtSnapshot(history, SHELLY_HT_DEVICE_LABEL);
    expect(r).not.toBeNull();
    expect(r!.deviceDetail).toBe(SHELLY_HT_DEVICE_LABEL);
    expect(r!.source).toBe("live");
  });
});

// --- Component render -------------------------------------------------------

let mockStatus: {
  data?: unknown;
  isLoading?: boolean;
  error?: unknown;
} = { data: undefined, isLoading: true };

vi.mock("@/hooks/useShellyHtSetupStatus", () => ({
  useShellyHtSetupStatus: () => mockStatus,
}));

import ShellyHtSetupCard from "@/components/ShellyHtSetupCard";

function renderCard(rows: Parameters<typeof ShellyHtSetupCard>[0]["rows"]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ShellyHtSetupCard rows={rows} />
    </QueryClientProvider>,
  );
}

const TOKEN_RAW = "supersecrettoken1234abcd";
const MASKED = "••••abcd";

describe("ShellyHtSetupCard — component", () => {
  beforeEach(() => {
    mockStatus = { data: undefined, isLoading: true };
  });

  it("shows Not configured when server reports configured=false", () => {
    mockStatus = {
      data: {
        configured: false,
        tentAssignedToCaller: false,
        tentId: null,
        tentName: null,
        tokenMask: null,
        webhookUrl: "https://example.supabase.co/functions/v1/shelly-ht-webhook",
      },
      isLoading: false,
    };
    renderCard([]);
    const card = screen.getByTestId("shelly-ht-setup-card");
    expect(card.getAttribute("data-state")).toBe("not-configured");
    expect(screen.getByTestId("shelly-ht-setup-status-badge").textContent).toBe(
      "Not configured",
    );
  });

  it("shows Waiting for first reading when configured but no Shelly readings", () => {
    mockStatus = {
      data: {
        configured: true,
        tentAssignedToCaller: true,
        tentId: "t1",
        tentName: "Tent A",
        tokenMask: MASKED,
        webhookUrl: "https://example.supabase.co/functions/v1/shelly-ht-webhook",
      },
      isLoading: false,
    };
    renderCard([]);
    expect(
      screen.getByTestId("shelly-ht-setup-card").getAttribute("data-state"),
    ).toBe("awaiting-first-reading");
    expect(screen.queryByTestId("shelly-ht-setup-latest")).toBeNull();
  });

  it("shows Receiving readings with temp/humidity/VPD/timestamp when fresh Shelly reading present", () => {
    const ts = new Date(Date.now() - 60_000).toISOString();
    mockStatus = {
      data: {
        configured: true,
        tentAssignedToCaller: true,
        tentId: "t1",
        tentName: "Tent A",
        tokenMask: MASKED,
        webhookUrl: "https://example.supabase.co/functions/v1/shelly-ht-webhook",
      },
      isLoading: false,
    };
    renderCard([
      { ts, metric: "temperature_c", value: 24, source: "pi_bridge", device_id: "shelly-ht-gen4:aa" },
      { ts, metric: "humidity_pct", value: 55, source: "pi_bridge", device_id: "shelly-ht-gen4:aa" },
      { ts, metric: "vpd_kpa", value: 1.34, source: "pi_bridge", device_id: "shelly-ht-gen4:aa" },
    ]);
    expect(
      screen.getByTestId("shelly-ht-setup-card").getAttribute("data-state"),
    ).toBe("receiving");
    expect(screen.getByTestId("shelly-ht-setup-latest")).toBeTruthy();
    expect(screen.getByTestId("shelly-ht-setup-latest-temp")).toBeTruthy();
    expect(screen.getByTestId("shelly-ht-setup-latest-rh")).toBeTruthy();
    expect(screen.getByTestId("shelly-ht-setup-latest-vpd")).toBeTruthy();
    expect(screen.getByTestId("shelly-ht-setup-latest-captured")).toBeTruthy();
    expect(screen.getByTestId("shelly-ht-setup-latest-device").textContent)
      .toBe(SHELLY_HT_DEVICE_LABEL);
    // Live source label reused — no fake Shelly-only source name.
    expect(screen.getByTestId("shelly-ht-setup-latest-source").textContent)
      .toBe(SOURCE_LABEL.live);
  });

  it("shows Stale state when latest Shelly reading is older than threshold", () => {
    const ts = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h
    mockStatus = {
      data: {
        configured: true,
        tentAssignedToCaller: true,
        tentId: "t1",
        tentName: "Tent A",
        tokenMask: MASKED,
        webhookUrl: "https://example.supabase.co/functions/v1/shelly-ht-webhook",
      },
      isLoading: false,
    };
    renderCard([
      { ts, metric: "temperature_c", value: 24, source: "pi_bridge", device_id: "shelly-ht-gen4:aa" },
      { ts, metric: "humidity_pct", value: 55, source: "pi_bridge", device_id: "shelly-ht-gen4:aa" },
    ]);
    expect(
      screen.getByTestId("shelly-ht-setup-card").getAttribute("data-state"),
    ).toBe("stale");
    expect(screen.getByTestId("shelly-ht-setup-latest-stale")).toBeTruthy();
  });

  it("never renders the raw token — only the masked suffix", () => {
    mockStatus = {
      data: {
        configured: true,
        tentAssignedToCaller: true,
        tentId: "t1",
        tentName: "Tent A",
        tokenMask: MASKED,
        webhookUrl: "https://example.supabase.co/functions/v1/shelly-ht-webhook",
      },
      isLoading: false,
    };
    const { container } = renderCard([]);
    expect(container.textContent ?? "").not.toContain(TOKEN_RAW);
    expect(screen.getByTestId("shelly-ht-setup-token").textContent ?? "").toContain(
      MASKED,
    );
  });

  it("Copy webhook URL action uses ONLY the public function URL (no token)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    mockStatus = {
      data: {
        configured: true,
        tentAssignedToCaller: true,
        tentId: "t1",
        tentName: "Tent A",
        tokenMask: MASKED,
        webhookUrl: "https://example.supabase.co/functions/v1/shelly-ht-webhook",
      },
      isLoading: false,
    };
    renderCard([]);
    const btn = screen.getByTestId("shelly-ht-setup-copy-url") as HTMLButtonElement;
    btn.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toBe(
      "https://example.supabase.co/functions/v1/shelly-ht-webhook",
    );
    expect(copied).not.toContain(TOKEN_RAW);
    expect(copied.toLowerCase()).not.toContain("token=");
  });

  it("Manual readings still surface as Manual, not Shelly", () => {
    const ts = new Date(Date.now() - 60_000).toISOString();
    mockStatus = {
      data: {
        configured: true,
        tentAssignedToCaller: true,
        tentId: "t1",
        tentName: "Tent A",
        tokenMask: MASKED,
        webhookUrl: "https://example.supabase.co/functions/v1/shelly-ht-webhook",
      },
      isLoading: false,
    };
    // Only manual rows — no Shelly device_id.
    renderCard([
      { ts, metric: "temperature_c", value: 24, source: "manual" },
      { ts, metric: "humidity_pct", value: 55, source: "manual" },
    ]);
    // No Shelly latest panel because no Shelly device.
    expect(screen.queryByTestId("shelly-ht-setup-latest")).toBeNull();
    expect(
      screen.getByTestId("shelly-ht-setup-card").getAttribute("data-state"),
    ).toBe("awaiting-first-reading");
  });

  it("Simulated readings still surface as Simulated, not Shelly", () => {
    const ts = new Date(Date.now() - 60_000).toISOString();
    mockStatus = {
      data: {
        configured: true,
        tentAssignedToCaller: true,
        tentId: "t1",
        tentName: "Tent A",
        tokenMask: MASKED,
        webhookUrl: "https://example.supabase.co/functions/v1/shelly-ht-webhook",
      },
      isLoading: false,
    };
    renderCard([
      { ts, metric: "temperature_c", value: 24, source: "sim" },
      { ts, metric: "humidity_pct", value: 55, source: "sim" },
    ]);
    expect(screen.queryByTestId("shelly-ht-setup-latest")).toBeNull();
  });
});

// --- Static safety scans ----------------------------------------------------

const root = resolve(__dirname, "../..");
const cardSrc = readFileSync(
  resolve(root, "src/components/ShellyHtSetupCard.tsx"),
  "utf8",
);
const rulesSrc = readFileSync(
  resolve(root, "src/lib/shellyHtSetupRules.ts"),
  "utf8",
);
const hookSrc = readFileSync(
  resolve(root, "src/hooks/useShellyHtSetupStatus.ts"),
  "utf8",
);
const edgeSrc = readFileSync(
  resolve(root, "supabase/functions/shelly-ht-status/index.ts"),
  "utf8",
);

describe("Shelly H&T setup card — static safety", () => {
  it("no automation, device control, action_queue, alerts, or service_role in client code", () => {
    // Strip block + line comments so descriptive prose ("no alerts…") in
    // file-level docs doesn't trip the scan — only real code is checked.
    const stripComments = (s: string) =>
      s
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const raw of [cardSrc, rulesSrc, hookSrc]) {
      const src = stripComments(raw);
      for (const re of [
        /service_role/i,
        /action[_-]?queue/i,
        /automation/i,
        /device[_-]?control/i,
        /alert_events/i,
        /\balerts\b/i,
        /\.insert\(/,
        /\.update\(/,
        /\.delete\(/,
        /\.upsert\(/,
        /\.rpc\(/,
      ]) {
        expect(src).not.toMatch(re);
      }
    }
  });


  it("rules module has no React, no Supabase imports", () => {
    expect(rulesSrc).not.toMatch(/@\/integrations\/supabase/);
    expect(rulesSrc).not.toMatch(/from\s+["']react["']/);
  });

  it("component does not redefine SOURCE_LABEL or device-label tables", () => {
    expect(cardSrc).not.toMatch(/SOURCE_LABEL\s*[:=]\s*\{/);
    expect(cardSrc).not.toMatch(/const\s+SOURCE_LABEL\s*=/);
    expect(cardSrc).not.toMatch(/Shelly H&T Gen4["']/); // must come from helper
    // Must import the canonical label + source map.
    expect(cardSrc).toMatch(/SHELLY_HT_DEVICE_LABEL/);
    expect(cardSrc).toMatch(/SOURCE_LABEL/);
  });

  it("edge function never logs or returns the raw token", () => {
    // Returns tokenMask (with bullets), never `expected` itself.
    expect(edgeSrc).toMatch(/maskToken/);
    expect(edgeSrc).not.toMatch(/tokenMask:\s*expected\b/);
    expect(edgeSrc).not.toMatch(/console\.(log|warn|error)\([^)]*expected/);
  });

  it("edge function requires Authorization and resolves user server-side", () => {
    expect(edgeSrc).toMatch(/authorization/i);
    expect(edgeSrc).toMatch(/auth\.getUser/);
    // Tent details only returned when owned by caller.
    expect(edgeSrc).toMatch(/tent\.user_id\s*===\s*callerId/);
  });
});
