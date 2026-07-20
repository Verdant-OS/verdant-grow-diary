/**
 * Disposable E2E fixture safety helpers.
 *
 * The Quick Log Playwright smoke is write-producing: it creates real diary
 * entries through the normal authenticated UI. To keep it from ever
 * touching a real active grow, every smoke run must first verify that the
 * target tent/plant is a disposable E2E fixture owned by a dedicated
 * test account.
 *
 * The current setup flow has no Grow page surfaced in the UI — growers
 * Add Tent from the dashboard, open the tent, then Add Plant. So the
 * validator REQUIRES visible E2E tent + plant names, and only checks the
 * grow name when one is explicitly supplied via
 * `E2E_FIXTURE_EXPECTED_GROW_NAME`.
 *
 * SAFETY:
 *   - no destructive write operations
 *   - never overwrites grow/tent/plant names
 *   - no elevated DB role
 *   - never bypasses auth
 *   - never reads or logs secret values
 */
import type { Page } from "@playwright/test";

export type FixtureSafetyEnv = Readonly<{
  E2E_FIXTURE_MODE?: string;
  E2E_GROW_1_PLANT_URL?: string;
  E2E_FIXTURE_EXPECTED_GROW_NAME?: string;
  E2E_FIXTURE_EXPECTED_TENT_NAME?: string;
  E2E_FIXTURE_EXPECTED_PLANT_NAME?: string;
  E2E_FIXTURE_EXPECTED_ACCOUNT_HINT?: string;
}>;

export interface FixtureEnvValidation {
  ok: boolean;
  errors: string[];
  expected: {
    /** Optional. Only enforced when an expected grow name is provided. */
    grow: string;
    tent: string;
    plant: string;
  };
}

