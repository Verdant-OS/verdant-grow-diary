#!/usr/bin/env bun
/**
 * Static operator checklist for the Ecowitt PC dry-run workflow.
 *
 * This script only prints deterministic guidance. It performs no network
 * calls, reads no environment variables, imports no clients, and writes no
 * files.
 */

const runbookPath = "docs/ecowitt-live-soil-bridge.md";
const canonicalDryRunCommand =
  "bun run scripts/ecowitt-live-soil-bridge.ts --dry-run --once";

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
  "4. Set VERDANT_TENT_ID and ECOWITT_SOIL_CHANNEL_MAP_JSON for the same one tent.",
  "5. Run the Verdant one-message dry-run before any live send.",
  "6. Review the redacted dry-run output for fresh and valid readings.",
  "7. Only consider live send after a clean dry-run review.",
  "8. Verify Verdant source and freshness labels afterward.",
  "",
  "Dry-run command:",
  canonicalDryRunCommand,
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
  "- Verdant's one-message dry-run prints redacted evidence before live send is considered.",
  "- Every mapped soil channel belongs to the same one tent as VERDANT_TENT_ID.",
  "- Bad, stale, invalid, or unknown telemetry is never treated as healthy live context.",
].join("\n");

// eslint-disable-next-line no-console
console.log(checklist);
