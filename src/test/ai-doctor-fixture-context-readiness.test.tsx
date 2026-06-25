/**
 * AI Doctor context readiness — golden coverage using the multi-tent baseline
 * diary fixture.
 *
 * This test renders <AiDoctorContextReadinessPanel /> with a context compiled
 * from the imported-CSV diary fixture and verifies the readiness/display
 * layer treats imported history safely:
 *  - provenance visible (CSV / imported)
 *  - clear not-live / missing-live warning
 *  - no raw payload, vendor secrets, or private/internal fields leak
 *  - no device-command-shaped strings rendered
 *  - approval-required suggestions remain context-only (never shown
 *    approved/executed in the readiness UI)
 *  - invalid/unknown soil-probe state never described as healthy
 *  - no Supabase / network calls happen during render
 *
 * Test-only. No runtime behavior changed. The fixture is loaded here only
 * and is not imported by production runtime code.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import AiDoctorContextReadinessPanel from "@/components/AiDoctorContextReadinessPanel";
import {
  compileAiDoctorContextFromRows,
  type AiDoctorContext,
} from "@/lib/aiDoctorEngine";
import {
  compileDoctorContextFromDiaryFixture,
  type DiaryFixture,
  __testing as fixtureTesting,
} from "@/lib/aiDoctorFixtureContextRules";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      throw new Error("Supabase access not allowed in readiness fixture test");
    },
    functions: {
      invoke: () => {
        throw new Error("functions.invoke not allowed in readiness fixture test");
      },
    },
  },
}));

const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockImplementation((() => {
  throw new Error("fetch not allowed in readiness fixture test");
}) as never);

const FIXTURE_PATH = "fixtures/diary/2026-06-13-multi-tent-baseline.json";
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as DiaryFixture;

const NOW = new Date("2026-06-13T12:00:00Z");

/** Vendor-secret-shaped fields that must never leak into rendered output. */
const SECRET_BAITS = {
  device_serial: "SF-SECRET-9999",
  bridge_token: "btoken_LEAK_ME",
  file_name: "verdant-genetics-private.xlsx",
  batch_id: "batch-LEAK",
  internal_id: "int-LEAK",
  api_key: "sk-LEAK-XYZ",
};

/**
 * Test-only adapter: synthesize per-tent CSV-sourced sensor rows from the
 * diary fixture's averages so the readiness panel can be driven from the
 * imported history. The adapter never relabels CSV as live and always
 * embeds a `source_app` matching the fixture.
 */
function tentRowsFromFixture(f: DiaryFixture & { source_app?: string }) {
  const HOUR = 3600 * 1000;
  const rows: Array<Record<string, unknown>> = [];
  let i = 0;
  for (const [tent, t] of Object.entries(f.tents ?? {})) {
    const captured = new Date(NOW.getTime() - (++i) * HOUR).toISOString();
    const avg = ((t as { averages?: { temperature_f?: number; rh_pct?: number } }).averages) ?? {};
    if (typeof avg.temperature_f === "number") {
      rows.push({
        metric: "temperature_c",
        value: Math.round(((avg.temperature_f - 32) * 5) / 9 * 10) / 10,
        captured_at: captured,
        source: "csv",
        tent,
        raw_payload: {
          source_app: f.source_app ?? "verdant-genetics-xlsx-export",
          ...SECRET_BAITS,
        },
      });
    }
    if (typeof avg.rh_pct === "number") {
      rows.push({
        metric: "humidity_pct",
        value: avg.rh_pct,
        captured_at: captured,
        source: "csv",
        tent,
        raw_payload: {
          source_app: f.source_app ?? "verdant-genetics-xlsx-export",
          ...SECRET_BAITS,
        },
      });
    }
  }
  return rows;
}

function buildContext(): AiDoctorContext {
  return compileAiDoctorContextFromRows({
    plant: {
      id: "p-baseline",
      name: "Baseline Plant",
      strain: "Mixed",
      stage: "veg" as const,
      grow_id: "g-baseline",
      tent_id: "t-flower",
    },
    growEvents: [],
    sensorReadings: tentRowsFromFixture(fixture),
    now: NOW,
  });
}

