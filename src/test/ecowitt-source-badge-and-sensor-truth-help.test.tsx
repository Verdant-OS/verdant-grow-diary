/**
 * Tests for sensorSourceLabelRules + SensorSourceBadge vendor support
 * + SensorTruthHelp + static safety.
 *
 * Scope: presentation-only Ecowitt source-badge wiring.
 *  - vendor=ecowitt + source=live → "Ecowitt"
 *  - vendor=ecowitt + source≠live (stale/invalid/manual/csv) → canonical
 *  - unknown / missing source → "Unknown" (never "Live")
 *  - SensorSourceBadge renders Ecowitt label + still surfaces stale/invalid
 *    status; demo never promotes
 *  - SensorTruthHelp renders title/body/captured_at copy
 *  - static safety: no service_role / device-control / automation /
 *    fake-live fallback / *_executed event names / duplicated source maps
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import SensorSourceBadge from "@/components/SensorSourceBadge";
import SensorTruthHelp from "@/components/SensorTruthHelp";
import {
  resolveSensorSourceLabel,
  resolveSensorSourceLabelFromMetadata,
} from "@/lib/sensorSourceLabelRules";

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// sensorSourceLabelRules — pure helper
// ---------------------------------------------------------------------------

describe("sensorSourceLabelRules.resolveSensorSourceLabel", () => {
  it("returns 'Ecowitt' when vendor=ecowitt and source=live", () => {
    const r = resolveSensorSourceLabel({ source: "live", vendor: "ecowitt" });
    expect(r.label).toBe("Ecowitt");
    expect(r.vendor).toBe("ecowitt");
    expect(r.vendorPromoted).toBe(true);
  });

  it("is case-insensitive on vendor", () => {
    const r = resolveSensorSourceLabel({ source: "live", vendor: "ECOWITT" });
    expect(r.label).toBe("Ecowitt");
  });

  it("preserves 'Manual' even when vendor=ecowitt", () => {
    const r = resolveSensorSourceLabel({ source: "manual", vendor: "ecowitt" });
    expect(r.label).toBe("Manual");
    expect(r.vendorPromoted).toBe(false);
  });

  it("preserves 'CSV' for imported source", () => {
    const r = resolveSensorSourceLabel({ source: "csv", vendor: "ecowitt" });
    expect(r.label).toBe("CSV");
    expect(r.vendorPromoted).toBe(false);
  });

  it("marks stale Ecowitt safely — keeps 'Stale' label, does not promote", () => {
    const r = resolveSensorSourceLabel({ source: "stale", vendor: "ecowitt" });
    expect(r.label).toBe("Stale");
    expect(r.vendorPromoted).toBe(false);
    // vendor lineage still recognised so UI can show vendor context nearby
    expect(r.vendor).toBe("ecowitt");
  });

  it("marks invalid Ecowitt safely — keeps 'Invalid' label, does not promote", () => {
    const r = resolveSensorSourceLabel({
      source: "invalid",
      vendor: "ecowitt",
    });
    expect(r.label).toBe("Invalid");
    expect(r.vendorPromoted).toBe(false);
  });

  it("never returns 'Live' for unknown source", () => {
    const r = resolveSensorSourceLabel({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      source: "mystery" as any,
      vendor: "ecowitt",
    });
    expect(r.label).toBe("Unknown");
    expect(r.label).not.toBe("Live");
  });

  it("never returns 'Live' for missing source", () => {
    const r = resolveSensorSourceLabel({ source: null });
    expect(r.label).toBe("Unknown");
    expect(r.label).not.toBe("Live");
  });

  it("returns 'Live' for live source with no vendor", () => {
    const r = resolveSensorSourceLabel({ source: "live" });
    expect(r.label).toBe("Live");
    expect(r.vendorPromoted).toBe(false);
  });

  it("ignores unknown vendor strings (falls back to canonical)", () => {
    const r = resolveSensorSourceLabel({ source: "live", vendor: "acme-x" });
    expect(r.label).toBe("Live");
    expect(r.vendor).toBeNull();
  });

  it("extracts vendor from metadata object", () => {
    const r = resolveSensorSourceLabelFromMetadata("live", {
      vendor: "ecowitt",
      device_family: "ecowitt_custom_upload",
    });
    expect(r.label).toBe("Ecowitt");
  });

  it("handles missing metadata gracefully", () => {
    const r = resolveSensorSourceLabelFromMetadata("live", null);
    expect(r.label).toBe("Live");
  });
});

// ---------------------------------------------------------------------------
// SensorSourceBadge — vendor integration
// ---------------------------------------------------------------------------

function badgeOf(props: React.ComponentProps<typeof SensorSourceBadge>) {
  const { container } = render(<SensorSourceBadge {...props} />);
  const root = container.querySelector(
    '[data-testid="sensor-source-badge"]',
  ) as HTMLElement;
  return {
    text: root.textContent ?? "",
    severity: root.getAttribute("data-severity"),
    source: root.getAttribute("data-source"),
    vendor: root.getAttribute("data-vendor"),
    vendorPromoted: root.getAttribute("data-vendor-promoted") === "true",
    status: root.getAttribute("data-status"),
  };
}

describe("SensorSourceBadge — vendor (Ecowitt) integration", () => {
  it("renders 'Ecowitt' label when vendor=ecowitt and source=live", () => {
    const b = badgeOf({ source: "live", status: "usable", vendor: "ecowitt" });
    expect(b.text).toMatch(/Ecowitt/);
    expect(b.text).not.toMatch(/\bLive\b/);
    expect(b.vendor).toBe("ecowitt");
    expect(b.vendorPromoted).toBe(true);
    // healthy treatment preserved
    expect(b.severity).toBe("ok");
  });

  it("Ecowitt stale snapshot does NOT appear current/live", () => {
    const b = badgeOf({ source: "stale", status: "stale", vendor: "ecowitt" });
    expect(b.severity).toBe("warning");
    expect(b.severity).not.toBe("ok");
    expect(b.text).toMatch(/Stale/);
    expect(b.text).not.toMatch(/\bLive\b/);
    expect(b.vendorPromoted).toBe(false);
  });

  it("Ecowitt invalid snapshot does NOT appear healthy/current", () => {
    const b = badgeOf({
      source: "invalid",
      status: "invalid",
      vendor: "ecowitt",
    });
    expect(b.severity).toBe("danger");
    expect(b.text).toMatch(/Invalid/);
    expect(b.text).not.toMatch(/\bLive\b/);
  });

  it("Manual snapshot still renders 'Manual' even with vendor metadata", () => {
    const b = badgeOf({
      source: "manual",
      status: "usable",
      vendor: "ecowitt",
    });
    expect(b.text).toMatch(/Manual/);
    expect(b.vendorPromoted).toBe(false);
  });

  it("CSV snapshot still renders 'CSV'", () => {
    const b = badgeOf({ source: "csv", status: "usable" });
    expect(b.text).toMatch(/CSV/);
  });

  it("Demo never promotes to Ecowitt even if vendor passed", () => {
    const b = badgeOf({ source: "demo", status: "usable", vendor: "ecowitt" });
    expect(b.text).toMatch(/DEMO/);
    expect(b.text).not.toMatch(/Ecowitt/);
    expect(b.severity).toBe("warning");
  });
});

// ---------------------------------------------------------------------------
// SensorTruthHelp — copy + a11y
// ---------------------------------------------------------------------------

describe("SensorTruthHelp", () => {
  it("renders title 'Sensor truth'", () => {
    const { getByTestId } = render(<SensorTruthHelp />);
    expect(getByTestId("sensor-truth-help-title").textContent).toBe(
      "Sensor truth",
    );
  });

  it("body explains Ecowitt / Manual / CSV / Stale / Unknown", () => {
    const { getByTestId } = render(<SensorTruthHelp />);
    const body = getByTestId("sensor-truth-help-body").textContent ?? "";
    expect(body).toMatch(/Ecowitt/);
    expect(body).toMatch(/Manual/);
    expect(body).toMatch(/CSV/);
    expect(body).toMatch(/Stale/);
    expect(body).toMatch(/Unknown/);
  });

  it("explains captured_at separately from event log time", () => {
    const { getByTestId } = render(<SensorTruthHelp />);
    const cap = getByTestId("sensor-truth-help-captured-at").textContent ?? "";
    expect(cap).toMatch(/captured_at/);
    expect(cap).toMatch(/sensor reading was actually taken/i);
    expect(cap).toMatch(/different from when you logged/i);
  });

  it("uses semantic section with aria-labelledby", () => {
    const { getByTestId } = render(<SensorTruthHelp />);
    const root = getByTestId("sensor-truth-help");
    expect(root.tagName.toLowerCase()).toBe("section");
    expect(root.getAttribute("aria-labelledby")).toBe(
      "sensor-truth-help-title",
    );
  });

  it("does not imply device control or automation", () => {
    const { getByTestId } = render(<SensorTruthHelp />);
    const text = (getByTestId("sensor-truth-help").textContent ?? "")
      .toLowerCase();
    for (const banned of [
      "autopilot",
      "automation",
      "execute",
      "turn on",
      "turn off",
      "control your",
      "service_role",
    ]) {
      expect(text.includes(banned)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Static safety — read source files and assert forbidden patterns absent
// ---------------------------------------------------------------------------

function readSrc(rel: string): string {
  return readFileSync(join(process.cwd(), "src", rel), "utf8");
}

describe("Ecowitt badge + help — static safety", () => {
  const FILES = [
    "lib/sensorSourceLabelRules.ts",
    "components/SensorSourceBadge.tsx",
    "components/SensorTruthHelp.tsx",
  ];

  it.each(FILES)("%s contains no service_role / device-control / automation", (rel) => {
    const src = readSrc(rel).toLowerCase();
    expect(src.includes("service_role")).toBe(false);
    expect(src.includes("autopilot")).toBe(false);
    // *_executed event names
    expect(/[a-z0-9]_executed\b/.test(src)).toBe(false);
    // device-control verbs
    for (const banned of [
      "turn_on_",
      "turn_off_",
      "device_command",
      "execute_device",
    ]) {
      expect(src.includes(banned)).toBe(false);
    }
  });

  it("SensorSourceBadge does not duplicate the source-label table (delegates to helper)", () => {
    const src = readSrc("components/SensorSourceBadge.tsx");
    expect(src).toMatch(/resolveSensorSourceLabel/);
    // No second hard-coded source→label map living in the component.
    expect(src.match(/Record<SensorReadingSource, string>/g) ?? []).toHaveLength(
      0,
    );
  });

  it("does not introduce a fake-live fallback (unknown → Live)", () => {
    const src = readSrc("lib/sensorSourceLabelRules.ts");
    // The unknown branch returns "Unknown", never "Live".
    expect(src).toMatch(/label:\s*"Unknown"/);
    expect(src).not.toMatch(/\?\s*"Live"\s*:/);
  });
});
