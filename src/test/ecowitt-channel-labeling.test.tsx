import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";

import {
  buildEcowittChannelLabelingViewModel,
  MULTI_SOIL_MOISTURE_WARNING,
  READ_ONLY_CHANNEL_NOTICE,
} from "@/lib/ecowittChannelLabelingRules";
import { EcowittDetectedChannelsPanel } from "@/components/EcowittDetectedChannelsPanel";

const NOW = new Date("2026-06-08T12:00:00.000Z");
const FRESH = "2026-06-08T11:59:00.000Z";

describe("ecowittChannelLabelingRules — channel detection", () => {
  it("renders soilmoisture1 as channel 1 / soil_moisture_pct", () => {
    const vm = buildEcowittChannelLabelingViewModel(
      { soilmoisture1: 42 },
      { capturedAt: FRESH, now: NOW },
    );
    const group = vm.groups.find((g) => g.family === "soil_moisture");
    expect(group?.canonicalMetric).toBe("soil_moisture_pct");
    expect(group?.channels[0].channel).toBe(1);
    expect(group?.channels[0].canonicalMetric).toBe("soil_moisture_pct");
    expect(group?.channels[0].status).toBe("accepted");
  });

  it("renders soilmoisture9 as channel 9 / soil_moisture_pct", () => {
    const vm = buildEcowittChannelLabelingViewModel(
      { soilmoisture9: 33 },
      { capturedAt: FRESH, now: NOW },
    );
    const ch = vm.groups[0].channels[0];
    expect(ch.channel).toBe(9);
    expect(ch.canonicalMetric).toBe("soil_moisture_pct");
    expect(ch.valueLabel).toBe("33%");
  });

  it("renders soilmoisture16 as channel 16 / soil_moisture_pct", () => {
    const vm = buildEcowittChannelLabelingViewModel(
      { soilmoisture16: 50 },
      { capturedAt: FRESH, now: NOW },
    );
    const ch = vm.groups[0].channels[0];
    expect(ch.channel).toBe(16);
    expect(ch.canonicalMetric).toBe("soil_moisture_pct");
    expect(ch.supported).toBe(true);
  });

  it("sorts channels numerically, not lexically", () => {
    const vm = buildEcowittChannelLabelingViewModel(
      {
        soilmoisture10: 30,
        soilmoisture2: 40,
        soilmoisture1: 50,
        soilmoisture12: 20,
      },
      { capturedAt: FRESH, now: NOW },
    );
    const order = vm.groups[0].channels.map((c) => c.channel);
    expect(order).toEqual([1, 2, 10, 12]);
  });
});

describe("ecowittChannelLabelingRules — status handling", () => {
  it("accepted value shows accepted status and value label", () => {
    const vm = buildEcowittChannelLabelingViewModel(
      { soilmoisture1: 33 },
      { capturedAt: FRESH, now: NOW },
    );
    const ch = vm.groups[0].channels[0];
    expect(ch.status).toBe("accepted");
    expect(ch.valueLabel).toBe("33%");
  });

  it("rejected value shows rejected and does not appear healthy", () => {
    const vm = buildEcowittChannelLabelingViewModel(
      { soilmoisture1: 250 },
      { capturedAt: FRESH, now: NOW },
    );
    const ch = vm.groups[0].channels[0];
    expect(ch.status).toBe("rejected");
    expect(ch.reason).toMatch(/range/i);
  });

  it("stale value shows stale and does not appear live", () => {
    const vm = buildEcowittChannelLabelingViewModel(
      { soilmoisture1: 33 },
      {
        capturedAt: "2026-06-01T00:00:00.000Z",
        now: NOW,
      },
    );
    const ch = vm.groups[0].channels[0];
    expect(ch.status).toBe("stale");
  });

  it("missing value shows missing warning", () => {
    const vm = buildEcowittChannelLabelingViewModel(
      { soilmoisture1: null },
      { capturedAt: FRESH, now: NOW },
    );
    const ch = vm.groups[0].channels[0];
    expect(ch.status).toBe("missing");
  });

  it("non-finite value is invalid", () => {
    const vm = buildEcowittChannelLabelingViewModel(
      { soilmoisture1: "not-a-number" },
      { capturedAt: FRESH, now: NOW },
    );
    const ch = vm.groups[0].channels[0];
    expect(ch.status).toBe("invalid");
  });
});