describe("AiDoctorContextReadinessPanel — diary fixture golden context", () => {
  it("renders provenance for imported CSV history and the not-live disclosure", () => {
    render(<AiDoctorContextReadinessPanel context={buildContext()} />);

    // Provenance visible: CSV / imported source badge present, never live.
    const csvBadge = screen.getByTestId(
      "ai-doctor-context-readiness-panel-source-csv",
    );
    expect(csvBadge.textContent).toContain("CSV / imported");
    expect(csvBadge.getAttribute("data-trustworthy")).toBe("false");
    expect(
      screen.queryByTestId("ai-doctor-context-readiness-panel-source-live"),
    ).toBeNull();

    // Imported history disclosure (the not-live / manual-review-required panel).
    const disclosure = screen.getByTestId(
      "ai-doctor-imported-history-disclosure",
    );
    expect(disclosure).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-imported-history-source-label").textContent,
    ).toContain("CSV history");

    // Missing-live warning is shown because the fixture has no live readings.
    const warn = screen.getByTestId(
      "ai-doctor-imported-history-missing-live-warning",
    );
    expect(warn.textContent?.toLowerCase()).toContain("missing");
  });

  it("preview output is labeled 'Preview only — not saved.'", () => {
    render(<AiDoctorContextReadinessPanel context={buildContext()} />);
    expect(
      screen.getByTestId("ai-doctor-context-readiness-panel-preview-notice")
        .textContent,
    ).toBe("Preview only — not saved.");
  });

  it("does not leak raw payload, vendor secrets, or private/internal fields", () => {
    const { container } = render(
      <AiDoctorContextReadinessPanel context={buildContext()} />,
    );
    const text = container.textContent ?? "";
    for (const secret of Object.values(SECRET_BAITS)) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toContain("raw_payload");
    expect(text).not.toContain("raw_row");
    expect(text).not.toContain("bridge_token");
    expect(text).not.toContain("device_serial");
    // Full fixture JSON must not be dumped.
    expect(text).not.toContain(JSON.stringify(fixture).slice(0, 80));
  });

  it("renders no device-command-shaped strings", () => {
    const { container } = render(
      <AiDoctorContextReadinessPanel context={buildContext()} />,
    );
    const text = container.textContent ?? "";
    for (const pattern of fixtureTesting.DEVICE_COMMAND_PATTERNS) {
      expect(
        pattern.test(text),
        `device-command pattern matched in rendered output: ${pattern}`,
      ).toBe(false);
    }
  });

  it("does not describe invalid/unknown soil-probe state as healthy", () => {
    const { container } = render(
      <AiDoctorContextReadinessPanel context={buildContext()} />,
    );
    const text = (container.textContent ?? "").toLowerCase();
    // The fixture's soil_probes.status is "partial_invalid_or_unknown". The
    // readiness panel must never claim soil is healthy / nominal / good.
    expect(text).not.toMatch(/soil[^.]{0,40}(healthy|nominal|good|ok)\b/);
    expect(text).not.toMatch(/probe[^.]{0,40}(healthy|nominal|good)\b/);
  });

  it("approval-required suggestions in the fixture are not rendered as approved/executed actions", () => {
    const { container } = render(
      <AiDoctorContextReadinessPanel context={buildContext()} />,
    );
    const text = (container.textContent ?? "").toLowerCase();

    // Sanity: fixture's suggestions are all approval_required + non-device.
    for (const item of fixture.suggested_action_queue_items ?? []) {
      expect(item.approval_required).toBe(true);
      expect(item.device_control).toBe(false);
    }

    // Readiness panel must never present these as approved/executed.
    expect(text).not.toContain("approved");
    expect(text).not.toContain("executed");
    expect(text).not.toContain("auto-enqueued");
    expect(text).not.toContain("added to action queue");
    expect(text).not.toContain("queued");
  });

  it("compiled fixture context (separate helper) stays context-only and not-live", () => {
    const compiled = compileDoctorContextFromDiaryFixture(fixture);
    expect(compiled.provenance.is_live).toBe(false);
    expect(compiled.provenance.source).toBe("csv");
    expect(compiled.provenance.source_warning.toLowerCase()).toContain(
      "not live telemetry",
    );
    for (const s of compiled.suggested_actions_context_only) {
      expect(s.approval_required).toBe(true);
      expect(s.device_control).toBe(false);
      expect(s.context_only).toBe(true);
    }
    if (compiled.soil_probes) {
      expect(compiled.soil_probes.bucket).toBe("invalid_or_unknown");
      expect(compiled.soil_probes.flagged).toBe(true);
    }
  });

  it("does not trigger Supabase or network calls during render", () => {
    render(<AiDoctorContextReadinessPanel context={buildContext()} />);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("static guard: fixture is not imported by runtime app code", async () => {
    const { execSync } = await import("node:child_process");
    const out = execSync(
      "rg -l --no-messages \"fixtures/diary/2026-06-13-multi-tent-baseline\" src || true",
      { encoding: "utf8" },
    );
    const offenders = out
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("src/test/"));
    expect(offenders).toEqual([]);
  });
});
