/**
 * QA 2026-09-24:
 *  - BUG-015: alert cards showed "Reading at 2026-09-24T07:32:45.975+00:00"
 *    and mixed "31.4°C (flower range 20°C–26°C)" with a °F "Why this alert?"
 *    line for a Fahrenheit grower; the manual snapshot review showed
 *    "Captured at 2026-09-24T07:52:26.706Z".
 *  - BUG-018: an RH alert stayed open after an in-range reading with no copy
 *    saying resolution is manual.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AlertReasonText from "@/components/AlertReasonText";
import {
  ALERT_LIST_MANUAL_RESOLUTION_NOTE,
  ALERT_MANUAL_RESOLUTION_NOTE,
  formatAlertReasonForDisplay,
  formatSnapshotCapturedAt,
} from "@/lib/alertReasonDisplayRules";

const STORED =
  "Temperature is above the flower target range. Observed 31.4°C (flower range 20°C–26°C). Reading at 2026-09-24T07:32:45.975+00:00. Recommendation: Improve airflow.";
const fixedFormatter = (d: Date) => `<${d.toISOString()}>`;

describe("formatAlertReasonForDisplay (BUG-015)", () => {
  it("converts Celsius to Fahrenheit and localizes the reading time", () => {
    expect(
      formatAlertReasonForDisplay(STORED, {
        temperatureUnit: "fahrenheit",
        formatTimestamp: fixedFormatter,
      }),
    ).toBe(
      "Temperature is above the flower target range. Observed 88.5°F (flower range 68°F–78.8°F). Reading at <2026-09-24T07:32:45.975Z>. Recommendation: Improve airflow.",
    );
  });

  it("keeps Celsius for a Celsius grower but still localizes the time", () => {
    const out = formatAlertReasonForDisplay(STORED, {
      temperatureUnit: "celsius",
      formatTimestamp: fixedFormatter,
    });
    expect(out).toContain("Observed 31.4°C (flower range 20°C–26°C)");
    expect(out).toContain("Reading at <2026-09-24T07:32:45.975Z>.");
    expect(out).not.toContain("+00:00");
  });

  it("leaves non-temperature and unparseable text alone", () => {
    const rh = "Humidity is above the flower target range. Observed 95% (flower range 40%–55%).";
    expect(formatAlertReasonForDisplay(rh, { temperatureUnit: "fahrenheit" })).toBe(rh);
    expect(formatAlertReasonForDisplay(null, { temperatureUnit: "fahrenheit" })).toBe("");
    expect(formatAlertReasonForDisplay("Observed -2°C.", { temperatureUnit: "fahrenheit" })).toBe(
      "Observed 28.4°F.",
    );
  });

  it("renders the formatted reason through the presenter (default Fahrenheit)", () => {
    render(<AlertReasonText reason={STORED} testId="reason" />);
    const text = screen.getByTestId("reason").textContent ?? "";
    expect(text).toContain("88.5°F");
    expect(text).not.toMatch(/°C|T07:32:45|\+00:00/);
  });

  it("formats the manual snapshot capture time", () => {
    expect(formatSnapshotCapturedAt("2026-09-24T07:52:26.706Z", fixedFormatter)).toBe(
      "<2026-09-24T07:52:26.706Z>",
    );
    expect(formatSnapshotCapturedAt("not a date")).toBe("not a date");
  });

  it("every alert reason surface goes through the presenter", () => {
    // @source-scan-justified: proves the raw `{x.reason}` render is absent at
    // each surface; it is a JSX expression, not a resolvable value.
    const surfaces: Array<[string, RegExp]> = [
      ["src/pages/Alerts.tsx", />\s*\{a\.reason\}/],
      ["src/pages/AlertDetail.tsx", />\s*\{alert\.reason\}/],
      ["src/components/PlantAssignedTentAlertsPanel.tsx", />\s*\{row\.reason\}/],
    ];
    for (const [path, raw] of surfaces) {
      const src = readFileSync(resolve(process.cwd(), path), "utf8");
      expect(src, path).not.toMatch(raw);
      expect(src, path).toMatch(/<AlertReasonText\b/);
    }
  });
});

describe("alerts say resolution is manual (BUG-018)", () => {
  it("states that an in-range reading does not close an alert", () => {
    expect(ALERT_MANUAL_RESOLUTION_NOTE).toMatch(/does not close it automatically/);
    // Shown for every open alert, including ones no reading triggered (for
    // example missing targets), so it names no triggering reading (Codex
    // review on #1683).
    expect(ALERT_MANUAL_RESOLUTION_NOTE).not.toMatch(/reading above|triggered/i);
    expect(ALERT_LIST_MANUAL_RESOLUTION_NOTE).toMatch(/doesn't close them/);
    // @source-scan-justified: the notes render inside heavy page harnesses.
    const detail = readFileSync(resolve(process.cwd(), "src/pages/AlertDetail.tsx"), "utf8");
    expect(detail).toMatch(/\{ALERT_MANUAL_RESOLUTION_NOTE\}/);
    const list = readFileSync(resolve(process.cwd(), "src/pages/Alerts.tsx"), "utf8");
    expect(list).toMatch(/\{ALERT_LIST_MANUAL_RESOLUTION_NOTE\}/);
  });
});
