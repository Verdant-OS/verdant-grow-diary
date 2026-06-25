import { describe, it, expect } from "vitest";
import {
  buildEcowittIngestValidationViewModel,
  type EcowittIngestValidationRow,
} from "@/lib/ecowittIngestValidationViewModel";

const NOW = new Date("2026-06-07T12:00:00Z");
const TENT = "11111111-2222-3333-4444-555555555555";

function row(
  overrides: Partial<EcowittIngestValidationRow> = {},
): EcowittIngestValidationRow {
  return {
    id: overrides.id ?? "row-1",
    source: overrides.source ?? "ecowitt",
    captured_at: overrides.captured_at ?? "2026-06-07T11:55:00Z",
    ts: overrides.ts ?? "2026-06-07T11:55:00Z",
    metric: overrides.metric ?? "temp_f",
    raw_payload: overrides.raw_payload ?? {
      transport: "mqtt_local_test",
      stationtype: "GW1200",
      test_sender: true,
      invalid_test: false,
      metrics: {
        temp_f: 78.6,
        humidity_pct: 56.2,
        vpd_kpa: 1.46,
        co2_ppm: 966,
        soil_moisture_pct: 45,
      },
      metadata: {
        transport: "mqtt_local_test",
        test_sender: true,
        invalid_test: false,
      },
    },
  };
}

describe("buildEcowittIngestValidationViewModel", () => {
  it("returns 'not_validated' empty state when no rows", () => {
    const vm = buildEcowittIngestValidationViewModel({
      rows: [],
      tentId: TENT,
      now: NOW,
    });
    expect(vm.hasEvidence).toBe(false);
    expect(vm.status).toBe("not_validated");
    expect(vm.statusLabel).toBe("Not validated yet");
    expect(vm.cliHints.map((c) => c.command)).toEqual([
      "bun run dev:send-ecowitt",
      "bun run dev:send-ecowitt:invalid",
    ]);
    expect(vm.liveBadge).toBeNull();
  });

  it("classifies a successful accepted test sender row", () => {
    const vm = buildEcowittIngestValidationViewModel({
      rows: [row()],
      tentId: TENT,
      now: NOW,
    });
    expect(vm.status).toBe("accepted");
    expect(vm.isTestSender).toBe(true);
    expect(vm.invalidTest).toBe(false);
    expect(vm.testSenderBadge?.label).toBe("Local test sender");
    expect(vm.invalidTestBadge).toBeNull();
    expect(vm.liveBadge).toBeNull();
    expect(vm.transportLabel).toBe("mqtt_local_test");
    expect(vm.vendorLabel).toBe("GW1200");
    expect(vm.sourceLabel).toBe("ecowitt");
    const present = Object.fromEntries(
      vm.metricChips.map((c) => [c.key, c.present]),
    );
    expect(present).toEqual({
      temp_f: true,
      humidity_pct: true,
      vpd_kpa: true,
      co2_ppm: true,
      soil_moisture_pct: true,
    });
  });

  it("classifies an invalid_test row as rejected_test (not healthy)", () => {
    const r = row({
      raw_payload: {
        transport: "mqtt_local_test",
        test_sender: true,
        invalid_test: true,
        metadata: { test_sender: true, invalid_test: true },
      },
    });
    const vm = buildEcowittIngestValidationViewModel({
      rows: [r],
      tentId: TENT,
      now: NOW,
    });
    expect(vm.status).toBe("rejected_test");
    expect(vm.invalidTest).toBe(true);
    expect(vm.invalidTestBadge?.label).toBe("Invalid test");
    expect(vm.statusMessage.toLowerCase()).not.toMatch(/healthy/);
  });

  it("classifies stale test evidence", () => {
    const r = row({ captured_at: "2026-06-01T00:00:00Z" });
    const vm = buildEcowittIngestValidationViewModel({
      rows: [r],
      tentId: TENT,
      now: NOW,
    });
    expect(vm.status).toBe("stale");
    expect(vm.stale).toBe(true);
  });

  it("treats ecowitt rows without test_sender flag as no-evidence", () => {
    const r = row({
      raw_payload: { transport: "ecowitt_webhook", stationtype: "GW1200" },
    });
    const vm = buildEcowittIngestValidationViewModel({
      rows: [r],
      tentId: TENT,
      now: NOW,
    });
    expect(vm.hasEvidence).toBe(false);
    expect(vm.status).toBe("not_validated");
  });

  it("never returns a 'live' label for test sender rows", () => {
    const vm = buildEcowittIngestValidationViewModel({
      rows: [row()],
      tentId: TENT,
      now: NOW,
    });
    expect(vm.liveBadge).toBeNull();
    expect(JSON.stringify(vm).toLowerCase()).not.toMatch(/"live"/);
    expect(vm.statusMessage.toLowerCase()).not.toMatch(/\blive sensor\b/);
  });

  it("masks tent id rather than echoing full UUID", () => {
    const vm = buildEcowittIngestValidationViewModel({
      rows: [row()],
      tentId: TENT,
      now: NOW,
    });
    expect(vm.tentScopedLabel).not.toContain(TENT);
    expect(vm.tentScopedLabel).toMatch(/^.{1,4}…\(len=\d+\)$/);
  });

  it("strips secret-y keys from raw payload before exposing evidence", () => {
    const r = row({
      raw_payload: {
        transport: "mqtt_local_test",
        test_sender: true,
        invalid_test: false,
        token: "vbt_supersecrettoken123",
        bridge_token: "vbt_anothersecret",
        authorization: "Bearer eyJabcdefghijklmnopqr",
        metadata: { test_sender: true, invalid_test: false },
      },
    });
    const vm = buildEcowittIngestValidationViewModel({
      rows: [r],
      tentId: TENT,
      now: NOW,
    });
    const serialized = JSON.stringify(vm);
    expect(serialized).not.toMatch(/vbt_supersecrettoken123/);
    expect(serialized).not.toMatch(/vbt_anothersecret/);
    expect(serialized).not.toMatch(/eyJabcdefghijklmnopqr/);
  });

  it("never mentions Action Queue or device control in operator copy", () => {
    const vm = buildEcowittIngestValidationViewModel({
      rows: [row()],
      tentId: TENT,
      now: NOW,
    });
    const allCopy = [
      vm.statusLabel,
      vm.statusMessage,
      ...vm.nextSteps,
      ...vm.cliHints.map((c) => `${c.label} ${c.command}`),
    ]
      .join(" ")
      .toLowerCase();
    expect(allCopy).not.toMatch(/action queue/);
    expect(allCopy).not.toMatch(/device control/);
    expect(allCopy).not.toMatch(/relay|valve|actuator/);
  });
});
