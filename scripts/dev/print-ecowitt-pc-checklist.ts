#!/usr/bin/env bun
/**
 * Print the Ecowitt PC dry-run checklist for the local
 * Ecowitt gateway → ecowitt2mqtt → Mosquitto → MQTT Explorer → Verdant
 * dry-run workflow.
 *
 * SAFETY:
 *   - prints static instructions ONLY
 *   - never reads, prints, or echoes any secret or env value
 *   - never calls Supabase, admin APIs, or any network
 *   - never writes, creates, modifies, or removes any file or data
 *   - requires no env vars to run
 *
 * Companion doc: docs/integrations/ecowitt-pc-dry-run-runbook.md
 */

const lines: string[] = [];
const push = (s = "") => lines.push(s);

push("Verdant — Ecowitt PC dry-run checklist");
push("=".repeat(60));
push();
push("This script prints instructions ONLY.");
push("It never reads or prints any secret, token, or env value.");
push("It never calls the network and never writes any file.");
push();
push("Pipeline:");
push("  Ecowitt gateway -> ecowitt2mqtt -> Mosquitto -> MQTT Explorer");
push("  -> Verdant dry-run -> (gated) live ingest webhook");
push();
push("A. Required local tools:");
push("  - Mosquitto (local MQTT broker on 127.0.0.1:1883)");
push("  - ecowitt2mqtt (Ecowitt custom upload -> MQTT)");
push("  - MQTT Explorer (inspect the ecowitt/grow topic)");
push("  - This Verdant repo with Bun installed");
push();
push("B. Start the local pipeline:");
push("  Terminal 1:  mosquitto -v");
push("  Terminal 2:  ecowitt2mqtt --mqtt-broker 127.0.0.1 \\");
push("                 --mqtt-port 1883 --mqtt-topic ecowitt/grow");
push();
push("C. Ecowitt app settings (Customized upload):");
push("  - Protocol:   Ecowitt / custom upload");
push("  - Server/IP:  your PC local IPv4 (e.g. 192.168.x.x)");
push("  - Port:       whichever port ecowitt2mqtt is listening on");
push("  - Path:       /data/report");
push("  - Interval:   60 seconds");
push();
push("D. Confirm in MQTT Explorer:");
push("  - connect to 127.0.0.1:1883");
push("  - subscribe / watch ecowitt/#");
push("  - confirm target topic: ecowitt/grow");
push();
push("E. Run the Verdant dry-run (no network call, no DB write):");
push("  bun run dev:ecowitt-mqtt:dry-run -- --sample --once");
push("  bun run dev:ecowitt-mqtt:dry-run -- --once");
push("  bun run dev:ecowitt-mqtt:dry-run -- --once --write-report");
push();
push("F. What to paste back for review:");
push("  Topic: ecowitt/grow");
push("  Redacted payload: { ... }");
push("  Dry-run report:   { ... }");
push();
push("G. What to NEVER paste:");
push("  - VERDANT_BRIDGE_TOKEN (the bridge token)");
push("  - Supabase service keys / the service role key");
push("  - any private env values");
push("  - raw, unredacted, token-bearing reports");
push();
push("H. Live send is allowed ONLY after the dry-run report confirms:");
push("  - fresh timestamp");
push("  - valid temp / humidity / soil / CO2 values");
push("  - no invalid / stale classification");
push("  - trust would resolve to Live only through fresh_live");
push("  - the redacted report is clean");
push();
push("I. Real send command (gated behind a clean dry-run above):");
push("  bun run dev:ecowitt-mqtt -- --once");
push();
push("J. Verify in Verdant:");
push("  - Provider chip: Ecowitt");
push("  - Trust badge: Live only if fresh + valid");
push("  - Stale / Invalid never attachable as live context");
push("  - Quick Log snapshot strip shows the correct badge");
push();
push("Safety: dry-run does no network call and no direct database writes.");
push("Stale / invalid / unknown telemetry is never promoted to Live.");
push();
push("Full runbook: docs/integrations/ecowitt-pc-dry-run-runbook.md");

// eslint-disable-next-line no-console
console.log(lines.join("\n"));
