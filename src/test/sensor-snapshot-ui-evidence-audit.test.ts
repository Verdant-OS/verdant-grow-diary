/**
 * sensor-snapshot-ui-evidence-audit
 *
 * Static audit that pins which UI/read-path modules are wired through
 * the shared Quick Log v1 snapshot metric normalizer
 * (`normalizeQuickLogSnapshotMetrics`) and which are intentionally
 * bypassed because they carry their own normalizer / contract / legacy
 * shape.
 *
 * Why this exists:
 *   The Quick Log v1 read-path collapses legacy + clean metric keys via
 *   one shared normalizer. Other sensor surfaces (Ecowitt live cards,
 *   the legacy {temp, rh, vpd} diary chip, the manual snapshot preview
 *   form, the alert/bridge status displays) deliberately use their own
 *   shapes. This test makes the boundary explicit so future drift causes
 *   a focused, named failure instead of a silent UI regression.
 *
 * Pure / read-only. No I/O, no Supabase, no React mount.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function readSrc(rel: string): string {
  const p = resolve(__dirname, "..", "..", "src", rel);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

// ─── Quick Log v1 consumers (must use the shared normalizer) ───────────
const QUICK_LOG_V1_CONSUMERS: ReadonlyArray<{
  file: string;
  why: string;
}> = [
  {
    file: "lib/quick-log/quickLogDiaryCompanionRules.ts",
    why: "Companion view feeds AI Doctor adapter + dedupe; must normalize both legacy and clean metric keys.",
  },
];

// ─── Intentional bypasses (own normalizer / contract / legacy shape) ──
const INTENTIONAL_BYPASSES: ReadonlyArray<{
  file: string;
  why: string;
  /** Marker substring proving the file uses its own shape, not v1's. */
  marker: string;
}> = [
  {
    file: "pages/Timeline.tsx",
    why: "Timeline delegates canonical, legacy and manual compatibility sensor precedence to its pure view model; the page wiring is fenced below.",
    marker: "resolveTimelineCardSensorResolution",
  },
  {
    file: "lib/timelineSensorSnapshotViewModel.ts",
    why: "The pure Timeline view model resolves canonical and legacy diary shapes plus Plant Quick Log's manual compatibility envelope; it does not use the v1 companion normalizer.",
    marker: "details?.manual_sensor_snapshot",
  },
  {
    file: "components/EcowittLatestSnapshotCard.tsx",
    why: "Ecowitt live tent snapshot card; uses Ecowitt's own viewModel.metrics.{humidity_pct, vpd_kpa} contract — never a Quick Log v1 companion row.",
    marker: "ecowitt-metric-",
  },
  {
    file: "components/EcowittTimelineSnapshotChip.tsx",
    why: "Ecowitt-specific timeline chip rendered from Ecowitt snapshot.metrics.{temperature_c, humidity_pct}.",
    marker: "snapshot.metrics.temperature_c",
  },
  {
    file: "components/SensorSnapshotPreview.tsx",
    why: "Manual sensor preview input form. Uses its own input vocabulary {temp_f, humidity_pct, vpd_kpa, soil_moisture_pct, co2_ppm}; not a Quick Log v1 read surface.",
    marker: "humidity_pct",
  },
  {
    file: "components/PlantQuickLog.tsx",
    why: "Stores manual sensor data under details.manual_sensor_snapshot — separate diary key with its own viewModel.",
    marker: "manual_sensor_snapshot",
  },
];

describe("Quick Log v1 snapshot normalizer — consumer boundary", () => {
  it.each(QUICK_LOG_V1_CONSUMERS)("$file imports the shared normalizer", ({ file }) => {
    const src = readSrc(file);
    expect(src.length).toBeGreaterThan(0);
    expect(src).toMatch(/normalizeQuickLogSnapshotMetrics/);
    expect(src).toMatch(/quickLogSnapshotMetricNormalizer/);
  });

  it("AI Doctor v1 adapter consumes the companion view (transitively normalized)", () => {
    const src = readSrc("lib/quick-log/quickLogAiDoctorContextAdapter.ts");
    expect(src).toMatch(/extractQuickLogCompanionView/);
    // It must NOT do its own ad-hoc metric pivot.
    expect(src).not.toMatch(/temperature_c/);
    expect(src).not.toMatch(/humidity_pct/);
  });
});

describe("Quick Log v1 snapshot normalizer — intentional bypasses", () => {
  it.each(INTENTIONAL_BYPASSES)(
    "$file is an intentional bypass (own contract: $why)",
    ({ file, marker }) => {
      const src = readSrc(file);
      expect(src.length).toBeGreaterThan(0);
      expect(src).toContain(marker);
      // Sanity: bypass files must NOT import the v1 normalizer. If they
      // start to, either delete this entry or migrate them on purpose.
      expect(src).not.toMatch(/normalizeQuickLogSnapshotMetrics/);
    },
  );

  it("keeps Timeline sensor precedence canonical, then legacy, then manual compatibility", () => {
    const src = readSrc("lib/timelineSensorSnapshotViewModel.ts");
    const page = readSrc("pages/Timeline.tsx");
    expect(src).toMatch(/const canonical = asRecord\(details\?\.sensor_snapshot\)/);
    expect(src).toMatch(/const legacy = asRecord\(details\?\.sensor\)/);
    expect(src).toMatch(/const manualCompat = asRecord\(details\?\.manual_sensor_snapshot\)/);
    expect(src).toMatch(/canonical \?\? legacy \?\? manualCompat/);
    expect(page).toMatch(
      /resolveTimelineCardSensorResolution\(\s*\(e\.details\s+as\s+Record<string,\s*unknown>\s*\|\s*null\s*\|\s*undefined\)\s*\?\?\s*null/,
    );
    expect(page).toMatch(/validateManualCompatibility:\s*true/);
  });

  it("keeps the Timeline sensor resolver free of writes and runtime dependencies", () => {
    const src = readSrc("lib/timelineSensorSnapshotViewModel.ts");
    expect(src).not.toMatch(/from\s+["'](?:react|@\/integrations\/supabase)/);
    expect(src).not.toMatch(/\b(?:supabase|service_role)\b/i);
    expect(src).not.toMatch(/\.(?:from|insert|update|upsert|rpc)\s*\(/);
    expect(src).not.toMatch(/\b(?:fetch|setInterval|setTimeout)\s*\(/);
  });
});

describe("Quick Log v1 grouped timeline section — sensor read-path", () => {
  it("does not duplicate the v1 metric vocabulary in JSX (must go through normalizer if it surfaces metrics)", () => {
    const src = readSrc("components/QuickLogGroupedTimelineSection.tsx");
    expect(src.length).toBeGreaterThan(0);
    // No raw legacy metric keys in JSX — drift fence.
    expect(src).not.toMatch(/\btemperature_c\b/);
    expect(src).not.toMatch(/\bhumidity_pct\b/);
    expect(src).not.toMatch(/\bvpd_kpa\b/);
  });
});
