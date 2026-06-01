/**
 * Plant Detail data-source disclosure polish — pure view-model + render
 * coverage + static safety. Presentation-only. No new queries, writes,
 * routing, automation, device control, calendar/notification/email/
 * reminder scheduling, service_role, functions.invoke, or fake-live
 * sensor data.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";

import {
  buildPlantDetailDataSourceView,
  type PlantDetailDataSourceLabel,
} from "@/lib/plantDetailDataSourceView";
import PlantDetailDataSourceDisclosure from "@/components/PlantDetailDataSourceDisclosure";
import type { GrowDataSourceMeta } from "@/hooks/useGrowData";

const ROOT = resolve(__dirname, "../..");
const HELPER = readFileSync(
  resolve(ROOT, "src/lib/plantDetailDataSourceView.ts"),
  "utf8",
);
const COMPONENT = readFileSync(
  resolve(ROOT, "src/components/PlantDetailDataSourceDisclosure.tsx"),
  "utf8",
);
const PAGE = readFileSync(resolve(ROOT, "src/pages/PlantDetail.tsx"), "utf8");

const FORBIDDEN = [
  /autopilot/i,
  /\bauto[-\s]?(execute|run|control)\b/i,
  /service[_-]?role/i,
  /supabase\.from\(/,
  /functions\.invoke\(/,
  /\.rpc\(/,
  /\.insert\(/,
  /\.update\(/,
  /\.delete\(/,
  /\.upsert\(/,
  /calendar_events/,
  /\bnotifications?\b/i,
  /\bsendgrid\b/i,
  /\bpostmark\b/i,
  /\bresend\b/i,
  /\bschedul/i,
  /\breminder/i,
];

const meta = (
  dataSource: GrowDataSourceMeta["dataSource"],
): GrowDataSourceMeta => ({
  isDemoData: dataSource === "mock" || dataSource === "mixed",
  dataSource,
  sourceReason: "test",
});

describe("buildPlantDetailDataSourceView · label resolution", () => {
  it("returns Live with helpful copy when snapshot is live and record store is real", () => {
    const v = buildPlantDetailDataSourceView({
      recordSource: "supabase",
      snapshotSource: "live",
    });
    expect(v.label).toBe("Live");
    expect(v.badgeText).toBe("Live");
    expect(v.description.toLowerCase()).toMatch(/live/);
    expect(v.helpBody.toLowerCase()).toMatch(/live sensor/);
  });

  it("never returns Live when record store is mock, even if snapshot says live", () => {
    const v = buildPlantDetailDataSourceView({
      recordSource: "mock",
      snapshotSource: "live",
    });
    expect(v.label).not.toBe("Live");
    expect(v.label).toBe("Demo");
  });

  it("returns Manual when snapshot is manual and not stale", () => {
    const v = buildPlantDetailDataSourceView({
      recordSource: "supabase",
      snapshotSource: "manual",
    });
    expect(v.label).toBe("Manual");
    expect(v.description.toLowerCase()).toMatch(/entered by/);
  });

  it("treats diary snapshot as Manual", () => {
    const v = buildPlantDetailDataSourceView({
      recordSource: "supabase",
      snapshotSource: "diary",
    });
    expect(v.label).toBe("Manual");
  });

  it("returns Demo with explicit 'not live tent data' helper copy", () => {
    const v = buildPlantDetailDataSourceView({
      recordSource: "mock",
    });
    expect(v.label).toBe("Demo");
    expect(v.description.toLowerCase()).toMatch(/not live tent data/);
    expect(v.helpBody.toLowerCase()).toMatch(/not live tent data/);
  });

  it("returns Demo for simulated snapshot source regardless of record store", () => {
    const v = buildPlantDetailDataSourceView({
      recordSource: "supabase",
      snapshotSource: "sim",
    });
    expect(v.label).toBe("Demo");
  });

  it("returns Demo for mixed record store (blends contain demo data)", () => {
    const v = buildPlantDetailDataSourceView({ recordSource: "mixed" });
    expect(v.label).toBe("Demo");
  });

  it("returns Stale (not Live) when snapshot is live but caller marks isStale", () => {
    const v = buildPlantDetailDataSourceView({
      recordSource: "supabase",
      snapshotSource: "live",
      isStale: true,
    });
    expect(v.label).toBe("Stale");
    expect(v.description.toLowerCase()).toMatch(/outdated|older/);
  });

  it("returns Stale for manual snapshot when caller marks isStale", () => {
    const v = buildPlantDetailDataSourceView({
      recordSource: "supabase",
      snapshotSource: "manual",
      isStale: true,
    });
    expect(v.label).toBe("Stale");
  });

  it("returns Unavailable when no record source and no snapshot source", () => {
    const v = buildPlantDetailDataSourceView({ recordSource: "unavailable" });
    expect(v.label).toBe("Unavailable");
    expect(v.description.toLowerCase()).toMatch(/no current sensor/);
  });

  it("returns Unavailable when snapshot is explicitly unavailable", () => {
    const v = buildPlantDetailDataSourceView({
      recordSource: "unavailable",
      snapshotSource: "unavailable",
    });
    expect(v.label).toBe("Unavailable");
  });

  it("does not label unknown/demo/manual data as Live", () => {
    const unknownLabels: PlantDetailDataSourceLabel[] = (
      [
        buildPlantDetailDataSourceView({ recordSource: "mock" }).label,
        buildPlantDetailDataSourceView({ recordSource: "unavailable" }).label,
        buildPlantDetailDataSourceView({
          recordSource: "supabase",
          snapshotSource: "manual",
        }).label,
        buildPlantDetailDataSourceView({
          recordSource: "supabase",
          snapshotSource: "sim",
        }).label,
        buildPlantDetailDataSourceView({
          recordSource: "supabase",
          snapshotSource: "diary",
        }).label,
      ] as PlantDetailDataSourceLabel[]
    );
    for (const l of unknownLabels) {
      expect(l).not.toBe("Live");
    }
  });
});

describe("PlantDetailDataSourceDisclosure · render", () => {
  it("renders Live label and helper copy when snapshot is live", () => {
    render(
      <PlantDetailDataSourceDisclosure
        metas={[meta("supabase"), meta("supabase")]}
        snapshotSource="live"
      />,
    );
    const badge = screen.getByTestId(
      "plant-detail-data-source-disclosure-badge",
    );
    expect(badge.getAttribute("data-label")).toBe("Live");
    expect(
      screen.getByTestId("plant-detail-data-source-disclosure-description")
        .textContent ?? "",
    ).toMatch(/live/i);
  });

  it("renders Manual label and helper copy when snapshot is manual", () => {
    render(
      <PlantDetailDataSourceDisclosure
        metas={[meta("supabase")]}
        snapshotSource="manual"
      />,
    );
    expect(
      screen
        .getByTestId("plant-detail-data-source-disclosure-badge")
        .getAttribute("data-label"),
    ).toBe("Manual");
    expect(
      screen.getByTestId("plant-detail-data-source-disclosure-description")
        .textContent ?? "",
    ).toMatch(/entered by/i);
  });

  it("renders Demo label and explicitly says not live tent data", () => {
    render(
      <PlantDetailDataSourceDisclosure metas={[meta("mock")]} />,
    );
    expect(
      screen
        .getByTestId("plant-detail-data-source-disclosure-badge")
        .getAttribute("data-label"),
    ).toBe("Demo");
    expect(
      screen.getByTestId("plant-detail-data-source-disclosure-description")
        .textContent ?? "",
    ).toMatch(/not live tent data/i);
  });

  it("renders Stale label and outdated-reading helper copy", () => {
    render(
      <PlantDetailDataSourceDisclosure
        metas={[meta("supabase")]}
        snapshotSource="live"
        isStale
      />,
    );
    expect(
      screen
        .getByTestId("plant-detail-data-source-disclosure-badge")
        .getAttribute("data-label"),
    ).toBe("Stale");
    expect(
      screen.getByTestId("plant-detail-data-source-disclosure-description")
        .textContent ?? "",
    ).toMatch(/outdated|older/i);
  });

  it("renders Unavailable label when no source/status exists", () => {
    render(
      <PlantDetailDataSourceDisclosure metas={[meta("unavailable")]} />,
    );
    expect(
      screen
        .getByTestId("plant-detail-data-source-disclosure-badge")
        .getAttribute("data-label"),
    ).toBe("Unavailable");
    expect(
      screen.getByTestId("plant-detail-data-source-disclosure-description")
        .textContent ?? "",
    ).toMatch(/no current sensor/i);
  });

  it("never labels demo/mock data as Live in rendered output", () => {
    render(
      <PlantDetailDataSourceDisclosure
        metas={[meta("mock")]}
        snapshotSource="live"
      />,
    );
    expect(
      screen
        .getByTestId("plant-detail-data-source-disclosure-badge")
        .getAttribute("data-label"),
    ).not.toBe("Live");
  });
});

describe("PlantDetailDataSourceDisclosure · static safety", () => {
  it("view-model contains no React, fetch, writes, RPC, or supabase calls", () => {
    for (const re of FORBIDDEN) {
      expect(HELPER, `forbidden token in helper: ${re}`).not.toMatch(re);
    }
    expect(HELPER).not.toMatch(/from\s+["']react["']/);
    expect(HELPER).not.toMatch(/fetch\(/);
  });

  it("component contains no writes, RPC, or supabase access", () => {
    for (const re of FORBIDDEN) {
      expect(COMPONENT, `forbidden token in component: ${re}`).not.toMatch(re);
    }
    expect(COMPONENT).not.toMatch(/supabase\./);
  });

  it("does not leak ids, tokens, raw payloads, or provenance markers in copy", () => {
    const labels: PlantDetailDataSourceLabel[] = [
      "Live",
      "Manual",
      "Demo",
      "Stale",
      "Unavailable",
    ];
    for (const recordSource of [
      "supabase",
      "mock",
      "mixed",
      "unavailable",
    ] as const) {
      for (const snapshotSource of [
        null,
        "live",
        "manual",
        "diary",
        "sim",
        "unavailable",
      ] as const) {
        const v = buildPlantDetailDataSourceView({
          recordSource,
          snapshotSource: snapshotSource ?? undefined,
        });
        expect(labels).toContain(v.label);
        const all = `${v.badgeText} ${v.description} ${v.helpTitle} ${v.helpBody}`;
        expect(all).not.toMatch(
          /token|secret|raw payload|provenance|user[_-]?id|[0-9a-f]{8}-[0-9a-f]{4}/i,
        );
      }
    }
  });

  it("Plant Detail page mounts the polished disclosure", () => {
    expect(PAGE).toMatch(
      /import\s+PlantDetailDataSourceDisclosure\s+from\s+"@\/components\/PlantDetailDataSourceDisclosure"/,
    );
    expect(PAGE).toMatch(/<PlantDetailDataSourceDisclosure\b/);
  });
});
