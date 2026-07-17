/**
 * CSV Source-Label UI Regression v1
 *
 * Locks in the existing CSV import UI contract so future presenter or
 * copy-only edits cannot regress source-label honesty:
 *
 *  - The dialog opens with explicit CSV / "historical CSV context" framing.
 *  - The preview phase labels rows as CSV-sourced (parent description).
 *  - The done/result phase names the readings as CSV reading(s).
 *  - No "Live" badge or live-telemetry copy ever applies to CSV rows.
 *  - CSV/imported/stale/invalid/unknown data is not described as healthy.
 *  - No automation / device-control phrasing leaks into the CSV flow.
 *
 * This file does not add a parallel CSV flow. It exercises only:
 *   src/components/EnvironmentCsvImportModal.tsx
 *   src/lib/environmentCsvPreviewCopyRules.ts
 * plus a static scan of the persistence / launcher pair.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";

import { EnvironmentCsvImportModal } from "@/components/EnvironmentCsvImportModal";
import {
  CSV_IMPORT_DESCRIPTION,
  formatCsvPreviewRow,
} from "@/lib/environmentCsvPreviewCopyRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const PERSISTENCE_SRC = read("src/lib/environmentCsvImportPersistence.ts");
const MODAL_SRC = read("src/components/EnvironmentCsvImportModal.tsx");
const LAUNCHER_SRC = read("src/components/EnvironmentCsvImportLauncher.tsx");
const PREVIEW_COPY_SRC = read("src/lib/environmentCsvPreviewCopyRules.ts");

const SAMPLE_CSV =
  "Timestamp,Temperature (C),Humidity\n" +
  "2026-06-01T10:00:00Z,24.0,55\n" +
  "2026-06-01T10:05:00Z,24.2,54\n" +
  "2026-06-01T10:10:00Z,24.1,55\n";

async function openPreviewPhase() {
  const onConfirm = vi
    .fn()
    .mockResolvedValue({ insertedCount: 3, error: null });
  render(
    <EnvironmentCsvImportModal
      open
      onOpenChange={() => {}}
      onConfirm={onConfirm}
    />,
  );
  const input = screen.getByTestId("csv-import-file-input") as HTMLInputElement;
  Object.defineProperty(input, "files", {
    value: [new File([SAMPLE_CSV], "export.csv", { type: "text/csv" })],
  });
  fireEvent.change(input);
  await waitFor(() => {
    expect(
      screen.queryByTestId("csv-import-preview") ||
        screen.queryByTestId("csv-import-unit-confirm") ||
        screen.queryByTestId("csv-import-error"),
    ).toBeTruthy();
  });
  // Resolve a unit-confirm step if the parser asked for it.
  const unit = screen.queryByTestId("csv-import-unit-c");
  if (unit) {
    fireEvent.click(unit);
    await waitFor(() => {
      expect(screen.queryByTestId("csv-import-preview")).toBeTruthy();
    });
  }
  return { onConfirm };
}

// ---------------------------------------------------------------------------
// 1. Copy rules — CSV framing
// ---------------------------------------------------------------------------
describe("CSV Source-Label UI Regression v1 — copy rules", () => {
  it("dialog description names CSV explicitly and tags rows as historical CSV context", () => {
    expect(CSV_IMPORT_DESCRIPTION.toLowerCase()).toContain("csv");
    expect(CSV_IMPORT_DESCRIPTION.toLowerCase()).toContain(
      "historical csv context",
    );
    expect(CSV_IMPORT_DESCRIPTION.toLowerCase()).not.toContain("live");
  });

  it("formatCsvPreviewRow never describes a row as live/manual/demo/stale/invalid", () => {
    const sample = formatCsvPreviewRow({
      rowNumber: 1,
      captured_at: "2026-06-01T10:00:00.000Z",
      temperature_c: 24,
      humidity_pct: 55,
      vpd_kpa: 1.4,
      co2_ppm: null,
      ppfd: null,
      raw_temperature: 24,
      raw_temp_unit: "C",
      raw_payload: {},
      vpd_source: "derived",
      source_tag: "csv",
    });
    const lower = sample.toLowerCase();
    for (const term of ["live", "manual", "demo", "stale", "invalid"]) {
      expect(lower).not.toContain(term);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Modal — preview & done phases
// ---------------------------------------------------------------------------
describe("CSV Source-Label UI Regression v1 — preview phase", () => {
  it("renders the CSV-tagged dialog description above the preview list", async () => {
    await openPreviewPhase();
    // Dialog description carries the CSV source framing for every preview row.
    const desc = document.body.textContent ?? "";
    expect(desc).toContain(CSV_IMPORT_DESCRIPTION);
    expect(desc.toLowerCase()).toContain("csv");
    // The preview surface itself exists.
    expect(screen.getByTestId("csv-import-row-preview")).toBeTruthy();
    cleanup();
  });

  it("preview surface does not render a Live badge or live-telemetry copy", async () => {
    await openPreviewPhase();
    const preview = screen.getByTestId("csv-import-preview");
    const text = (preview.textContent ?? "").toLowerCase();
    expect(text).not.toMatch(/\blive\b/);
    expect(text).not.toMatch(/live (telemetry|reading|data|sensor)/);
    cleanup();
  });

  it("Confirm CTA is the only path to write (no auto-confirm from preview render)", async () => {
    const { onConfirm } = await openPreviewPhase();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByTestId("csv-import-confirm")).toBeTruthy();
    cleanup();
  });
});

describe("CSV Source-Label UI Regression v1 — done phase keeps CSV label", () => {
  it("done state names imported rows as CSV reading(s) after a successful confirm", async () => {
    const onConfirm = vi
      .fn()
      .mockResolvedValue({ insertedCount: 3, error: null });
    render(
      <EnvironmentCsvImportModal
        open
        onOpenChange={() => {}}
        onConfirm={onConfirm}
      />,
    );
    const input = screen.getByTestId(
      "csv-import-file-input",
    ) as HTMLInputElement;
    Object.defineProperty(input, "files", {
      value: [new File([SAMPLE_CSV], "export.csv", { type: "text/csv" })],
    });
    fireEvent.change(input);
    await waitFor(() => {
      expect(
        screen.queryByTestId("csv-import-preview") ||
          screen.queryByTestId("csv-import-unit-confirm"),
      ).toBeTruthy();
    });
    const unit = screen.queryByTestId("csv-import-unit-c");
    if (unit) {
      fireEvent.click(unit);
      await waitFor(() =>
        expect(screen.queryByTestId("csv-import-preview")).toBeTruthy(),
      );
    }
    fireEvent.click(screen.getByTestId("csv-import-confirm"));
    await waitFor(() =>
      expect(screen.queryByTestId("csv-import-done")).toBeTruthy(),
    );
    const done = screen.getByTestId("csv-import-done");
    const text = (done.textContent ?? "").toLowerCase();
    expect(text).toContain("csv");
    expect(text).toMatch(/csv reading/);
    // The done note deliberately says "not live telemetry" — a negation,
    // not a live claim. Strip that exact phrase, then keep banning any
    // other live wording.
    expect(text.replace(/not live telemetry/g, "")).not.toMatch(/\blive\b/);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    cleanup();
  });
});

// ---------------------------------------------------------------------------
// 3. Static scan — CSV flow files
// ---------------------------------------------------------------------------
describe("CSV Source-Label UI Regression v1 — static scan", () => {
  const ALL = [
    PERSISTENCE_SRC,
    MODAL_SRC,
    LAUNCHER_SRC,
    PREVIEW_COPY_SRC,
  ].join("\n");

  const BANNED = [
    "automatically executed",
    "auto execute",
    "send command",
    "set fan",
    "set light",
    "set irrigation",
    "dose nutrients",
    "guaranteed",
    "definitely",
    "diagnosed from photo",
    "fake live",
  ];

  it("CSV files do not contain banned automation / certainty phrases", () => {
    const lower = ALL.toLowerCase();
    for (const term of BANNED) {
      expect(lower, `banned phrase in CSV flow: ${term}`).not.toContain(term);
    }
  });

  it("CSV files do not render a 'Live' badge or label CSV-source as live", () => {
    // Persistence pins the contract explicitly.
    expect(PERSISTENCE_SRC).toMatch(/Never labels rows as "live"/);
    expect(MODAL_SRC).toMatch(/Never renders a "Live" badge for CSV/);
    // No inline Badge>Live string in modal/launcher.
    expect(MODAL_SRC.toLowerCase()).not.toMatch(/badge[^<]{0,30}>\s*live/i);
    expect(LAUNCHER_SRC.toLowerCase()).not.toMatch(/badge[^<]{0,30}>\s*live/i);
  });

  it("CSV/imported/stale/invalid/demo/unknown is never described as healthy", () => {
    const lower = ALL.toLowerCase();
    const nearHealthy =
      /(csv|imported|stale|invalid|demo|unknown)[^.]{0,40}\bhealthy\b/;
    expect(lower).not.toMatch(nearHealthy);
  });

  // Touch `within` so an unused-import lint never silently passes.
  it("regression harness imports stay live", () => {
    expect(typeof within).toBe("function");
  });
});
