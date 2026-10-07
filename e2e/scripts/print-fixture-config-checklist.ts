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

const REQUIRED_SECRETS = ["E2E_TEST_EMAIL", "E2E_TEST_PASSWORD"] as const;

const REQUIRED_VARS = [
  "E2E_BASE_URL",
  "E2E_GROW_1_PLANT_URL",
  "E2E_FIXTURE_MODE",
  "E2E_FIXTURE_EXPECTED_TENT_NAME",
  "E2E_FIXTURE_EXPECTED_PLANT_NAME",
] as const;

const OPTIONAL_VARS = [
  "E2E_FIXTURE_EXPECTED_GROW_NAME",
  "E2E_GROW_1_SECOND_PLANT_NAME",
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
push("Production-only Quick Log fixture checklist:");
push("  1. Sign in through normal /auth as cheekhimself@gmail.com.");
push("     Never use matt@verdantgrowdiary.com, the KEEP account or customer data.");
push("  2. Use an existing disposable grow owned by that account, with its own");
push("     active tent and plant. Each exact name must contain E2E, Test or QA.");
push("     Ownership of all three records is verified from normal app reads.");
push("     A visible name or readable customer row does not establish ownership.");
push("  3. The plant URL must be https://verdantgrowdiary.com/plants/<UUID>.");
push("     Optional tentId/growId UUID query values must match its owned records.");
push("     No alternate host, URL credentials, unknown query keys or fragment.");
push("  4. Set vars.E2E_FIXTURE_MODE=true and exact tent and plant names.");
push("     Grow name is optional: when absent, it comes only from the verified");
push("     owned grow read, with E2E/Test/QA markers. A configured name must match.");
push("  5. Configure a second plant in the same tent/grow: 'E2E Test Plant 2',");
push("     or its exact fixture name through E2E_GROW_1_SECOND_PLANT_NAME.");
push("     If an account hint is configured, use cheekhimself@gmail.com only.");
push("     NEVER put a password or token in a variable or checklist.");
push("  6. Keep optional bootstrap off; its generic production-host refusal");
push("     is unchanged. Missing or contradictory ownership blocks both saves.");
push("  7. Every saved note is tagged [smoke <timestamp>]. This checklist");
push("     does not authorize creating accounts, deleting fixtures or dispatching.");
push();
push("Legacy generic fixture setup docs are not production authorization.");
push("Do not rotate or provision credentials through automation.");

console.log(lines.join("\n"));
