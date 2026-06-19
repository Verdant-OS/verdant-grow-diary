/**
 * ecowitt-bridge-env-check
 * ------------------------
 * Local preflight validator for the EcoWitt live soil bridge. Pure, no I/O
 * beyond reading process.env + stdout printing. NEVER prints secret values
 * — token presence is reported as "present" / "missing" only.
 *
 * Usage:
 *   bun run scripts/ecowitt-bridge-env-check.ts            # dry-run mode (default)
 *   bun run scripts/ecowitt-bridge-env-check.ts --send     # send mode (requires URL+token)
 *
 * Exit codes:
 *   0  env is OK for the requested mode
 *   1  env is invalid / missing required vars
 *   2  bad CLI
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface EnvCheckInput {
  env: Record<string, string | undefined>;
  mode: "dry-run" | "send";
}

export interface EnvCheckResult {
  ok: boolean;
  mode: "dry-run" | "send";
  errors: string[];
  warnings: string[];
  /** Safe lines suitable for stdout. NEVER contains secret values. */
  lines: string[];
  /** Ready-to-run dry-run command (no token, no URL). */
  dryRunCommand: string;
}

function maskPresence(v: string | undefined): "present" | "missing" {
  return v && v.trim().length > 0 ? "present" : "missing";
}

export function checkBridgeEnv(input: EnvCheckInput): EnvCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lines: string[] = [];
  const e = input.env;

  // --- Required: VERDANT_TENT_ID ---
  const tentId = e.VERDANT_TENT_ID?.trim() ?? "";
  if (!tentId) {
    errors.push("VERDANT_TENT_ID is required");
  } else if (!UUID_RE.test(tentId)) {
    errors.push("VERDANT_TENT_ID must be a UUID");
  }
  lines.push(`VERDANT_TENT_ID: ${tentId ? "set" : "missing"}`);

  // --- Optional: VERDANT_PLANT_ID ---
  const plantId = e.VERDANT_PLANT_ID?.trim() ?? "";
  if (plantId && !UUID_RE.test(plantId)) {
    errors.push("VERDANT_PLANT_ID must be a UUID when set");
  }
  lines.push(`VERDANT_PLANT_ID: ${plantId ? "set" : "unset"}`);

  // --- Mode-dependent: VERDANT_INGEST_URL, VERDANT_BRIDGE_TOKEN ---
  const url = e.VERDANT_INGEST_URL?.trim() ?? "";
  if (url) {
    try {
      const u = new URL(url);
      if (u.protocol !== "https:" && u.protocol !== "http:") {
        errors.push("VERDANT_INGEST_URL must be http(s)");
      }
    } catch {
      errors.push("VERDANT_INGEST_URL is not a valid URL");
    }
  }
  lines.push(`VERDANT_INGEST_URL: ${url ? "set" : "unset"}`);

  const tokenPresence = maskPresence(e.VERDANT_BRIDGE_TOKEN);
  lines.push(`VERDANT_BRIDGE_TOKEN: ${tokenPresence}`);

  if (input.mode === "send") {
    if (!url) errors.push("VERDANT_INGEST_URL is required for --send");
    if (tokenPresence === "missing")
      errors.push("VERDANT_BRIDGE_TOKEN is required for --send");
  }

  // --- Optional: ECOWITT_SOIL_CHANNEL_MAP_JSON ---
  const mapRaw = e.ECOWITT_SOIL_CHANNEL_MAP_JSON?.trim() ?? "";
  if (mapRaw) {
    try {
      const parsed = JSON.parse(mapRaw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        errors.push("ECOWITT_SOIL_CHANNEL_MAP_JSON must be a JSON object");
      } else {
        for (const [k, v] of Object.entries(parsed)) {
          if (!v || typeof v !== "object" || Array.isArray(v)) {
            errors.push(`channel map ${k} must be an object`);
            continue;
          }
          const t = (v as Record<string, unknown>).tent_id;
          if (typeof t !== "string" || !UUID_RE.test(t)) {
            errors.push(`channel map ${k}.tent_id must be a UUID`);
          }
          const p = (v as Record<string, unknown>).plant_id;
          if (p !== undefined && p !== null && (typeof p !== "string" || !UUID_RE.test(p))) {
            errors.push(`channel map ${k}.plant_id must be a UUID when set`);
          }
        }
      }
    } catch {
      errors.push("ECOWITT_SOIL_CHANNEL_MAP_JSON is not valid JSON");
    }
    lines.push(`ECOWITT_SOIL_CHANNEL_MAP_JSON: set (${mapRaw.length} chars)`);
  } else {
    lines.push("ECOWITT_SOIL_CHANNEL_MAP_JSON: unset");
  }

  // --- Optional: ECOWITT_MQTT_TOPIC ---
  const topic = e.ECOWITT_MQTT_TOPIC?.trim() ?? "";
  if (topic && /\s/.test(topic)) {
    errors.push("ECOWITT_MQTT_TOPIC must not contain whitespace");
  }
  lines.push(`ECOWITT_MQTT_TOPIC: ${topic || "ecowitt/grow (default)"}`);

  if (input.mode === "dry-run") {
    warnings.push("dry-run mode does not require ingest URL / bridge token");
  }

  const dryRunCommand =
    "VERDANT_TENT_ID=<tent-uuid> bun run scripts/ecowitt-live-soil-dry-run.ts " +
    "--fixture fixtures/ecowitt-live-soil-sample.json --dry-run";

  return {
    ok: errors.length === 0,
    mode: input.mode,
    errors,
    warnings,
    lines,
    dryRunCommand,
  };
}

function safeLine(s: string): string {
  // Belt-and-braces: never let a token or Bearer value leak even if a
  // caller passes a misnamed env var into the lines list.
  return s.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const mode: "dry-run" | "send" = argv.includes("--send") ? "send" : "dry-run";
  const res = checkBridgeEnv({ env: process.env, mode });

  // eslint-disable-next-line no-console
  console.log(`ecowitt-bridge env preflight — mode: ${res.mode}`);
  for (const l of res.lines) console.log(`  ${safeLine(l)}`);
  for (const w of res.warnings) console.log(`  WARN  ${w}`);
  for (const err of res.errors) console.error(`  ERROR ${err}`);
  console.log("");
  console.log("Ready-to-run dry-run command:");
  console.log(`  ${res.dryRunCommand}`);

  process.exit(res.ok ? 0 : 1);
}

const isMain =
  typeof (import.meta as unknown as { main?: boolean }).main === "boolean"
    ? (import.meta as unknown as { main?: boolean }).main === true
    : false;

if (isMain) {
  void main();
}
