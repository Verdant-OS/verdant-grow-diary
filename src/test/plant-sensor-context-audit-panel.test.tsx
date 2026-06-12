/**
 * Render + safety tests for PlantSensorContextAuditPanel.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import PlantSensorContextAuditPanel from "@/components/PlantSensorContextAuditPanel";
import type { ManualSensorLog } from "@/lib/manualSensorChronologyDeltaRules";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      throw new Error("Supabase access not allowed in audit panel test");
    },
  },
}));

const NOW = new Date("2026-06-12T12:00:00Z");
const HOUR = 3_600_000;
const ago = (h: number) => new Date(NOW.getTime() - h * HOUR).toISOString();

describe("PlantSensorContextAuditPanel", () => {
  it("renders missing-state copy when no logs are passed", () => {
    render(<PlantSensorContextAuditPanel logs={[]} now={NOW} />);
    expect(
      screen.getByTestId("plant-sensor-context-audit-message").textContent,
    ).toMatch(/No plant-level manual sensor snapshots/);
    expect(
      screen.getByTestId("plant-sensor-context-audit-status").textContent,
    ).toMatch(/Missing/);
  });

  it("renders stale-state copy when latest snapshot is older than 72h", () => {
    const logs: ManualSensorLog[] = [
      {
        capturedAt: ago(80),
        source: "manual",
        metrics: { temp_f: 72, ph: 6.2 },
      } as ManualSensorLog,
    ];
    render(<PlantSensorContextAuditPanel logs={logs} now={NOW} />);
    expect(
      screen.getByTestId("plant-sensor-context-audit-message").textContent,
    ).toMatch(/stale/i);
    expect(
      screen.getByTestId("plant-sensor-context-audit-status").textContent,
    ).toMatch(/Stale/);
  });

  it("renders available metric labels", () => {
    const logs: ManualSensorLog[] = [
      {
        capturedAt: ago(2),
        source: "manual",
        metrics: { temp_f: 72, humidity_percent: 55, ph: 6.2, ec: 1.4 },
      } as ManualSensorLog,
    ];
    render(<PlantSensorContextAuditPanel logs={logs} now={NOW} />);
    const container = screen.getByTestId(
      "plant-sensor-context-audit-metrics",
    );
    expect(container.textContent).toMatch(/Temperature/);
    expect(container.textContent).toMatch(/Humidity/);
    expect(container.textContent).toMatch(/pH/);
    expect(container.textContent).toMatch(/EC/);
  });
});

const ID = {
  plantId: "p1",
  plantName: "Plant A",
  growId: "g1",
  tentId: "t1",
  tentName: "Tent A",
};

describe("PlantSensorContextAuditPanel — Quick Log sensor snapshot CTA", () => {
  it("missing status renders 'Add manual sensor snapshot' CTA", () => {
    const onOpen = vi.fn();
    render(
      <PlantSensorContextAuditPanel
        logs={[]}
        now={NOW}
        identity={ID}
        onOpenManualSensorEntry={onOpen}
      />,
    );
    expect(
      screen.getByTestId("plant-sensor-context-audit-cta-button").textContent,
    ).toMatch(/Add manual sensor snapshot/);
  });

  it("stale status renders 'Add fresh sensor snapshot' CTA", () => {
    const logs: ManualSensorLog[] = [
      {
        capturedAt: ago(96),
        source: "manual",
        metrics: { temp_f: 72 },
      } as ManualSensorLog,
    ];
    const onOpen = vi.fn();
    render(
      <PlantSensorContextAuditPanel
        logs={logs}
        now={NOW}
        identity={ID}
        onOpenManualSensorEntry={onOpen}
      />,
    );
    expect(
      screen.getByTestId("plant-sensor-context-audit-cta-button").textContent,
    ).toMatch(/Add fresh sensor snapshot/);
  });

  it("strong status does not render a CTA", () => {
    const logs: ManualSensorLog[] = [
      {
        capturedAt: ago(1),
        source: "manual",
        metrics: { temp_f: 72, humidity_percent: 55, ph: 6.2 },
      } as ManualSensorLog,
    ];
    render(
      <PlantSensorContextAuditPanel
        logs={logs}
        now={NOW}
        identity={ID}
        onOpenManualSensorEntry={() => {}}
      />,
    );
    expect(
      screen.queryByTestId("plant-sensor-context-audit-cta"),
    ).toBeNull();
    expect(
      screen.queryByTestId("plant-sensor-context-audit-cta-inert"),
    ).toBeNull();
  });

  it("limited status does not render a CTA", () => {
    const logs: ManualSensorLog[] = [
      {
        capturedAt: ago(1),
        source: "manual",
        metrics: { co2_ppm: 800 },
      } as ManualSensorLog,
    ];
    render(
      <PlantSensorContextAuditPanel
        logs={logs}
        now={NOW}
        identity={ID}
        onOpenManualSensorEntry={() => {}}
      />,
    );
    expect(
      screen.queryByTestId("plant-sensor-context-audit-cta"),
    ).toBeNull();
  });

  it("clicking CTA calls handler with identity-only manual prefill (no sensor values)", () => {
    const onOpen = vi.fn();
    render(
      <PlantSensorContextAuditPanel
        logs={[]}
        now={NOW}
        identity={ID}
        onOpenManualSensorEntry={onOpen}
      />,
    );
    fireEvent.click(
      screen.getByTestId("plant-sensor-context-audit-cta-button"),
    );
    expect(onOpen).toHaveBeenCalledTimes(1);
    const payload = onOpen.mock.calls[0][0];
    expect(payload).toMatchObject({
      plantId: "p1",
      growId: "g1",
      tentId: "t1",
      source: "manual",
    });
    const json = JSON.stringify(payload);
    expect(json).not.toMatch(/temp|humidity|ec|ph|vpd|co2|moisture/i);
  });

  it("renders inert fallback when no handler is provided", () => {
    render(
      <PlantSensorContextAuditPanel logs={[]} now={NOW} identity={ID} />,
    );
    expect(
      screen.getByTestId("plant-sensor-context-audit-cta-inert").textContent,
    ).toMatch(/not wired here yet/);
    expect(
      screen.queryByTestId("plant-sensor-context-audit-cta-button"),
    ).toBeNull();
  });

  it("renders inert fallback when identity context is incomplete", () => {
    render(
      <PlantSensorContextAuditPanel
        logs={[]}
        now={NOW}
        identity={{ plantId: "p1", growId: null, tentId: null }}
        onOpenManualSensorEntry={() => {}}
      />,
    );
    expect(
      screen.queryByTestId("plant-sensor-context-audit-cta-inert"),
    ).not.toBeNull();
  });
});

describe("PlantSensorContextAuditPanel — static safety guard", () => {
  it("does not import Supabase, fetch, RPC, alerts, Action Queue, or model clients", () => {
    const files = [
      path.resolve(
        __dirname,
        "../components/PlantSensorContextAuditPanel.tsx",
      ),
      path.resolve(__dirname, "../lib/plantSensorContextAuditViewModel.ts"),
      path.resolve(
        __dirname,
        "../lib/plantSensorContextAuditCtaViewModel.ts",
      ),
    ];
    const forbidden = [
      /@\/integrations\/supabase/,
      /\bfunctions\.invoke\b/,
      /\bsupabase\./,
      /\bfetch\(/,
      /useQuickLogV2Save/,
      /action_queue/,
      /useAlerts/,
      /\bopenai\b/i,
      /\.insert\(/,
      /\.update\(/,
      /\.delete\(/,
      /\brpc\(/,
    ];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      for (const re of forbidden) {
        expect(re.test(src), `${path.basename(f)} contains ${re}`).toBe(false);
      }
    }
  });
});