describe("ecowittChannelLabelingRules — assignments and labels", () => {
  it("unassigned channels show 'Unassigned channel'", () => {
    const vm = buildEcowittChannelLabelingViewModel(
      { soilmoisture1: 33 },
      { capturedAt: FRESH, now: NOW },
    );
    expect(vm.groups[0].channels[0].assignmentLabel).toBe(
      "Unassigned channel",
    );
    expect(vm.groups[0].channels[0].knownLabel).toBeNull();
  });

  it("renders known labels if existing safe label data is supplied", () => {
    const vm = buildEcowittChannelLabelingViewModel(
      { soilmoisture1: 33 },
      {
        capturedAt: FRESH,
        now: NOW,
        knownLabels: { soilmoisture1: "Tent A — Pot 1" },
      },
    );
    expect(vm.groups[0].channels[0].knownLabel).toBe("Tent A — Pot 1");
    expect(vm.groups[0].channels[0].assignmentLabel).toBe("Tent A — Pot 1");
  });

  it("shows multi soil moisture warning when more than one soil channel", () => {
    const vm = buildEcowittChannelLabelingViewModel(
      { soilmoisture1: 33, soilmoisture2: 40 },
      { capturedAt: FRESH, now: NOW },
    );
    const soil = vm.groups.find((g) => g.family === "soil_moisture");
    expect(soil?.multiChannelWarning).toBe(MULTI_SOIL_MOISTURE_WARNING);
    expect(vm.warnings).toContain(MULTI_SOIL_MOISTURE_WARNING);
  });

  it("preserves unsupported raw key but marks unsupported", () => {
    const vm = buildEcowittChannelLabelingViewModel(
      { soilmoisture17: 33 },
      { capturedAt: FRESH, now: NOW },
    );
    expect(vm.unsupported).toHaveLength(1);
    expect(vm.unsupported[0].rawKey).toBe("soilmoisture17");
    expect(vm.unsupported[0].supported).toBe(false);
    expect(vm.unsupported[0].reason).toMatch(/Unsupported/i);
  });

  it("never renders Live for local/test evidence", () => {
    const vm = buildEcowittChannelLabelingViewModel(
      { soilmoisture1: 33 },
      { capturedAt: FRESH, now: NOW, evidenceSource: "test" },
    );
    const ch = vm.groups[0].channels[0];
    // Live label is never produced by this view model.
    expect((ch as unknown as Record<string, unknown>).liveLabel).toBeUndefined();
    expect(ch.status).not.toBe("live" as never);
    expect(ch.status).toBe("accepted");
  });
});

describe("EcowittDetectedChannelsPanel — UI", () => {
  it("shows the read-only notice and no save button", () => {
    render(
      <EcowittDetectedChannelsPanel
        payload={{ soilmoisture1: 33, humidity1: 55, temp1f: 72 }}
        options={{ capturedAt: FRESH, now: NOW }}
      />,
    );
    expect(
      screen.getByTestId("ecowitt-channels-readonly-notice").textContent,
    ).toBe(READ_ONLY_CHANNEL_NOTICE);
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /assign/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /apply/i })).toBeNull();
  });

  it("renders soilmoisture1 row with channel and canonical metric", () => {
    render(
      <EcowittDetectedChannelsPanel
        payload={{ soilmoisture1: 33 }}
        options={{ capturedAt: FRESH, now: NOW }}
      />,
    );
    const row = screen.getByTestId("ecowitt-channel-row-soilmoisture1");
    expect(within(row).getByText(/Channel 1/)).toBeInTheDocument();
    expect(
      screen.getByTestId("ecowitt-channel-value-soilmoisture1").textContent,
    ).toBe("33%");
    const group = screen.getByTestId("ecowitt-channel-group-soil_moisture");
    expect(within(group).getByText(/soil_moisture_pct/)).toBeInTheDocument();
  });
});

describe("safety — no writes / no device control / no fake live", () => {
  const rulesSource = readFileSync(
    path.resolve(__dirname, "../lib/ecowittChannelLabelingRules.ts"),
    "utf8",
  );
  const panelSource = readFileSync(
    path.resolve(__dirname, "../components/EcowittDetectedChannelsPanel.tsx"),
    "utf8",
  );
  const combined = `${rulesSource}\n${panelSource}`;

  it("does not import supabase or invoke edge functions", () => {
    expect(combined).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(combined).not.toMatch(/functions\.invoke/);
    expect(combined).not.toMatch(/service_role/i);
  });

  it("does not write sensor_readings / grow_events / action_queue", () => {
    for (const table of ["sensor_readings", "grow_events", "action_queue"]) {
      expect(combined).not.toMatch(new RegExp(`${table}["'\\s\\.].*insert`, "i"));
      expect(combined).not.toMatch(new RegExp(`${table}["'\\s\\.].*update`, "i"));
      expect(combined).not.toMatch(new RegExp(`${table}["'\\s\\.].*delete`, "i"));
    }
  });

  it("does not contain device-control strings", () => {
    for (const term of [
      "device_command",
      "device.control",
      "turn_on",
      "turn_off",
      "actuate",
      "relay_on",
      "relay_off",
    ]) {
      expect(combined.toLowerCase()).not.toContain(term);
    }
  });

  it("never marks local/test/manual/stale evidence as Live", () => {
    expect(combined).not.toMatch(/['"]live['"]\s*[:=]\s*true/i);
    expect(combined).not.toMatch(/isLive\s*=\s*true/i);
  });
});
