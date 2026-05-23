import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import {
  classifyGrowDataSource,
} from "@/lib/growDataSourceLabelRules";
import GrowDataSourceBadge from "@/components/GrowDataSourceBadge";
import DashboardDataSourceDisclosure from "@/components/DashboardDataSourceDisclosure";
import GrowDataSourceDisclosure from "@/components/GrowDataSourceDisclosure";

const NOW = new Date("2026-05-23T12:00:00Z").getTime();
const FRESH_TS = new Date(NOW - 60_000).toISOString();

describe("classifyGrowDataSource — Simulated label", () => {
  it("returns Simulated for source='sim'", () => {
    const r = classifyGrowDataSource(
      { source: "sim", value: 22, timestamp: FRESH_TS },
      { now: NOW },
    );
    expect(r.label).toBe("Simulated");
    expect(r.isTrustedForAi).toBe(false);
    expect(r.shouldDisplayBadge).toBe(true);
  });
  it("does NOT map sim to Live", () => {
    const r = classifyGrowDataSource(
      { source: "sim", value: 22, timestamp: FRESH_TS },
      { now: NOW },
    );
    expect(r.label).not.toBe("Live");
  });
  it("preserves Live for sensor source", () => {
    expect(
      classifyGrowDataSource(
        { source: "sensor", value: 22, timestamp: FRESH_TS },
        { now: NOW },
      ).label,
    ).toBe("Live");
  });
  it("preserves Manual for manual source", () => {
    expect(
      classifyGrowDataSource(
        { source: "manual", value: 22, timestamp: FRESH_TS },
        { now: NOW },
      ).label,
    ).toBe("Manual");
  });
  it("preserves Demo for mock source", () => {
    expect(
      classifyGrowDataSource(
        { source: "mock", value: 22, timestamp: FRESH_TS },
        { now: NOW },
      ).label,
    ).toBe("Demo");
  });
  it("preserves Unavailable for missing source+value", () => {
    expect(classifyGrowDataSource(null).label).toBe("Unavailable");
  });
});

describe("GrowDataSourceBadge — Simulated rendering", () => {
  it("renders 'Simulated' label for sim source", () => {
    render(
      <GrowDataSourceBadge
        input={{ source: "sim", value: 22, timestamp: FRESH_TS }}
        options={{ now: NOW }}
      />,
    );
    const badge = screen.getByTestId("grow-data-source-badge");
    expect(badge.getAttribute("data-label")).toBe("Simulated");
    expect(badge.textContent).toBe("Simulated");
  });
});

describe("DashboardDataSourceDisclosure — simulated snapshot notice", () => {
  it("renders simulated notice when snapshotSource='sim'", () => {
    render(
      <DashboardDataSourceDisclosure
        hasAnyData
        metas={[{ dataSource: "supabase", isDemoData: false, sourceReason: "supabase" }]}
        snapshotSource="sim"
      />,
    );
    const notice = screen.getByTestId("dashboard-data-source-simulated-notice");
    expect(notice.textContent?.toLowerCase()).toMatch(/simulated/);
    expect(notice.textContent?.toLowerCase()).toMatch(/test|demo/);
    expect(notice.textContent?.toLowerCase()).toMatch(/not.*real|not used/);
    expect(
      screen.getByTestId("dashboard-data-source-simulated-badge").textContent,
    ).toBe("Simulated");
  });
  it("does NOT render simulated notice for non-sim sources", () => {
    render(
      <DashboardDataSourceDisclosure
        hasAnyData
        metas={[{ dataSource: "supabase", isDemoData: false, sourceReason: "supabase" }]}
        snapshotSource="live"
      />,
    );
    expect(
      screen.queryByTestId("dashboard-data-source-simulated-notice"),
    ).toBeNull();
  });
});

describe("GrowDataSourceDisclosure — simulated snapshot notice", () => {
  it("renders simulated notice when snapshotSource='sim'", () => {
    render(
      <GrowDataSourceDisclosure
        resource="tents"
        hasAnyData
        metas={[{ dataSource: "supabase", isDemoData: false, sourceReason: "supabase" }]}
        snapshotSource="sim"
      />,
    );
    const notice = screen.getByTestId(
      "grow-data-source-disclosure-simulated-notice",
    );
    expect(notice.textContent?.toLowerCase()).toMatch(/simulated/);
    expect(notice.textContent?.toLowerCase()).toMatch(/test|demo/);
  });
  it("does NOT render simulated notice for manual snapshot", () => {
    render(
      <GrowDataSourceDisclosure
        resource="tents"
        hasAnyData
        metas={[{ dataSource: "supabase", isDemoData: false, sourceReason: "supabase" }]}
        snapshotSource="manual"
      />,
    );
    expect(
      screen.queryByTestId("grow-data-source-disclosure-simulated-notice"),
    ).toBeNull();
  });
});

describe("static guardrails — UI never maps sim to live", () => {
  const files = [
    "src/components/GrowDataSourceBadge.tsx",
    "src/components/GrowDataSourceDisclosure.tsx",
    "src/components/DashboardDataSourceDisclosure.tsx",
    "src/lib/growDataSourceLabelRules.ts",
    "src/lib/sensorSnapshot.ts",
    "src/lib/environmentTrends.ts",
  ];
  for (const f of files) {
    const src = readFileSync(resolve(process.cwd(), f), "utf8");
    it(`${f}: no 'sim' → 'live' assignment`, () => {
      // Reject patterns like `source === "sim" ? "live"` or
      // `"sim": "Live"` style fallthroughs.
      expect(src).not.toMatch(/["']sim["']\s*[:?]\s*["']live["']/i);
      expect(src).not.toMatch(/["']sim["']\s*[:?]\s*["']Live["']/);
    });
    it(`${f}: no copy claiming simulated data is trusted/live`, () => {
      const lower = src.toLowerCase();
      expect(lower).not.toMatch(/simulated.{0,40}(is|=).{0,10}live/);
      expect(lower).not.toMatch(/simulated.{0,40}trusted/);
    });
  }
});

describe("static safety — no forbidden surfaces in disclosure UI", () => {
  const files = [
    "src/components/GrowDataSourceBadge.tsx",
    "src/components/GrowDataSourceDisclosure.tsx",
    "src/components/DashboardDataSourceDisclosure.tsx",
  ];
  const forbidden = [
    "service_role",
    "SUPABASE_SERVICE_ROLE_KEY",
    "homeassistant",
    "home_assistant",
    "mqtt",
    "webhook",
    "device_control",
    "automation",
    "action_queue",
    ".rpc(",
    ".insert(",
  ];
  for (const f of files) {
    const src = readFileSync(resolve(process.cwd(), f), "utf8").toLowerCase();
    for (const term of forbidden) {
      it(`${f} does not reference \`${term}\``, () => {
        expect(src).not.toContain(term.toLowerCase());
      });
    }
  }
});
