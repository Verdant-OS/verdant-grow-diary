import { test, expect } from "@playwright/test";
import {
  evaluateBootstrapGate,
  bootstrapDisposableFixture,
} from "./lib/fixtureBootstrap";

/**
 * Optional UI-only disposable E2E fixture bootstrap.
 *
 * SAFETY:
 *   - never deletes, renames, or overwrites any record
 *   - never uses service_role or admin APIs
 *   - never bypasses auth (uses the normal storageState from auth.setup.ts)
 *   - only runs when E2E_FIXTURE_MODE=true AND
 *     E2E_ALLOW_FIXTURE_BOOTSTRAP=true
 *   - hard-fails (blocks) when UI selectors are not stable enough
 *
 * Not wired into CI by default. The workflow runs it only when
 * `vars.E2E_ALLOW_FIXTURE_BOOTSTRAP == 'true'`.
 */
test("optional disposable E2E fixture bootstrap (UI-only, idempotent)", async ({
  page,
}) => {
  const env = {
    E2E_FIXTURE_MODE: process.env.E2E_FIXTURE_MODE,
    E2E_ALLOW_FIXTURE_BOOTSTRAP: process.env.E2E_ALLOW_FIXTURE_BOOTSTRAP,
    E2E_FIXTURE_EXPECTED_GROW_NAME:
      process.env.E2E_FIXTURE_EXPECTED_GROW_NAME,
    E2E_FIXTURE_EXPECTED_TENT_NAME:
      process.env.E2E_FIXTURE_EXPECTED_TENT_NAME,
    E2E_FIXTURE_EXPECTED_PLANT_NAME:
      process.env.E2E_FIXTURE_EXPECTED_PLANT_NAME,
    E2E_GROW_1_PLANT_URL: process.env.E2E_GROW_1_PLANT_URL,
  };

  const gate = evaluateBootstrapGate(env);
  expect(
    gate.allowed,
    `Bootstrap gate refused:\n - ${gate.errors.join("\n - ")}`,
  ).toBe(true);

  const outcome = await bootstrapDisposableFixture(page, gate.expected, {
    baseUrl: process.env.E2E_BASE_URL,
  });

  // Surface outcome in the report. `blocked` is an expected, safe state
  // when stable selectors are not wired — maintainers must add the
  // listed test-ids before bootstrap can create the fixture.
  if (outcome.status === "blocked") {
    test.info().annotations.push({
      type: "bootstrap-blocked",
      description: `${outcome.reason}\nRequired selectors:\n - ${outcome.requiredSelectors.join("\n - ")}`,
    });
    test.skip(
      true,
      `Bootstrap blocked: ${outcome.reason} Required selectors: ${outcome.requiredSelectors.join(", ")}`,
    );
  } else if (outcome.status === "noop") {
    test.info().annotations.push({
      type: "bootstrap-noop",
      description: outcome.reason,
    });
  } else {
    test.info().annotations.push({
      type: "bootstrap-created",
      description: `Created: ${outcome.created.join(", ")}`,
    });
  }
});
