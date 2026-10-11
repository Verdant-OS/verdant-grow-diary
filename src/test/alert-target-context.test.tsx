/**
 * Alert tent/plant target context — derivation + presenter tests.
 *
 * Pins:
 *   - Known tent/plant names render on compact (list) and detailed (detail)
 *   - Missing ids fail closed with explicit unavailable copy (not a blank)
 *   - UUID-shaped names never surface as labels
 *   - Loading ids do not flash unavailable
 *   - Static safety: no writes / service_role / AI / device control
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

import {
  ALERT_TARGET_LOADING_TEXT,
  ALERT_TARGET_NAME_UNAVAILABLE_LABEL,
  ALERT_TARGET_PREFIX,
  ALERT_TARGET_UNAVAILABLE_TEXT,
  deriveAlertTargetContext,
  linkedEvidenceLookupIds,
  resolveAlertTargetIds,
  sanitizeAlertTargetLabel,
} from "@/lib/alertTargetContextRules";
import { AlertTargetContext } from "@/components/AlertTargetContext";
import { buildAlertRowAriaLabel } from "@/lib/alertsRouteView";

describe("sanitizeAlertTargetLabel", () => {
  it("keeps a real tent/plant name", () => {
    expect(sanitizeAlertTargetLabel("One-Tent")).toBe("One-Tent");
  });

  it("rejects blank, whitespace, null, and UUID-shaped labels", () => {
    expect(sanitizeAlertTargetLabel(null)).toBeNull();
    expect(sanitizeAlertTargetLabel("")).toBeNull();
    expect(sanitizeAlertTargetLabel("   ")).toBeNull();
    expect(sanitizeAlertTargetLabel("f3d73a5a-312d-48a0-b953-97481393f2a8")).toBeNull();
  });
});

describe("resolveAlertTargetIds", () => {
  it("prefers alert columns, then linked evidence, then sole tent", () => {
    expect(
      resolveAlertTargetIds({
        tentId: "tent-alert",
        plantId: null,
        linkedEvidence: [{ tentId: "tent-snap", plantId: "plant-snap" }],
        singleTentId: "tent-sole",
      }),
    ).toEqual({
      tentId: "tent-alert",
      plantId: "plant-snap",
      tentSource: "alert",
      plantSource: "linked_evidence",
    });
  });
});

describe("linkedEvidenceLookupIds", () => {
  it("keeps sensor_snapshot and diary_entry ids and drops other types", () => {
    expect(
      linkedEvidenceLookupIds([
        {
          id: "81d0274d-3782-459a-804d-5ffeea475b25",
          type: "sensor_snapshot",
          source: "manual",
        },
        { id: "diary-1", type: "diary_entry", source: "manual" },
        { id: "photo-1", type: "photo", source: "manual" },
      ]),
    ).toEqual(["81d0274d-3782-459a-804d-5ffeea475b25", "diary-1"]);
  });
});

describe("deriveAlertTargetContext", () => {
  it("1. tent + plant names → located compact copy", () => {
    const t = deriveAlertTargetContext({
      tentId: "tent-1",
      plantId: "plant-1",
      tentName: "One-Tent",
      plantName: "Keeper A",
    });
    expect(t.kind).toBe("located");
    expect(t.text).toBe("Tent: One-Tent · Plant: Keeper A");
    expect(t.tentLabel).toBe("One-Tent");
    expect(t.plantLabel).toBe("Keeper A");
  });

  it("2. tent only → located tent copy (VPD environment monitor)", () => {
    const t = deriveAlertTargetContext({
      tentId: "tent-1",
      plantId: null,
      tentName: "One-Tent",
      plantName: null,
    });
    expect(t.kind).toBe("located");
    expect(t.text).toBe("Tent: One-Tent");
    expect(t.text).not.toMatch(/Plant:/);
  });

  it("3. no tent_id and no plant_id → explicit unavailable, never empty", () => {
    const t = deriveAlertTargetContext({
      tentId: null,
      plantId: null,
      tentName: "Should ignore",
      plantName: "Should ignore",
    });
    expect(t.kind).toBe("unavailable");
    expect(t.text).toBe(ALERT_TARGET_UNAVAILABLE_TEXT);
    expect(t.text.length).toBeGreaterThan(0);
    expect(t.tentLabel).toBeNull();
    expect(t.plantLabel).toBeNull();
  });

  it("4. ids without names → per-field Name unavailable (not a silent blank, not a UUID)", () => {
    const t = deriveAlertTargetContext({
      tentId: "f3d73a5a-312d-48a0-b953-97481393f2a8",
      plantId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      tentName: null,
      plantName: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
    expect(t.kind).toBe("names_unavailable");
    expect(t.text).toBe(
      `Tent: ${ALERT_TARGET_NAME_UNAVAILABLE_LABEL} · Plant: ${ALERT_TARGET_NAME_UNAVAILABLE_LABEL}`,
    );
    expect(t.text).not.toContain("f3d73a5a");
    expect(t.text).not.toContain("aaaaaaaa-bbbb");
  });

  it("5. loading with ids and no names yet → loading copy, not unavailable", () => {
    const t = deriveAlertTargetContext({
      tentId: "tent-1",
      plantId: null,
      tentName: null,
      namesLoading: true,
    });
    expect(t.kind).toBe("loading");
    expect(t.text).toBe(ALERT_TARGET_LOADING_TEXT);
  });

  it("6. whitespace ids count as missing", () => {
    const t = deriveAlertTargetContext({ tentId: "  ", plantId: "" });
    expect(t.kind).toBe("unavailable");
    expect(t.text).toBe(ALERT_TARGET_UNAVAILABLE_TEXT);
  });

  it("7. alert tent_id beats linked tent; missing plant_id still fills from snapshot", () => {
    const t = deriveAlertTargetContext({
      tentId: "tent-alert",
      plantId: null,
      tentName: "Alert Tent",
      plantName: "Keeper A",
      linkedEvidence: [{ tentId: "tent-snap", plantId: "plant-snap" }],
    });
    expect(t.kind).toBe("located");
    expect(t.tentId).toBe("tent-alert");
    expect(t.plantId).toBe("plant-snap");
    expect(t.text).toBe("Tent: Alert Tent · Plant: Keeper A");
    expect(t.text).not.toContain("tent-snap");
  });

  it("8. missing ids + linked snapshot tent/plant → located copy, never UUID", () => {
    const t = deriveAlertTargetContext({
      tentId: null,
      plantId: null,
      tentName: "One-Tent",
      plantName: "Keeper A",
      linkedEvidence: [
        {
          tentId: "81d0274d-3782-459a-804d-5ffeea475b25",
          plantId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        },
      ],
    });
    expect(t.kind).toBe("located");
    expect(t.tentId).toBe("81d0274d-3782-459a-804d-5ffeea475b25");
    expect(t.plantId).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(t.text).toBe("Tent: One-Tent · Plant: Keeper A");
    expect(t.text).not.toContain("81d0274d");
    expect(t.text).not.toContain("aaaaaaaa-bbbb");
  });

  it("9. missing ids + no linked evidence → unavailable", () => {
    const t = deriveAlertTargetContext({
      tentId: null,
      plantId: null,
      linkedEvidence: [],
      singleTentId: null,
    });
    expect(t.kind).toBe("unavailable");
    expect(t.text).toBe(ALERT_TARGET_UNAVAILABLE_TEXT);
  });

  it("10. missing ids + conflicting linked tents fail closed (no sole-tent guess)", () => {
    const t = deriveAlertTargetContext({
      tentId: null,
      plantId: null,
      tentName: "Should ignore",
      linkedEvidence: [{ tentId: "tent-a" }, { tentId: "tent-b" }],
      singleTentId: "tent-only",
    });
    expect(t.kind).toBe("unavailable");
    expect(t.text).toBe(ALERT_TARGET_UNAVAILABLE_TEXT);
  });

  it("11. missing ids + sole tent fallback when no linked evidence", () => {
    const t = deriveAlertTargetContext({
      tentId: null,
      plantId: null,
      tentName: "One-Tent",
      singleTentId: "tent-only",
    });
    expect(t.kind).toBe("located");
    expect(t.tentId).toBe("tent-only");
    expect(t.text).toBe("Tent: One-Tent");
  });

  it("12. missing column ids while evidence is loading → loading, not unavailable or sole-tent", () => {
    const t = deriveAlertTargetContext({
      tentId: null,
      plantId: null,
      singleTentId: "tent-only",
      idsLoading: true,
    });
    expect(t.kind).toBe("loading");
    expect(t.text).toBe(ALERT_TARGET_LOADING_TEXT);
    expect(t.tentId).toBeNull();
  });
});

describe("AlertTargetContext presenter", () => {
  it("compact variant shows prefix + tent name", () => {
    render(
      <AlertTargetContext tentId="tent-1" tentName="One-Tent" plantId={null} variant="compact" />,
    );
    const node = screen.getByTestId("alert-target-compact");
    expect(node.getAttribute("data-kind")).toBe("located");
    expect(node.textContent).toContain(ALERT_TARGET_PREFIX);
    expect(node.textContent).toContain("Tent: One-Tent");
  });

  it("compact variant uses linked snapshot tent when alert ids are missing", () => {
    render(
      <AlertTargetContext
        tentId={null}
        plantId={null}
        tentName="One-Tent"
        linkedEvidence={[{ tentId: "tent-1", plantId: null }]}
        variant="compact"
      />,
    );
    const node = screen.getByTestId("alert-target-compact");
    expect(node.getAttribute("data-kind")).toBe("located");
    expect(node.textContent).toContain("Tent: One-Tent");
    expect(node.textContent).not.toContain(ALERT_TARGET_UNAVAILABLE_TEXT);
  });

  it("detailed variant always renders Tent and Plant rows", () => {
    render(
      <MemoryRouter>
        <dl>
          <AlertTargetContext tentId={null} plantId={null} variant="detailed" />
        </dl>
      </MemoryRouter>,
    );
    const root = screen.getByTestId("alert-target-detailed");
    expect(root.getAttribute("data-kind")).toBe("unavailable");
    expect(screen.getByTestId("alert-detail-tent-label").textContent).toBe("Unavailable");
    expect(screen.getByTestId("alert-detail-plant-label").textContent).toBe("Unavailable");
  });

  it("detailed variant links named tent/plant when hrefs are provided", () => {
    render(
      <MemoryRouter>
        <dl>
          <AlertTargetContext
            tentId="tent-1"
            plantId="plant-1"
            tentName="One-Tent"
            plantName="Keeper A"
            tentHref="/tents/tent-1"
            plantHref="/plants/plant-1"
            variant="detailed"
          />
        </dl>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("alert-detail-tent-label").textContent).toBe("One-Tent");
    expect(screen.getByTestId("alert-detail-tent-label").getAttribute("href")).toBe(
      "/tents/tent-1",
    );
    expect(screen.getByTestId("alert-detail-plant-label").textContent).toBe("Keeper A");
    expect(screen.getByTestId("alert-detail-plant-label").getAttribute("href")).toBe(
      "/plants/plant-1",
    );
  });
});

describe("alert row aria includes target text when provided", () => {
  it("appends the target sentence", () => {
    const label = buildAlertRowAriaLabel({
      severity: "warning",
      status: "open",
      title: "VPD above target",
      source: "environment_alerts",
      firstSeenAt: "2026-05-29T10:00:00Z",
      targetText: "Tent: One-Tent",
    });
    expect(label).toContain("VPD above target");
    expect(label).toContain("Tent: One-Tent");
  });

  it("omits target when not provided (existing callers unchanged)", () => {
    const label = buildAlertRowAriaLabel({
      severity: "warning",
      status: "open",
      title: "Humidity rising",
      source: "environment_alerts",
      firstSeenAt: "2026-05-29T10:00:00Z",
    });
    expect(label).not.toContain("Target:");
    expect(label).toMatch(/First seen /);
  });
});

const RULES_SRC = readFileSync(resolve(__dirname, "../lib/alertTargetContextRules.ts"), "utf8");
const HOOK_SRC = readFileSync(resolve(__dirname, "../hooks/useAlertTargetNames.ts"), "utf8");
const EVIDENCE_HOOK_SRC = readFileSync(
  resolve(__dirname, "../hooks/useAlertLinkedTargetEvidence.ts"),
  "utf8",
);
const COMP_SRC = readFileSync(resolve(__dirname, "../components/AlertTargetContext.tsx"), "utf8");
const LIST_SRC = readFileSync(resolve(__dirname, "../pages/Alerts.tsx"), "utf8");
const DETAIL_SRC = readFileSync(resolve(__dirname, "../pages/AlertDetail.tsx"), "utf8");

describe("wiring — list and detail always surface target context", () => {
  it("Alerts list renders AlertTargetContext compact on each card", () => {
    expect(LIST_SRC).toMatch(/<AlertTargetContext[\s\S]*variant=["']compact["']/);
    expect(LIST_SRC).toMatch(/useAlertTargetNames\(/);
    expect(LIST_SRC).toMatch(/useAlertLinkedTargetEvidence\(/);
  });

  it("Alert detail always renders tent/plant rows (no silent omit)", () => {
    expect(DETAIL_SRC).toMatch(/<AlertTargetContext[\s\S]*variant=["']detailed["']/);
    expect(DETAIL_SRC).not.toMatch(/\{alert\.tent_id && \(/);
    expect(DETAIL_SRC).not.toMatch(/\{alert\.plant_id && \(/);
    expect(DETAIL_SRC).toMatch(/tentDetailPath\(targetInput\.tentId\)/);
    expect(DETAIL_SRC).toMatch(/plantDetailPath\(targetInput\.plantId\)/);
  });
});

describe("static safety", () => {
  for (const [name, src] of [
    ["alertTargetContextRules.ts", RULES_SRC],
    ["useAlertTargetNames.ts", HOOK_SRC],
    ["useAlertLinkedTargetEvidence.ts", EVIDENCE_HOOK_SRC],
    ["AlertTargetContext.tsx", COMP_SRC],
  ] as const) {
    it(`${name}: no alert writes / action_queue / service_role / AI / device-control`, () => {
      expect(src).not.toMatch(/action_queue/);
      expect(src).not.toMatch(/service_role/);
      expect(src).not.toMatch(/from\s+["'][^"']*ai[-_]?(doctor|coach)/i);
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/\.insert\s*\(/);
      expect(src).not.toMatch(/\.update\s*\(/);
      expect(src).not.toMatch(/\.delete\s*\(/);
      expect(src).not.toMatch(/\.upsert\s*\(/);
      expect(src).not.toMatch(
        /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b|device_command|autopilot/i,
      );
    });
  }

  it("hook is read-only selects of id,name", () => {
    expect(HOOK_SRC).toMatch(/\.from\(["']tents["']\)\.select\(["']id,name,grow_id["']\)/);
    expect(HOOK_SRC).toMatch(/\.from\(["']plants["']\)\.select\(["']id,name["']\)/);
  });

  it("evidence hook is read-only selects of linked snapshot/diary ids", () => {
    expect(EVIDENCE_HOOK_SRC).toMatch(
      /\.from\(["']sensor_readings["']\)\.select\(["']id,tent_id["']\)/,
    );
    expect(EVIDENCE_HOOK_SRC).toMatch(
      /\.from\(["']diary_entries["']\)\.select\(["']id,tent_id,plant_id["']\)/,
    );
    expect(EVIDENCE_HOOK_SRC).not.toMatch(/raw_payload/);
  });
});
