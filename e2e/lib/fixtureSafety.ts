/**
 * Disposable E2E fixture safety helpers.
 *
 * The Quick Log Playwright smoke is write-producing: it creates real diary
 * entries through the normal authenticated UI. To keep it from ever
 * touching a real active grow, every smoke run must first verify that the
 * target plant/grow/tent is a disposable E2E fixture owned by a dedicated
 * test account.
 *
 * SAFETY:
 *   - no destructive write operations
 *   - never overwrites grow/tent/plant names
 *   - no elevated DB role
 *   - never bypasses auth
 *   - never reads or logs secret values
 */

export type FixtureSafetyEnv = Readonly<{
  E2E_FIXTURE_MODE?: string;
  E2E_GROW_1_PLANT_URL?: string;
  E2E_FIXTURE_EXPECTED_GROW_NAME?: string;
  E2E_FIXTURE_EXPECTED_TENT_NAME?: string;
  E2E_FIXTURE_EXPECTED_PLANT_NAME?: string;
}>;

export interface FixtureEnvValidation {
  ok: boolean;
  errors: string[];
  expected: {
    grow: string;
    tent: string;
    plant: string;
  };
}

/**
 * Known patterns that indicate the URL points at a real / production grow.
 * Extend this list when new known-real plants are identified.
 */
const KNOWN_REAL_PLANT_URL_PATTERNS: readonly RegExp[] = [
  // Production hostname for the live Verdant app.
  /verdantgrowdiary\.com\//i,
];

export function isLikelyRealPlantUrl(url: string): boolean {
  if (!url) return false;
  return KNOWN_REAL_PLANT_URL_PATTERNS.some((rx) => rx.test(url));
}

/**
 * Pure env-level fixture validation. No network, no I/O.
 * Returns a structured result; callers decide whether to throw.
 */
export function validateFixtureEnv(env: FixtureSafetyEnv): FixtureEnvValidation {
  const errors: string[] = [];

  if (env.E2E_FIXTURE_MODE !== "true") {
    errors.push(
      "E2E_FIXTURE_MODE must be exactly 'true' before write-producing smoke can run.",
    );
  }

  const plantUrl = env.E2E_GROW_1_PLANT_URL ?? "";
  if (!plantUrl.trim()) {
    errors.push("E2E_GROW_1_PLANT_URL is required and must not be blank.");
  } else if (isLikelyRealPlantUrl(plantUrl)) {
    errors.push(
      "E2E_GROW_1_PLANT_URL looks like a real/production grow URL. Refusing to run write-producing smoke against it.",
    );
  }

  const grow = (env.E2E_FIXTURE_EXPECTED_GROW_NAME ?? "").trim();
  const tent = (env.E2E_FIXTURE_EXPECTED_TENT_NAME ?? "").trim();
  const plant = (env.E2E_FIXTURE_EXPECTED_PLANT_NAME ?? "").trim();

  for (const [name, value] of [
    ["E2E_FIXTURE_EXPECTED_GROW_NAME", grow],
    ["E2E_FIXTURE_EXPECTED_TENT_NAME", tent],
    ["E2E_FIXTURE_EXPECTED_PLANT_NAME", plant],
  ] as const) {
    if (!value) {
      errors.push(`${name} is required and must not be blank.`);
    } else if (!/e2e|test/i.test(value)) {
      errors.push(
        `${name}='${value}' does not look like an E2E fixture name (must include 'E2E' or 'Test').`,
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    expected: { grow, tent, plant },
  };
}

/**
 * Check that visible page text contains the expected fixture names AND
 * recognizable E2E/Test markers. Read-only check.
 */
export function pageTextMatchesFixture(
  pageText: string,
  expected: FixtureEnvValidation["expected"],
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const text = pageText ?? "";

  if (!/E2E|Test/i.test(text)) {
    errors.push(
      "Target page does not contain 'E2E' or 'Test' markers — refusing to treat as fixture data.",
    );
  }
  for (const [label, value] of [
    ["grow", expected.grow],
    ["tent", expected.tent],
    ["plant", expected.plant],
  ] as const) {
    if (value && !text.includes(value)) {
      errors.push(
        `Expected ${label} name '${value}' not visible on the target page.`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}
