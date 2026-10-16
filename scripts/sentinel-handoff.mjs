#!/usr/bin/env node
// Explicit host bridge; no background loop and no outbound transport built in.
import { runCommand } from "./lib/sentinelHandoffJournal.mjs";
import { readBoundedJson } from "./lib/sentinelHandoffJson.mjs";

try {
  const [policyPath, journalDir, commandPath, ...extra] = process.argv.slice(2);
  if (!policyPath || !journalDir || !commandPath || extra.length) {
    throw new Error(
      "USAGE: node scripts/sentinel-handoff.mjs <trusted-policy.json> <journal-directory> <host-command.json>",
    );
  }
  const result = runCommand({
    journalDir,
    policy: readBoundedJson(policyPath),
    command: readBoundedJson(commandPath),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  // Keep raw filesystem/JSON/transport details out of messages and receipts.
  const code = /^[A-Z_]+(?=:|$)/.exec(error.message)?.[0] ?? "JOURNAL_IO_OR_INPUT_ERROR";
  process.stderr.write(
    `BLOCKED: ${code}. Preserve the journal and reconcile with its sole holder.\n`,
  );
  process.exitCode = 2;
}
