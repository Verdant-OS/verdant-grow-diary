/**
 * Tests for the PR B2 "Export this grow as a PDF report" slice.
 *
 * Covers:
 *  - Sanitized report model builder
 *  - Provenance labels + healthy vs. non-healthy source treatment
 *  - Secret / token / raw payload redaction
 *  - Missing photo / sensor / reflection handling
 *  - Deterministic filename slugging
 *  - Presenter renders the export button and calls the helper
 *  - No AI / Action Queue / device-control / Edge imports leak in
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildPdfExportFilename,
  buildPdfExportTitle,
  buildProvenanceBadgeRows,
  isoDateOnly,
  isReportSensorSourceHealthy,
  normalizeReportSensorSource,
  POST_GROW_SENSOR_EMPTY_STATE_COPY,
  POST_GROW_SENSOR_PROVENANCE_LEGEND,
  POST_GROW_SENSOR_PROVENANCE_LEGEND_TITLE,
  POST_GROW_SENSOR_PROVENANCE_REVIEW_NOTE,
  provenanceBadgeAriaLabel,
  redactSecrets,
  slugifyGrowName,
} from "@/lib/postGrowReportRules";
import { buildPostGrowReportPdfModel } from "@/lib/postGrowReportViewModel";
import {
  buildPostGrowReportPdfHtml,
  exportPostGrowReportAsPdf,
} from "@/lib/postGrowPdfExport";
import type { PostGrowLearningReportViewModel } from "@/lib/postGrowLearningReportRules";
import {
  EnvironmentStabilityCard,
  ExportSummaryButtons,
} from "@/components/PostGrowLearningReportCards";
import SensorProvenanceLegend from "@/components/SensorProvenanceLegend";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function baseVm(
  overrides: Partial<PostGrowLearningReportViewModel> = {},
): PostGrowLearningReportViewModel {
  return {
    eligible: true,
    ineligibleReason: null,
    header: {
      growId: "grow_internal_abc123",
      growName: "Blue Dream #1",
      stageLabel: "Harvest",
      archived: true,
      startedAt: "2026-01-01T00:00:00.000Z",
      harvestedAt: "2026-03-01T00:00:00.000Z",
      yieldGrams: 128.5,
    },
    executiveSummary: ["Run completed with stable VPD."],
    dataCompleteness: { score: 78, label: "Useful", present: ["diary"], missing: ["photos"] },
    environment: [
      {
        key: "temperature_c",
        label: "Temperature",
        unit: "°C",
        count: 240,
        avg: 24.1,
        min: 20.3,
        max: 28.2,
        stablePct: 82,
        sparkline: [],
      },
      {
        key: "humidity_pct",
        label: "Humidity",
        unit: "%",
        count: 240,
        avg: 55,
        min: 40,
        max: 70,
        stablePct: 30,
        sparkline: [],
      },
      {
        key: "vpd_kpa",
        label: "VPD",
        unit: "kPa",
        count: 0,
        avg: null,
        min: null,
        max: null,
        stablePct: null,
        sparkline: [],
      },
    ],
    postHarvest: { yieldGrams: 128.5, points: [], weightLossPct: 12.3, rhStabilized: true },
    actionEffectiveness: { completedActions: 2, outcomeNotes: 1, observations: ["Good response."] },
    lesson: { entryId: null, text: "Water less next run." },
    photos: [],
    ...overrides,
  };
}

const NOW = new Date("2026-04-15T10:00:00.000Z");

describe("postGrowReportRules — filename + sanitization", () => {
  it("slugifies grow name deterministically", () => {
    expect(slugifyGrowName("Blue Dream #1!! ")).toBe("blue-dream-1");
    expect(slugifyGrowName("   ")).toBe("grow");
    expect(slugifyGrowName(null)).toBe("grow");
    expect(slugifyGrowName("Sour/Diesel  v2")).toBe("sour-diesel-v2");
  });

  it("builds deterministic lowercase filename with no unsafe characters", () => {
    const filename = buildPdfExportFilename("Blue Dream #1", NOW);
    expect(filename).toBe("verdant-post-grow-report-blue-dream-1-2026-04-15.pdf");
    expect(filename).toMatch(/^[a-z0-9.\-]+$/);
  });

  it("builds a deterministic title", () => {
    expect(buildPdfExportTitle("Blue Dream", NOW)).toBe(
      "Verdant — Post-Grow Report — Blue Dream — 2026-04-15",
    );
  });

  it("returns unknown for invalid dates", () => {
    expect(isoDateOnly(new Date("not-a-date"))).toBe("unknown");
  });

  it("redacts JWTs, sk_/pk_ keys, bearer tokens, service_role, long hex", () => {
    const text =
      "token=eyJabcdefghij.klmnopqrstu.vwxyz1234567 sk_live_ABCDEFGH bearer abcdef1234 service_role ffeeddccbbaa998877665544332211aa";
    const out = redactSecrets(text);
    expect(out).not.toMatch(/eyJabc/);
    expect(out).not.toMatch(/sk_live_/);
    expect(out.toLowerCase()).not.toContain("service_role");
    expect(out).not.toMatch(/ffeeddccbbaa/);
    expect(out).toMatch(/\[redacted\]/);
  });

  it("normalizes and classifies sensor sources", () => {
    expect(normalizeReportSensorSource("LIVE")).toBe("live");
    expect(normalizeReportSensorSource("bogus")).toBe("invalid");
    expect(normalizeReportSensorSource(null)).toBe("invalid");
    expect(isReportSensorSourceHealthy("stale")).toBe(false);
    expect(isReportSensorSourceHealthy("demo")).toBe(false);
    expect(isReportSensorSourceHealthy("invalid")).toBe(false);
    expect(isReportSensorSourceHealthy("live")).toBe(true);
  });
});

describe("postGrowReportViewModel — sanitized model builder", () => {
  it("builds a model with provenance rows and never treats stale/demo/invalid as healthy", () => {
    const model = buildPostGrowReportPdfModel(baseVm(), {
      now: NOW,
      sensorReadingSources: [
        { source: "live" },
        { source: "live" },
        { source: "manual" },
        { source: "stale" },
        { source: "demo" },
        { source: "bogus" },
        { source: null },
      ],
    });
    expect(model.sensorSources.find((r) => r.kind === "live")?.healthy).toBe(true);
    expect(model.sensorSources.find((r) => r.kind === "stale")?.healthy).toBe(false);
    expect(model.sensorSources.find((r) => r.kind === "demo")?.healthy).toBe(false);
    // both "bogus" and null coalesce into "invalid"
    expect(model.sensorSources.find((r) => r.kind === "invalid")?.count).toBe(2);
  });

  it("handles missing photos / sensors / reflection notes without crashing", () => {
    const model = buildPostGrowReportPdfModel(
      baseVm({
        photos: [],
        environment: [],
        lesson: { entryId: null, text: "" },
        executiveSummary: [],
      }),
      { now: NOW },
    );
    expect(model.photoCountText).toMatch(/no photos/i);
    expect(model.environment).toEqual([]);
    expect(model.lessonText).toMatch(/not enough evidence/i);
    expect(model.executiveSummary).toEqual([]);
  });

  it("redacts secrets in lesson, summary, and observations", () => {
    const model = buildPostGrowReportPdfModel(
      baseVm({
        executiveSummary: ["contains sk_live_ABCDEFGHij"],
        actionEffectiveness: {
          completedActions: 0,
          outcomeNotes: 0,
          observations: ["bearer abcdef1234"],
        },
        lesson: { entryId: null, text: "service_role leak" },
      }),
      { now: NOW },
    );
    expect(model.executiveSummary[0]).not.toMatch(/sk_live_/);
    expect(model.actionsSummary.some((s) => /bearer\s+abcdef/.test(s))).toBe(false);
    expect(model.lessonText.toLowerCase()).not.toContain("service_role");
  });

  it("excludes internal ids from user-facing fields", () => {
    const html = buildPostGrowReportPdfHtml(
      buildPostGrowReportPdfModel(baseVm(), { now: NOW }),
    );
    expect(html).not.toContain("grow_internal_abc123");
  });

  it("classifies improved vs. declined from stability %", () => {
    const model = buildPostGrowReportPdfModel(baseVm(), { now: NOW });
    expect(model.improvedText).toMatch(/Temperature/);
    expect(model.declinedText).toMatch(/Humidity/);
  });
});

describe("postGrowPdfExport — export orchestration", () => {
  it("returns 'unavailable' when no window is provided", () => {
    const result = exportPostGrowReportAsPdf(baseVm(), { win: null, now: NOW });
    expect(result).toBe("unavailable");
  });

  it("opens a popup, writes html, sets title, and calls print", () => {
    const write = vi.fn();
    const close = vi.fn();
    const focus = vi.fn();
    const print = vi.fn();
    const popup = {
      document: { write, close, title: "" } as unknown as Document,
      focus,
      print,
    };
    const win = { open: vi.fn(() => popup) } as unknown as Window;

    const result = exportPostGrowReportAsPdf(baseVm(), { win, now: NOW });

    expect(result).toBe("printed");
    expect(win.open).toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
    const html = write.mock.calls[0][0] as string;
    expect(html).toContain("Verdant — Post-Grow Report");
    expect(html).toContain("Blue Dream");
    expect(popup.document.title).toContain("2026-04-15");
    expect(print).toHaveBeenCalledOnce();
  });

  it("returns 'unavailable' when popup blocker returns null", () => {
    const win = { open: vi.fn(() => null) } as unknown as Window;
    expect(exportPostGrowReportAsPdf(baseVm(), { win, now: NOW })).toBe("unavailable");
  });
});

describe("PDF sensor provenance legend", () => {
  function htmlFor(vm: PostGrowLearningReportViewModel): string {
    return buildPostGrowReportPdfHtml(buildPostGrowReportPdfModel(vm, { now: NOW }));
  }

  const LEGEND: Array<[string, RegExp]> = [
    ["Live", /Connected sensor or bridge reading captured from a real source\./],
    ["Manual", /Reading entered by the grower\./],
    ["CSV", /Reading imported from a CSV or spreadsheet source\./],
    ["Demo", /Sample\/demo data; not real grow-room telemetry\./],
    ["Stale", /Old reading that should not be treated as current\./],
    ["Invalid", /Bad, suspicious, or unusable telemetry\./],
  ];

  it("includes the legend section title", () => {
    expect(htmlFor(baseVm())).toContain("Sensor provenance legend");
  });

  it.each(LEGEND)("includes '%s' label with its grower-facing description", (label, descRe) => {
    const html = htmlFor(baseVm());
    expect(html).toContain(`>${label}<`);
    expect(html).toMatch(descRe);
  });

  it("renders the legend even when the report has no sensor rows", () => {
    const html = htmlFor(baseVm({ environment: [] }));
    expect(html).toContain("Sensor provenance legend");
    for (const [label] of LEGEND) expect(html).toContain(`>${label}<`);
  });

  it("does not describe demo, stale, or invalid as live, current, or healthy", () => {
    const html = htmlFor(baseVm()).toLowerCase();
    const forbidden = ["demo is live", "stale is live", "invalid is live",
      "demo is current", "stale is current", "invalid is current",
      "demo is healthy", "stale is healthy", "invalid is healthy"];
    for (const phrase of forbidden) expect(html).not.toContain(phrase);
    // sanity: legend text itself never claims these are healthy.
    expect(html).toMatch(/should not be treated as current/);
    expect(html).toMatch(/not real grow-room telemetry/);
  });
});

describe("ExportSummaryButtons — presenter integration", () => {
  it("renders the Export as PDF report button and invokes the helper", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    render(
      <MemoryRouter>
        <ExportSummaryButtons vm={baseVm()} />
      </MemoryRouter>,
    );
    const btn = screen.getByTestId("post-grow-export-pdf");
    expect(btn.textContent).toMatch(/export this grow as a pdf report/i);
    fireEvent.click(btn);
    expect(openSpy).toHaveBeenCalled();
    openSpy.mockRestore();
  });
});

describe("static safety — no forbidden imports in PDF export code", () => {
  const files = [
    "src/lib/postGrowReportRules.ts",
    "src/lib/postGrowReportViewModel.ts",
    "src/lib/postGrowPdfExport.ts",
  ];
  // Check imports and function calls, not comment prose.
  const forbiddenImportRes: RegExp[] = [
    /from ["'][^"']*supabase[^"']*["']/i,
    /from ["'][^"']*ai-doctor[^"']*["']/i,
    /from ["'][^"']*ai-coach[^"']*["']/i,
    /from ["'][^"']*actionQueue[^"']*["']/i,
    /from ["'][^"']*webhook[^"']*["']/i,
    /from ["'][^"']*device[^"']*["']/i,
    /\.functions\.invoke\(/,
    /supabase\./,
    /service_role\s*[:=]/,
    /raw_payload\s*[:=]/,
  ];

  it.each(files)("%s contains no forbidden imports or calls", (path) => {
    const text = readFileSync(resolve(process.cwd(), path), "utf8");
    for (const re of forbiddenImportRes) {
      expect(re.test(text), `${path} matched ${re}`).toBe(false);
    }
  });
});

describe("PDF provenance review note", () => {
  function html(): string {
    return buildPostGrowReportPdfHtml(buildPostGrowReportPdfModel(baseVm(), { now: NOW }));
  }

  it("includes the manual-review note under the legend", () => {
    expect(html()).toContain(POST_GROW_SENSOR_PROVENANCE_REVIEW_NOTE);
    expect(html()).toContain('data-testid="post-grow-pdf-provenance-review-note"');
  });

  it("names demo, stale, and invalid explicitly", () => {
    const note = POST_GROW_SENSOR_PROVENANCE_REVIEW_NOTE.toLowerCase();
    expect(note).toContain("demo");
    expect(note).toContain("stale");
    expect(note).toContain("invalid");
  });

  it("does not describe demo/stale/invalid as live, current, or healthy", () => {
    const note = POST_GROW_SENSOR_PROVENANCE_REVIEW_NOTE.toLowerCase();
    for (const bad of [
      "demo is live", "stale is live", "invalid is live",
      "demo is current", "stale is current", "invalid is current",
      "demo is healthy", "stale is healthy", "invalid is healthy",
      "safe to act",
    ]) {
      expect(note).not.toContain(bad);
    }
    // It must specifically warn against treating them as current healthy telemetry.
    expect(note).toContain("should not be treated as current healthy telemetry");
  });
});

describe("buildProvenanceBadgeRows — shared source-of-truth", () => {
  it("deduplicates and preserves canonical order", () => {
    const rows = buildProvenanceBadgeRows(["stale", "live", "live", "demo", "manual"]);
    expect(rows.map((r) => r.kind)).toEqual(["live", "manual", "demo", "stale"]);
  });

  it("normalizes unknown/null to invalid", () => {
    const rows = buildProvenanceBadgeRows([null, "bogus", undefined]);
    expect(rows.map((r) => r.kind)).toEqual(["invalid"]);
  });

  it("returns [] for empty input", () => {
    expect(buildProvenanceBadgeRows([])).toEqual([]);
  });

  it("uses the same labels/descriptions as the PDF legend", () => {
    const rows = buildProvenanceBadgeRows(["live", "manual", "csv", "demo", "stale", "invalid"]);
    for (const r of rows) {
      const legendRow = POST_GROW_SENSOR_PROVENANCE_LEGEND.find((l) => l.kind === r.kind)!;
      expect(r.label).toBe(legendRow.label);
      expect(r.description).toBe(legendRow.description);
      expect(r.healthy).toBe(legendRow.healthy);
    }
  });
});

describe("EnvironmentStabilityCard — in-app provenance badges", () => {
  const metrics = baseVm().environment;

  it("renders a badge for every canonical kind present in report data", () => {
    render(
      <EnvironmentStabilityCard
        metrics={metrics}
        sensorSourceKinds={["live", "manual", "csv", "demo", "stale", "invalid"]}
      />,
    );
    const container = screen.getByTestId("post-grow-provenance-badges");
    expect(container).toBeTruthy();
    for (const kind of ["live", "manual", "csv", "demo", "stale", "invalid"] as const) {
      expect(screen.getByTestId(`post-grow-provenance-badge-${kind}`)).toBeTruthy();
    }
    // Non-healthy badges are titled with the shared description that
    // warns not to treat them as current.
    expect(
      screen.getByTestId("post-grow-provenance-badge-stale").getAttribute("title"),
    ).toMatch(/should not be treated as current/i);
  });

  it("does not render the badge strip when no sensor sources are supplied", () => {
    render(<EnvironmentStabilityCard metrics={metrics} />);
    expect(screen.queryByTestId("post-grow-provenance-badges")).toBeNull();
    // Metrics still render safely.
    expect(screen.getByTestId("post-grow-environment-stability")).toBeTruthy();
  });

  it("renders safely with empty metrics + no sources and shows empty-state copy", () => {
    render(<EnvironmentStabilityCard metrics={[]} />);
    expect(screen.getByTestId("post-grow-environment-stability")).toBeTruthy();
    expect(screen.queryByTestId("post-grow-provenance-badges")).toBeNull();
    expect(
      screen.getByTestId("post-grow-sensor-empty-state").textContent,
    ).toBe(POST_GROW_SENSOR_EMPTY_STATE_COPY);
  });

  it("shows in-app empty-state copy when metrics have zero readings", () => {
    render(
      <EnvironmentStabilityCard
        metrics={[
          {
            key: "temperature_c",
            label: "Temperature",
            unit: "°C",
            count: 0,
            avg: null,
            min: null,
            max: null,
            stablePct: null,
            sparkline: [],
          },
        ]}
      />,
    );
    expect(screen.getByTestId("post-grow-sensor-empty-state").textContent).toBe(
      POST_GROW_SENSOR_EMPTY_STATE_COPY,
    );
  });

  it("gives each provenance badge an accessible label with its meaning and is keyboard focusable", () => {
    render(
      <EnvironmentStabilityCard
        metrics={[]}
        sensorSourceKinds={["manual", "stale"]}
      />,
    );
    const manual = screen.getByTestId("post-grow-provenance-badge-manual");
    expect(manual.getAttribute("aria-label")).toBe(
      "Sensor provenance: Manual. Reading entered by the grower.",
    );
    expect(manual.getAttribute("tabindex")).toBe("0");
    expect(manual.className).toMatch(/focus-visible:ring/);
    const stale = screen.getByTestId("post-grow-provenance-badge-stale");
    expect(stale.getAttribute("aria-label")).toMatch(
      /Sensor provenance: Stale\..*should not be treated as current/i,
    );
  });
});

describe("PDF sensor empty-state + semantic legend", () => {
  it("renders empty-state copy in PDF when no sensor sources exist", () => {
    const html = buildPostGrowReportPdfHtml(
      buildPostGrowReportPdfModel(baseVm({ environment: [] }), { now: NOW }),
    );
    expect(html).toContain(POST_GROW_SENSOR_EMPTY_STATE_COPY);
    expect(html).toContain('data-testid="post-grow-pdf-sensor-empty-state"');
    // legend still renders
    expect(html).toContain(POST_GROW_SENSOR_PROVENANCE_LEGEND_TITLE);
    expect(html).toContain(POST_GROW_SENSOR_PROVENANCE_REVIEW_NOTE);
  });

  it("uses semantic table markup for the legend (caption, scope, aria-label)", () => {
    const html = buildPostGrowReportPdfHtml(
      buildPostGrowReportPdfModel(baseVm(), { now: NOW }),
    );
    expect(html).toMatch(/<table aria-label="Sensor provenance legend">/);
    expect(html).toMatch(/<caption[^>]*>Sensor provenance legend<\/caption>/);
    expect(html).toMatch(/<th scope="col">Label<\/th>/);
    expect(html).toMatch(/<th scope="row">/);
    // Every legend badge has an aria-label with meaning.
    for (const row of POST_GROW_SENSOR_PROVENANCE_LEGEND) {
      expect(html).toContain(`aria-label="${provenanceBadgeAriaLabel(row)}"`);
    }
  });
});

describe("Export action — click integration (browser-level)", () => {
  it("clicking Export PDF opens a print window whose HTML includes legend, all six labels, review note, and empty-state copy", () => {
    const write = vi.fn();
    const popup = {
      document: { write, close: vi.fn(), title: "" } as unknown as Document,
      focus: vi.fn(),
      print: vi.fn(),
    };
    const openSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => popup as unknown as Window);

    render(
      <MemoryRouter>
        <ExportSummaryButtons vm={baseVm({ environment: [] })} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("post-grow-export-pdf"));

    expect(openSpy).toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
    const html = write.mock.calls[0][0] as string;

    expect(html).toContain(POST_GROW_SENSOR_PROVENANCE_LEGEND_TITLE);
    for (const label of ["Live", "Manual", "CSV", "Demo", "Stale", "Invalid"]) {
      expect(html).toContain(`>${label}<`);
    }
    expect(html).toContain(POST_GROW_SENSOR_PROVENANCE_REVIEW_NOTE);
    expect(html).toContain(POST_GROW_SENSOR_EMPTY_STATE_COPY);

    openSpy.mockRestore();
  });
});

describe("SensorProvenanceLegend — in-app presenter", () => {
  it("renders heading, all six canonical labels, and the manual-review note", () => {
    render(<SensorProvenanceLegend />);
    expect(
      screen.getByTestId("post-grow-sensor-provenance-legend"),
    ).toBeTruthy();
    expect(screen.getByText(POST_GROW_SENSOR_PROVENANCE_LEGEND_TITLE)).toBeTruthy();
    for (const row of POST_GROW_SENSOR_PROVENANCE_LEGEND) {
      const badge = screen.getByTestId(
        `post-grow-sensor-provenance-legend-badge-${row.kind}`,
      );
      expect(badge.textContent).toBe(row.label);
      expect(badge.getAttribute("aria-label")).toBe(
        provenanceBadgeAriaLabel(row),
      );
      expect(badge.getAttribute("title")).toBe(row.description);
      expect(badge.getAttribute("tabindex")).toBe("0");
      expect(badge.className).toMatch(/focus-visible:ring/);
    }
    expect(
      screen.getByTestId("post-grow-sensor-provenance-legend-review-note")
        .textContent,
    ).toBe(POST_GROW_SENSOR_PROVENANCE_REVIEW_NOTE);
  });
});

describe("EnvironmentStabilityCard — What do these badges mean? control", () => {
  it("renders a semantic button labeled 'What do these badges mean?' with collapsed aria-expanded", () => {
    render(<EnvironmentStabilityCard metrics={[]} sensorSourceKinds={["manual"]} />);
    const toggle = screen.getByTestId("post-grow-provenance-help-toggle");
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle.textContent).toMatch(/what do these badges mean\?/i);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBeTruthy();
    // Legend is not rendered until opened.
    expect(
      screen.queryByTestId("post-grow-sensor-provenance-legend"),
    ).toBeNull();
  });

  it("opens the in-app legend on click and updates aria-expanded", () => {
    render(<EnvironmentStabilityCard metrics={[]} sensorSourceKinds={["manual"]} />);
    const toggle = screen.getByTestId("post-grow-provenance-help-toggle");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const legend = screen.getByTestId("post-grow-sensor-provenance-legend");
    expect(legend).toBeTruthy();
    // aria-controls points at the panel that contains the legend.
    const panelId = toggle.getAttribute("aria-controls")!;
    expect(document.getElementById(panelId)?.contains(legend)).toBe(true);
    // All six labels present via shared source-of-truth.
    for (const row of POST_GROW_SENSOR_PROVENANCE_LEGEND) {
      expect(
        screen.getByTestId(`post-grow-sensor-provenance-legend-badge-${row.kind}`),
      ).toBeTruthy();
    }
    // Manual-review note visible.
    expect(
      screen.getByTestId("post-grow-sensor-provenance-legend-review-note")
        .textContent,
    ).toBe(POST_GROW_SENSOR_PROVENANCE_REVIEW_NOTE);
  });
});

describe("PDF export — no demo fallback when no sensor snapshots exist (regression)", () => {
  it("never fabricates demo readings or sensor rows when the report has no sensor data", () => {
    const model = buildPostGrowReportPdfModel(
      baseVm({ environment: [] }),
      { now: NOW /* no sensorReadingSources provided */ },
    );
    // No environment metric rows and no sensor source rows are fabricated.
    expect(model.environment).toEqual([]);
    expect(model.sensorSources).toEqual([]);

    const html = buildPostGrowReportPdfHtml(model);

    // Honest empty-state copy is rendered in place of any sensor rows.
    expect(html).toContain(POST_GROW_SENSOR_EMPTY_STATE_COPY);
    expect(html).toContain('data-testid="post-grow-pdf-sensor-empty-state"');

    // Legend is still rendered so growers can interpret future readings.
    expect(html).toContain(POST_GROW_SENSOR_PROVENANCE_LEGEND_TITLE);
    expect(html).toContain(POST_GROW_SENSOR_PROVENANCE_REVIEW_NOTE);

    // No sensor source list (`<ul class="sources">`) is fabricated.
    expect(html).not.toMatch(/<ul class="sources">/);
    // No "· N reading(s)" summary row (only produced from real source rows).
    expect(html).not.toMatch(/·\s*\d+\s*reading/);
    // No environment sensor <tbody> rows (env table falls back to muted <p>).
    expect(html).toContain("No environment aggregates available.");
    // Ensure demo is NOT presented as a sensor reading/source row anywhere.
    // Demo may only appear inside the legend description text.
    expect(html).not.toMatch(/badge flag[^>]*>Demo<\/span>\s*·\s*\d+/);
    expect(html).not.toMatch(/badge healthy[^>]*>Live<\/span>\s*·\s*\d+/);
  });

  it("does not backfill missing sensor sources with a demo default", () => {
    const model = buildPostGrowReportPdfModel(baseVm({ environment: [] }), {
      now: NOW,
      sensorReadingSources: [],
    });
    expect(model.sensorSources.some((r) => r.kind === "demo")).toBe(false);
    expect(model.sensorSources).toEqual([]);
  });
});

