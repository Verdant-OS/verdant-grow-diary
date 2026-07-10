#!/usr/bin/env node
/**
 * run-pheno-disabled-compare-e2e — env-aware runner for the Pheno disabled-
 * Compare E2E suite.
 *
 * SAFETY:
 *  - Read-only. Never logs fixture VALUES (which are hunt IDs and could
 *    leak in CI logs). Prints only present/missing status.
 *  - Exits 0 with a clear SKIPPED message when no fixture env vars are
 *    provided — CI must not falsely claim E2E passed.
 *
 * Behavior:
 *  1. Reads the fixture env vars.
 *  2. Prints a summary table of present/skipped fixtures + reasons.
 *  3. If at least one fixture is present, runs the disabled-Compare specs.
 *  4. If none are present, prints SKIPPED and exits 0.
 */
import { spawn } from "node:child_process";

const FIXTURES = [
  { key: "E2E_PHENO_HUNT_ID_MISSING_EVIDENCE", label: "Missing evidence" },
  { key: "E2E_PHENO_HUNT_ID_PENDING_HARVEST", label: "Pending harvest" },
  { key: "E2E_PHENO_HUNT_ID_PENDING_CURE", label: "Pending cure" },
  { key: "E2E_PHENO_HUNT_ID_REPLICATION_PENDING", label: "Replication pending" },
];

const SPECS = [
  "e2e/pheno-disabled-compare-workspace-navigation.spec.ts",
  "e2e/pheno-disabled-compare-visual-regression.spec.ts",
];

function classify(key) {
  const raw = process.env[key];
  if (typeof raw !== "string" || raw.trim() === "") {
    return { present: false, reason: `${key} not set` };
  }
  return { present: true, reason: null };
}

function printTable(rows) {
  const nameWidth = Math.max(...rows.map((r) => r.label.length));
  const keyWidth = Math.max(...rows.map((r) => r.key.length));
  const line = (l, k, s, r) =>
    `  ${l.padEnd(nameWidth)}  ${k.padEnd(keyWidth)}  ${s.padEnd(8)}  ${r ?? ""}`;
  console.log(line("Fixture", "Env var", "Status", "Reason"));
  console.log(
    `  ${"-".repeat(nameWidth)}  ${"-".repeat(keyWidth)}  ${"-".repeat(8)}  ${"-".repeat(24)}`,
  );
  for (const r of rows) {
    console.log(
      line(r.label, r.key, r.present ? "PRESENT" : "SKIPPED", r.reason),
    );
  }
}

function main() {
  const rows = FIXTURES.map((f) => ({ ...f, ...classify(f.key) }));

  console.log("Pheno disabled-Compare E2E — fixture summary");
  console.log("");
  printTable(rows);
  console.log("");

  const presentCount = rows.filter((r) => r.present).length;
  if (presentCount === 0) {
    console.log(
      "SKIPPED: no E2E_PHENO_HUNT_ID_* fixture env vars provided. " +
        "Not running Playwright. Not claiming E2E passed.",
    );
    console.log(
      "Set at least one of the fixture env vars above to run the suite.",
    );
    process.exit(0);
  }

  console.log(
    `Running Pheno disabled-Compare E2E with ${presentCount}/${FIXTURES.length} fixtures present.`,
  );
  console.log(
    "Scenarios whose fixture env var is missing will skip cleanly with a Playwright-reported reason.",
  );
  console.log("");

  const child = spawn("bunx", ["playwright", "test", ...SPECS], {
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code) => process.exit(code ?? 1));
  child.on("error", (err) => {
    console.error(`Failed to launch Playwright: ${err.message}`);
    console.error(
      "If Playwright browser binaries are missing, this step is BLOCKED (not passed).",
    );
    process.exit(1);
  });
}

main();
