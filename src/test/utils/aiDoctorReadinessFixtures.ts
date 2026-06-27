/**
 * aiDoctorReadinessFixtures — deterministic, test-only fixture factories
 * for AI Doctor Context Readiness UI tests.
 *
 * Hard constraints:
 *  - No Supabase / fetch / model imports.
 *  - Only type-only imports from runtime code.
 *  - Deterministic: fixed NOW timestamp, no random IDs.
 *  - Test-only: lives under src/test/utils and must not be imported by app code.
 */
import { compileAiDoctorContextFromRows } from "@/lib/aiDoctorEngine";
import type { AiDoctorContext } from "@/lib/aiDoctorEngine";
import type {
  AiDoctorReadinessSourceBadge,
} from "@/lib/aiDoctorReadinessViewModel";
import type { SensorSourceTag } from "@/lib/aiDoctorContextCompiler";

export const READINESS_FIXTURE_NOW = new Date("2026-06-10T12:00:00Z");
export const READINESS_FIXTURE_HOUR_MS = 3600 * 1000;
export const readinessFixtureAgo = (ms: number): string =>
  new Date(READINESS_FIXTURE_NOW.getTime() - ms).toISOString();

export const EXPECTED_SOURCE_LABELS: Record<SensorSourceTag, string> = {
  live: "Live",
  manual: "Manual",
  csv: "CSV / imported",
  demo: "Demo",
  stale: "Stale",
  invalid: "Invalid",
};

export interface ReadinessSourceBadgeCase {
  readonly source: SensorSourceTag;
  readonly label: string;
  readonly isTrustworthy: boolean;
  /** Caution/trust copy intent — drives presentation expectations. */
  readonly trustCopy: "trusted" | "caution";
}

export const SOURCE_BADGE_CASES: readonly ReadinessSourceBadgeCase[] = [
  { source: "live", label: "Live", isTrustworthy: true, trustCopy: "trusted" },
  { source: "manual", label: "Manual", isTrustworthy: true, trustCopy: "trusted" },
  { source: "csv", label: "CSV / imported", isTrustworthy: false, trustCopy: "caution" },
  { source: "demo", label: "Demo", isTrustworthy: false, trustCopy: "caution" },
  { source: "stale", label: "Stale", isTrustworthy: false, trustCopy: "caution" },
  { source: "invalid", label: "Invalid", isTrustworthy: false, trustCopy: "caution" },
] as const;

export function buildReadinessSourceBadgeFixture(
  overrides: Partial<AiDoctorReadinessSourceBadge> = {},
): AiDoctorReadinessSourceBadge {
  const base: AiDoctorReadinessSourceBadge = {
    source: "live",
    label: EXPECTED_SOURCE_LABELS.live,
    sampleCount: 1,
    isTrustworthy: true,
  };
  return { ...base, ...overrides };
}

export const READINESS_FIXTURE_PLANT = Object.freeze({
  id: "p1",
  name: "Plant A",
  strain: "Northern Lights",
  stage: "veg" as const,
  grow_id: "g1",
  tent_id: "t1",
});

export interface BuildReadinessContextArgs {
  growEvents?: ReadonlyArray<Record<string, unknown>>;
  sensorReadings?: ReadonlyArray<Record<string, unknown>>;
  plant?: Partial<typeof READINESS_FIXTURE_PLANT>;
}

export function buildReadinessContext(
  args: BuildReadinessContextArgs = {},
): AiDoctorContext {
  return compileAiDoctorContextFromRows({
    plant: { ...READINESS_FIXTURE_PLANT, ...(args.plant ?? {}) },
    growEvents: args.growEvents ?? [],
    sensorReadings: args.sensorReadings ?? [],
    now: READINESS_FIXTURE_NOW,
  });
}

/**
 * Builds a single sensor reading for a given source. For `stale`/`invalid`
 * the underlying reading source remains `live` and the compiler-side
 * `quality` flag downgrades the group label — matching how the compiler
 * actually classifies these badges.
 */
export function buildReadingForSource(
  source: SensorSourceTag,
  partial: Record<string, unknown> = {},
): Record<string, unknown> {
  const reading: Record<string, unknown> = {
    metric: "temperature_c",
    value: 24,
    captured_at: readinessFixtureAgo(READINESS_FIXTURE_HOUR_MS),
    source: source === "stale" || source === "invalid" ? "live" : source,
    ...partial,
  };
  if (source === "stale") reading.quality = "stale";
  if (source === "invalid") reading.quality = "invalid";
  return reading;
}

export interface BuildReadinessPanelPropsArgs
  extends BuildReadinessContextArgs {
  openAlertsCount?: number;
}

export interface ReadinessPanelPropsFixture {
  context: AiDoctorContext;
  openAlertsCount: number;
}

export function buildReadinessPanelProps(
  args: BuildReadinessPanelPropsArgs = {},
): ReadinessPanelPropsFixture {
  return {
    context: buildReadinessContext(args),
    openAlertsCount: args.openAlertsCount ?? 0,
  };
}