export interface FixturePageRelationship {
  plantHeading: string;
  relatedTentName: string;
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
 *
 * REQUIRED: tent + plant expected names (with E2E/Test markers).
 * OPTIONAL: grow expected name. Only validated when provided.
 */
export function validateFixtureEnv(env: FixtureSafetyEnv): FixtureEnvValidation {
  const errors: string[] = [];

  if (env.E2E_FIXTURE_MODE !== "true") {
    errors.push("E2E_FIXTURE_MODE must be exactly 'true' before write-producing smoke can run.");
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

  // Required names.
  for (const [name, value] of [
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

  // Optional grow name. Validated only when provided — the current UI has
  // no Grow page in the setup flow (Dashboard → Add Tent → Add Plant).
  if (grow && !/e2e|test/i.test(grow)) {
    errors.push(
      `E2E_FIXTURE_EXPECTED_GROW_NAME='${grow}' does not look like an E2E fixture name (must include 'E2E' or 'Test').`,
    );
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
 *
 * Required: visible tent + plant names.
 * Optional: grow name is only required when `expected.grow` is non-empty.
 *
 * If `accountHint` is provided AND the page visibly exposes an account
 * label (email or display name), the visible text must contain the hint.
 * The hint is treated as a non-secret label; secrets must never be passed
 * here.
 */
export function pageTextMatchesFixture(
  pageText: string,
  expected: FixtureEnvValidation["expected"],
  options: { accountHint?: string } = {},
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const text = pageText ?? "";

  if (!/E2E|Test/i.test(text)) {
    errors.push(
      "Target page does not contain 'E2E' or 'Test' markers — refusing to treat as fixture data.",
    );
  }

  const required: Array<[string, string]> = [
    ["tent", expected.tent],
    ["plant", expected.plant],
  ];
  for (const [label, value] of required) {
    if (value && !text.includes(value)) {
      errors.push(`Expected ${label} name '${value}' not visible on the target page.`);
    }
  }

  // Grow is only checked when an expected grow name was explicitly
  // supplied. The current UI does not expose a Grow page in the setup
  // flow, so a missing grow name must not fail fixture verification.
  if (expected.grow && !text.includes(expected.grow)) {
    errors.push(`Expected grow name '${expected.grow}' not visible on the target page.`);
  }

  const hint = (options.accountHint ?? "").trim();
  if (hint) {
    // If the visible UI exposes any account-identity surface (email-like
    // string or "Signed in as" label), require the hint to be present.
    const exposesAccount = /signed in as|account:|@/i.test(text);
    if (exposesAccount && !text.toLowerCase().includes(hint.toLowerCase())) {
      errors.push(
        `Account hint '${hint}' not visible on a page that exposes account identity — refusing to assume the dedicated test account is signed in.`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Verify the exact Plant Detail identity and its rendered tent relationship.
 * The caller must read these values from the page heading and the scoped
 * `plant-detail-tent` container rather than from unrelated body text.
 */
export function fixturePageRelationshipMatchesExpected(
  actual: FixturePageRelationship,
  expected: FixtureEnvValidation["expected"],
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (actual.plantHeading.trim() !== expected.plant) {
    errors.push(
      `Exact Plant Detail heading '${expected.plant}' was not rendered for the configured fixture.`,
    );
  }

  if (actual.relatedTentName.trim() !== expected.tent) {
    errors.push(
      `Expected related tent '${expected.tent}' was not rendered in the Plant Detail tent container.`,
    );
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Validate the already-open Plant Detail page before the Quick Log smoke
 * performs any write-producing UI action. This deliberately composes the
 * same pure env and visible-page checks used by fixture-safety.spec.ts so a
 * direct `e2e:quicklog-smoke` invocation cannot bypass them.
 */
export async function validateQuickLogFixturePage(
  page: Page,
  env: FixtureSafetyEnv = {
    E2E_FIXTURE_MODE: process.env.E2E_FIXTURE_MODE,
    E2E_GROW_1_PLANT_URL: process.env.E2E_GROW_1_PLANT_URL,
    E2E_FIXTURE_EXPECTED_GROW_NAME: process.env.E2E_FIXTURE_EXPECTED_GROW_NAME,
    E2E_FIXTURE_EXPECTED_TENT_NAME: process.env.E2E_FIXTURE_EXPECTED_TENT_NAME,
    E2E_FIXTURE_EXPECTED_PLANT_NAME: process.env.E2E_FIXTURE_EXPECTED_PLANT_NAME,
    E2E_FIXTURE_EXPECTED_ACCOUNT_HINT: process.env.E2E_FIXTURE_EXPECTED_ACCOUNT_HINT,
  },
): Promise<FixtureEnvValidation> {
  const envCheck = validateFixtureEnv(env);
  if (!envCheck.ok) {
    throw new Error(`Fixture env validation failed:\n - ${envCheck.errors.join("\n - ")}`);
  }

  if (page.url().includes("/auth")) {
    throw new Error(
      "Fixture validation reached /auth instead of the configured Plant Detail page.",
    );
  }

  // Plant and Tent are the required visible relationship. The plant must
  // be the exact current page h1, and the tent must be the exact name inside
  // Plant Detail's related-tent container. Names elsewhere in body text do
  // not satisfy this fence. Grow remains optional until the product exposes
  // it in the setup flow.
  const plantHeading = page.getByRole("heading", {
    level: 1,
    name: envCheck.expected.plant,
    exact: true,
  });
  await plantHeading.waitFor({ state: "visible", timeout: 20_000 });

  const relatedTentName = page
    .getByTestId("plant-detail-tent")
    .getByText(envCheck.expected.tent, { exact: true });
  await relatedTentName.waitFor({ state: "visible", timeout: 20_000 });

  const relationshipCheck = fixturePageRelationshipMatchesExpected(
    {
      plantHeading: await plantHeading.innerText(),
      relatedTentName: await relatedTentName.innerText(),
    },
    envCheck.expected,
  );
  if (!relationshipCheck.ok) {
    throw new Error(
      `Plant Detail fixture relationship validation failed:\n - ${relationshipCheck.errors.join("\n - ")}`,
    );
  }

  if (envCheck.expected.grow) {
    await page
      .getByText(envCheck.expected.grow, { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });
  }

  const bodyText = (await page.locator("body").innerText()).slice(0, 50_000);
  const pageCheck = pageTextMatchesFixture(bodyText, envCheck.expected, {
    accountHint: env.E2E_FIXTURE_EXPECTED_ACCOUNT_HINT,
  });
  if (!pageCheck.ok) {
    throw new Error(
      `Target page does not look like a disposable E2E fixture:\n - ${pageCheck.errors.join("\n - ")}`,
    );
  }

  return envCheck;
}
