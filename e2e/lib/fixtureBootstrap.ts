/**
 * Optional, UI-only disposable E2E fixture bootstrap.
 *
 * SAFETY (non-negotiable):
 *   - never deletes any record
 *   - never renames or overwrites existing grows/tents/plants
 *   - never uses service_role, admin APIs, or auth bypass
 *   - never reads, logs, or echoes secret values
 *   - never creates non-E2E names
 *   - never runs unless both E2E_FIXTURE_MODE=true AND
 *     E2E_ALLOW_FIXTURE_BOOTSTRAP=true are explicitly set
 *   - hard-fails if the account/page appears to contain real grow data
 *   - hard-fails if UI selectors are not stable enough — bootstrap is
 *     intentionally conservative and refuses to "force" creation
 *
 * Bootstrap is *optional*. The normal expectation is that the disposable
 * E2E grow/tent/plant are created once by a human through the normal
 * authenticated UI. See e2e/FIXTURE_SETUP.md.
 */
import type { Page } from "@playwright/test";
import { validateFixtureEnv, type FixtureEnvValidation } from "./fixtureSafety";

export type BootstrapGate = Readonly<{
  E2E_FIXTURE_MODE?: string;
  E2E_ALLOW_FIXTURE_BOOTSTRAP?: string;
  E2E_FIXTURE_EXPECTED_GROW_NAME?: string;
  E2E_FIXTURE_EXPECTED_TENT_NAME?: string;
  E2E_FIXTURE_EXPECTED_PLANT_NAME?: string;
  E2E_GROW_1_PLANT_URL?: string;
}>;

export interface BootstrapGateResult {
  allowed: boolean;
  errors: string[];
  expected: FixtureEnvValidation["expected"];
}

/**
 * Pure gate. Refuses bootstrap unless every safety flag is present and
 * every expected name is an explicit E2E/Test fixture name.
 */
export function evaluateBootstrapGate(env: BootstrapGate): BootstrapGateResult {
  const errors: string[] = [];

  if (env.E2E_FIXTURE_MODE !== "true") {
    errors.push(
      "Bootstrap refused: E2E_FIXTURE_MODE must be exactly 'true'.",
    );
  }
  if (env.E2E_ALLOW_FIXTURE_BOOTSTRAP !== "true") {
    errors.push(
      "Bootstrap refused: E2E_ALLOW_FIXTURE_BOOTSTRAP must be exactly 'true' to enable UI-only bootstrap.",
    );
  }

  const base = validateFixtureEnv({
    E2E_FIXTURE_MODE: env.E2E_FIXTURE_MODE,
    E2E_GROW_1_PLANT_URL: env.E2E_GROW_1_PLANT_URL,
    E2E_FIXTURE_EXPECTED_GROW_NAME: env.E2E_FIXTURE_EXPECTED_GROW_NAME,
    E2E_FIXTURE_EXPECTED_TENT_NAME: env.E2E_FIXTURE_EXPECTED_TENT_NAME,
    E2E_FIXTURE_EXPECTED_PLANT_NAME: env.E2E_FIXTURE_EXPECTED_PLANT_NAME,
  });

  for (const e of base.errors) {
    // Bootstrap reuses the same hard rules but excludes the
    // E2E_GROW_1_PLANT_URL "blank" requirement — at bootstrap time the
    // plant URL may not yet exist. We still refuse known-real prod URLs.
    if (/E2E_GROW_1_PLANT_URL is required/.test(e)) continue;
    errors.push(e);
  }

  for (const [key, value] of [
    ["E2E_FIXTURE_EXPECTED_GROW_NAME", base.expected.grow],
    ["E2E_FIXTURE_EXPECTED_TENT_NAME", base.expected.tent],
    ["E2E_FIXTURE_EXPECTED_PLANT_NAME", base.expected.plant],
  ] as const) {
    if (!/E2E|Test/i.test(value)) {
      errors.push(
        `Bootstrap refused: ${key}='${value}' must include 'E2E' or 'Test'. Bootstrap will never create non-E2E names.`,
      );
    }
  }

  return {
    allowed: errors.length === 0,
    errors,
    expected: base.expected,
  };
}

/**
 * Heuristic "looks like a real account" guard. The bootstrap MUST stop if
 * the visible UI shows clear evidence of real (non-E2E) grow data.
 */
export function pageLooksLikeRealAccount(pageText: string): {
  ok: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const text = pageText ?? "";

  // If there is grow-list content but no E2E/Test markers anywhere, treat
  // the account as non-disposable.
  const hasGrowSignal = /\bgrows?\b|\btents?\b|\bplants?\b/i.test(text);
  const hasE2EMarker = /E2E|Test/i.test(text);
  if (hasGrowSignal && !hasE2EMarker) {
    reasons.push(
      "Page shows grow/tent/plant content but no 'E2E'/'Test' markers — refusing to treat account as disposable.",
    );
  }

  // Conservative deny-list of clearly non-test phrasing.
  for (const phrase of [
    "Granddaddy Purple",
    "Real Grow",
    "Production",
  ]) {
    if (text.includes(phrase)) {
      reasons.push(`Page contains non-test phrase '${phrase}'.`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}

export type BootstrapOutcome =
  | { status: "noop"; reason: string }
  | { status: "blocked"; reason: string; requiredSelectors: string[] }
  | { status: "created"; created: Array<"grow" | "tent" | "plant"> };

/**
 * UI-only bootstrap. Conservative: if exact E2E fixture appears present,
 * no-ops. Otherwise returns `blocked` with the exact stable selectors
 * required — we DO NOT "force" creation when selectors are not stable.
 *
 * This function intentionally performs NO destructive operations.
 */
export async function bootstrapDisposableFixture(
  page: Page,
  expected: FixtureEnvValidation["expected"],
  opts: { baseUrl?: string } = {},
): Promise<BootstrapOutcome> {
  const baseUrl = opts.baseUrl ?? process.env.E2E_BASE_URL ?? "";
  if (baseUrl) {
    await page.goto(baseUrl);
  }

  const bodyText = (await page.locator("body").innerText()).slice(0, 50_000);

  const realCheck = pageLooksLikeRealAccount(bodyText);
  if (!realCheck.ok) {
    throw new Error(
      `Bootstrap refused: account does not look disposable.\n - ${realCheck.reasons.join("\n - ")}`,
    );
  }

  const hasGrow = bodyText.includes(expected.grow);
  const hasTent = bodyText.includes(expected.tent);
  const hasPlant = bodyText.includes(expected.plant);

  if (hasGrow && hasTent && hasPlant) {
    return {
      status: "noop",
      reason: "Disposable E2E fixture already present — no UI changes made.",
    };
  }

  // Conservative blocked path: we will not "guess" selectors against the
  // real product UI. Maintainers must wire stable test ids and re-enable.
  return {
    status: "blocked",
    reason:
      "Bootstrap not executed: stable test-id selectors for create-grow/create-tent/create-plant flows are required before bootstrap can safely create the disposable fixture through the normal UI.",
    requiredSelectors: [
      'data-testid="grows-new-grow-button"',
      'data-testid="grow-name-input"',
      'data-testid="grow-create-submit"',
      'data-testid="grow-add-tent-button"',
      'data-testid="tent-name-input"',
      'data-testid="tent-create-submit"',
      'data-testid="tent-add-plant-button"',
      'data-testid="plant-name-input"',
      'data-testid="plant-create-submit"',
    ],
  };
}
