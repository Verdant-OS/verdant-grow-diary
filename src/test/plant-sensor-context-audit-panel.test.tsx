/**
 * Render + safety tests for PlantSensorContextAuditPanel.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("PlantSensorContextAuditPanel — static safety guard", () => {
  it("does not import Supabase, fetch, RPC, alerts, Action Queue, or model clients", () => {
    const files = [
      path.resolve(
        __dirname,
        "../components/PlantSensorContextAuditPanel.tsx",
      ),
      path.resolve(__dirname, "../lib/plantSensorContextAuditViewModel.ts"),
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
