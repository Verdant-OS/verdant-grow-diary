#!/usr/bin/env bun
/**
 * Static operator checklist for the Ecowitt PC dry-run workflow.
 *
 * This script only prints deterministic guidance. It performs no network
 * calls, reads no environment variables, imports no clients, and writes no
 * files.
 */

const runbookPath = "docs/integrations/ecowitt-pc-dry-run-runbook.md";

const checklist = [
  "Verdant - Ecowitt PC dry-run checklist",
  "======================================",
  "",
  `Canonical runbook: ${runbookPath}`,
  "",
  "Purpose:",
  "- Keep the Ecowitt PC workflow dry-run-first and operator-reviewed.",
  "- Use the canonical runbook as the source of truth.",
  "- Print instructions only; do not send, store, or mutate anything.",
  "",
  "Operator flow:",
  "1. Confirm the Ecowitt gateway is posting to the local PC bridge.",
  "2. Confirm Mosquitto is receiving the local publish.",
  "3. Confirm MQTT Explorer sees payloads on the Ecowitt topic.",
  "4. Run the Verdant MQTT dry-run before any live send.",
  "5. Review the redacted dry-run report for fresh and valid readings.",
  "6. Only consider live send after a clean dry-run review.",
  "7. Verify Verdant source and freshness labels afterward.",
  "",
  "Dry-run command:",
  "bun run dev:ecowitt-mqtt:dry-run -- --once --write-report",
  "",
  "Live-send gate:",
  "- Do not run live send until the dry-run report is clean.",
  "- Live send remains manual and operator-approved.",
  "- Afterward, verify the Ecowitt source label and fresh/stale/invalid labels in Verdant.",
  "",
  "Never paste or expose:",
  "- Never paste the bridge token into chat.",
  "- Never paste service role keys.",
  "- Never paste API keys, webhook secrets, private env values, or raw token-bearing reports.",
  "",
  "Safety reminders:",
  "- Dry-run first.",
  "- No direct database writes.",
  "- No service role key.",
  "- No Action Queue.",
  "- No alert creation.",
  "- No automation.",
  "- No equipment/device control.",
  "- No Supabase client.",
  "- No provider calls.",
  "",
  "Expected local PC checks:",
  "- Ecowitt gateway posts locally to the PC bridge.",
  "- MQTT Explorer can inspect the Ecowitt payload stream.",
  "- Verdant dry-run reports redacted evidence before live send is considered.",
  "- Bad, stale, invalid, or unknown telemetry is never treated as healthy live context.",
].join("\n");

// eslint-disable-next-line no-console
console.log(checklist);
