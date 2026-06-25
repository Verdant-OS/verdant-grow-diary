#!/usr/bin/env bun
/**
 * Print the required GitHub Actions secrets/vars and the manual setup
 * checklist for the disposable E2E fixture.
 *
 * SAFETY:
 *   - never reads, prints, or echoes any secret value
 *   - never calls Supabase, admin APIs, or any network
 *   - never creates, modifies, or removes any data
 *   - prints NAMES and instructions only
 */

const REQUIRED_SECRETS = [
  "E2E_TEST_EMAIL",
  "E2E_TEST_PASSWORD",
] as const;

const REQUIRED_VARS = [
  "E2E_BASE_URL",
  "E2E_GROW_1_PLANT_URL",
  "E2E_FIXTURE_MODE",
  "E2E_FIXTURE_EXPECTED_TENT_NAME",
  "E2E_FIXTURE_EXPECTED_PLANT_NAME",
] as const;

const OPTIONAL_VARS = [
  "E2E_FIXTURE_EXPECTED_GROW_NAME",
  "E2E_GROW_2_PLANT_NAME",
  "E2E_FIXTURE_EXPECTED_ACCOUNT_HINT",
  "E2E_ALLOW_FIXTURE_BOOTSTRAP",
] as const;

const lines: string[] = [];
const push = (s = "") => lines.push(s);

push("Verdant Quick Log smoke — disposable E2E fixture checklist");
push("=".repeat(60));
push();
push("This script prints names and instructions ONLY.");
push("It never reads or prints any secret value.");
push();
push("Required GitHub Actions SECRETS (Settings → Secrets and variables → Actions → Secrets):");
for (const s of REQUIRED_SECRETS) push(`  - secrets.${s}`);
push();
push("Required GitHub Actions VARIABLES (Settings → Secrets and variables → Actions → Variables):");
for (const v of REQUIRED_VARS) push(`  - vars.${v}`);
push();
push("Optional variables:");
for (const v of OPTIONAL_VARS) push(`  - vars.${v}`);
push();
push("Manual setup checklist (current UI flow — no Grow page):");
push("  1. Create a NEW dedicated test account through the normal /auth UI.");
push("     Do not reuse a personal/production grower account.");
push("  2. Sign in as that account and follow the in-app flow:");
push("       a. From the Dashboard, Add Tent.");
push("       b. Name the tent exactly 'E2E Test Tent'.");
push("       c. Open that tent and Add Plant.");
push("       d. Name the plant exactly 'E2E Test Plant'.");
push("       e. Copy the plant detail URL into vars.E2E_GROW_1_PLANT_URL.");
push("       f. (optional) Second plant: '505 Headbanger'.");
push("       g. (optional/future) Grow: 'E2E Test Grow' — only if the UI");
push("          visibly exposes a grow name or selector.");
push("  3. The plant URL must NOT point at verdantgrowdiary.com or any");
push("     real grower data.");
push("  4. Set vars.E2E_FIXTURE_MODE=true and the required expected name");
push("     vars (tent + plant) to match exactly. Grow name is optional.");
push("  5. (Optional) Set vars.E2E_FIXTURE_EXPECTED_ACCOUNT_HINT to a");
push("     short safe label (e.g. 'E2E'). NEVER use a password or token.");
push("  6. Run the workflow manually via workflow_dispatch and confirm");
push("     the 'Verify disposable E2E fixture' step passes before the");
push("     smoke step runs.");
push("  7. To rotate the account: create a new disposable account,");
push("     re-do steps 2–6, then update secrets.E2E_TEST_EMAIL and");
push("     secrets.E2E_TEST_PASSWORD. Do not remove the old account");
push("     through any in-app automation — handle externally.");
push();
push("See e2e/FIXTURE_SETUP.md for the full checklist including");
push("screenshot guidance and account rotation steps.");

console.log(lines.join("\n"));
