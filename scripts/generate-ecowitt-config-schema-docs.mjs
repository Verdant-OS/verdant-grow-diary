#!/usr/bin/env node
/**
 * Generate `docs/ecowitt-bridge-config-schema.md` from the authoritative
 * validator sources:
 *
 *  - `docs/schemas/ecowitt-soil-channel-map.schema.json`
 *      Single source of truth for `ECOWITT_SOIL_CHANNEL_MAP_JSON` shape,
 *      value ranges, and per-field descriptions.
 *
 *  - `scripts/ecowitt-live-soil-bridge.ts`
 *      Single source of truth for the env-var contract read by
 *      `readBridgeEnv` and enforced by `runConfigValidate`. The env-var
 *      registry below is grep-verified against that file at generate
 *      time — any drift (env var referenced in the CLI but missing from
 *      this registry, or vice versa) fails the generator.
 *
 * Usage:
 *   node scripts/generate-ecowitt-config-schema-docs.mjs         # write
 *   node scripts/generate-ecowitt-config-schema-docs.mjs --check # drift gate
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SCHEMA_PATH = resolve(ROOT, "docs/schemas/ecowitt-soil-channel-map.schema.json");
const CLI_PATH = resolve(ROOT, "scripts/ecowitt-live-soil-bridge.ts");
const OUT_PATH = resolve(ROOT, "docs/ecowitt-bridge-config-schema.md");

/**
 * Curated env-var registry. Order matches operator workflow (identity
 * first, then transport, then payload). Every entry is verified below to
 * appear in `scripts/ecowitt-live-soil-bridge.ts` — the CLI is the
 * runtime source of truth; this table only labels and describes.
 */
const ENV_VARS = [
  {
    name: "VERDANT_TENT_ID",
    type: "UUID (v4 shape)",
    required: true,
    default: "—",
    validator: "runConfigValidate → missing_tent_id / invalid_tent_id_format",
    description:
      "Tent this bridge process writes for. One bridge process → one tent. Must match every `tent_id` in `ECOWITT_SOIL_CHANNEL_MAP_JSON`.",
    example: "11111111-1111-4111-8111-111111111111",
  },
  {
    name: "VERDANT_PLANT_ID",
    type: "UUID (v4 shape) or unset",
    required: false,
    default: "unset",
    validator: "readBridgeEnv (passthrough)",
    description:
      "Optional default plant to attribute soil readings to when a channel map entry does not specify `plant_id`.",
    example: "22222222-2222-4222-8222-222222222222",
  },
  {
    name: "VERDANT_INGEST_URL",
    type: "https URL",
    required: "when running (not for `config validate`)",
    default: "—",
    validator: "runCli startup → missing_ingest_url",
    description:
      "Fully-qualified HTTPS endpoint the bridge POSTs canonical payloads to. Only host+protocol are shown in redacted `config_effective` output.",
    example: "https://ingest.verdantgrowdiary.com/ecowitt",
  },
  {
    name: "VERDANT_BRIDGE_TOKEN",
    type: "opaque secret string",
    required: "when running (not for `config validate`)",
    default: "—",
    validator: "runCli startup → missing_bridge_token",
    description:
      "One-tent-scoped bearer token authenticating this bridge to the ingest endpoint. Never printed — length-masked in redacted output.",
    example: "vbt_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  },
  {
    name: "ECOWITT_SOIL_CHANNEL_MAP_JSON",
    type: "JSON object (see schema section)",
    required: true,
    default: "—",
    validator:
      "assertEcowittSoilChannelMapJsonEnv (schema) + assertSingleTentSoilChannelMap",
    description:
      "Maps `soilmoisture<N>` channel keys to the single tent this bridge serves. Full shape, ranges, and per-field docs come from the JSON Schema below.",
    example:
      '{"soilmoisture1":{"tent_id":"11111111-1111-4111-8111-111111111111","label":"Front-left"}}',
  },
  {
    name: "ECOWITT_BRIDGE_DRY_RUN",
    type: '"1" | unset',
    required: false,
    default: "unset",
    validator: "readBridgeEnv (alias for `--dry-run`)",
    description:
      "Alternative way to enable dry-run mode without passing `--dry-run`. Any other value is ignored.",
    example: "1",
  },
  {
    name: "ECOWITT_MQTT_URL",
    type: "mqtt(s):// URL",
    required: "when running (either this OR HOST+PORT)",
    default: "unset",
    validator: "runMqttBridge (URL takes precedence over HOST+PORT)",
    description:
      "Full MQTT broker URL. When set, `ECOWITT_MQTT_HOST` and `ECOWITT_MQTT_PORT` are ignored.",
    example: "mqtt://broker.local:1883",
  },
  {
    name: "ECOWITT_MQTT_HOST",
    type: "hostname",
    required: false,
    default: "127.0.0.1",
    validator: "runMqttBridge (used only when `ECOWITT_MQTT_URL` is unset)",
    description: "MQTT broker hostname. Combined with `ECOWITT_MQTT_PORT` to form the connection URL.",
    example: "broker.local",
  },
  {
    name: "ECOWITT_MQTT_PORT",
    type: "port number (string)",
    required: false,
    default: "1883",
    validator: "runMqttBridge (used only when `ECOWITT_MQTT_URL` is unset)",
    description: "MQTT broker port. Combined with `ECOWITT_MQTT_HOST`.",
    example: "1883",
  },
  {
    name: "ECOWITT_MQTT_TOPIC",
    type: "MQTT topic",
    required: false,
    default: "ecowitt/grow",
    validator: "runMqttBridge (passthrough)",
    description:
      "MQTT topic the bridge subscribes to for EcoWitt raw payloads. Must match the topic configured on the EcoWitt gateway.",
    example: "ecowitt/grow",
  },
  {
    name: "ECOWITT_MQTT_USERNAME",
    type: "string",
    required: false,
    default: "unset",
    validator: "runMqttBridge (passthrough)",
    description:
      "Optional MQTT broker username. Only `username_present: true|false` is echoed in logs — the value itself is never printed.",
    example: "verdant-bridge",
  },
  {
    name: "ECOWITT_MQTT_PASSWORD",
    type: "secret string",
    required: false,
    default: "unset",
    validator: "runMqttBridge (passthrough)",
    description:
      "Optional MQTT broker password. Only `password_present: true|false` is echoed in logs — the value itself is never printed.",
    example: "••••••••",
  },
];

function loadSchema() {
  return JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
}

/**
 * Verify every env var listed above is actually referenced in the CLI
 * source. This is the drift gate: a rename in the validator that isn't
 * reflected here fails generation.
 */
function verifyEnvRegistryAgainstCli() {
  const cli = readFileSync(CLI_PATH, "utf8");
  const missing = ENV_VARS.filter((v) => !cli.includes(v.name));
  if (missing.length > 0) {
    throw new Error(
      `Env vars in the doc registry are not referenced in ${CLI_PATH}: ${missing
        .map((v) => v.name)
        .join(", ")}`,
    );
  }
  // Reverse direction: any `env.XYZ` / `env["XYZ"]` read in the CLI
  // that we don't document. We look only at the `env.` accessor pattern
  // used by `readBridgeEnv` to keep the check tight.
  const referenced = new Set();
  const re = /env\.([A-Z][A-Z0-9_]+)/g;
  let m;
  while ((m = re.exec(cli)) !== null) referenced.add(m[1]);
  const knownIrrelevant = new Set(); // none right now
  const undocumented = [...referenced].filter(
    (n) =>
      !ENV_VARS.some((v) => v.name === n) &&
      !knownIrrelevant.has(n),
  );
  if (undocumented.length > 0) {
    throw new Error(
      `Env vars referenced in ${CLI_PATH} but missing from the doc registry: ${undocumented.join(
        ", ",
      )}. Add them to ENV_VARS in scripts/generate-ecowitt-config-schema-docs.mjs.`,
    );
  }
}

function renderEnvRow(v) {
  const req =
    v.required === true ? "yes" : v.required === false ? "no" : v.required;
  return `| \`${v.name}\` | ${v.type} | ${req} | ${v.default} | ${v.validator} |`;
}

function renderChannelMapFields(schema) {
  const entry =
    schema.patternProperties["^soilmoisture([1-9]|[1-9][0-9])$"];
  const rows = [];
  for (const [name, def] of Object.entries(entry.properties)) {
    const required = entry.required.includes(name) ? "yes" : "no";
    const types = Array.isArray(def.type) ? def.type.join(" \\| ") : def.type;
    const constraints = [];
    if (def.pattern) constraints.push(`pattern \`${def.pattern}\``);
    if (typeof def.maxLength === "number")
      constraints.push(`maxLength ${def.maxLength}`);
    rows.push(
      `| \`${name}\` | ${types} | ${required} | ${
        constraints.join(", ") || "—"
      } | ${def.description ?? ""} |`,
    );
  }
  return rows.join("\n");
}

function render() {
  const schema = loadSchema();
  const generatedAt = new Date().toISOString();
  const envRows = ENV_VARS.map(renderEnvRow).join("\n");
  const channelRows = renderChannelMapFields(schema);
  const keyPattern = schema.propertyNames.pattern;

  return `# EcoWitt bridge config schema reference

_Generated file — do not edit by hand. Regenerate with:_

\`\`\`bash
node scripts/generate-ecowitt-config-schema-docs.mjs
\`\`\`

_Sources of truth:_

- Env-var contract: [\`scripts/ecowitt-live-soil-bridge.ts\`](../scripts/ecowitt-live-soil-bridge.ts) (\`readBridgeEnv\`, \`runConfigValidate\`)
- Channel-map shape: [\`docs/schemas/ecowitt-soil-channel-map.schema.json\`](./schemas/ecowitt-soil-channel-map.schema.json) (JSON Schema draft 2020-12)
- Startup check order, error codes, and remediation: [\`docs/ecowitt-bridge-startup-validation.md\`](./ecowitt-bridge-startup-validation.md)

Generated at: \`${generatedAt}\`

---

## Environment variables

| Name | Type | Required | Default | Validator |
| --- | --- | --- | --- | --- |
${envRows}

### Details

${ENV_VARS.map(
    (v) =>
      `#### \`${v.name}\`\n\n${v.description}\n\n**Example:**\n\n\`\`\`bash\n${v.name}='${v.example}'\n\`\`\`\n`,
  ).join("\n")}

---

## \`ECOWITT_SOIL_CHANNEL_MAP_JSON\` schema

**\`$id\`:** \`${schema.$id}\`

${schema.description}

### Top-level object

- Type: \`${schema.type}\`
- \`additionalProperties\`: \`${schema.additionalProperties}\`
- \`minProperties\`: \`${schema.minProperties}\` (empty map is valid — the bridge will accept it and simply forward nothing until a mapping is added)
- Allowed property names: match \`${keyPattern}\` (i.e. \`soilmoisture1\` through \`soilmoisture99\`)

### Per-channel entry fields

| Field | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
${channelRows}

### Valid example

\`\`\`json
{
  "soilmoisture1": {
    "tent_id": "11111111-1111-4111-8111-111111111111",
    "plant_id": "22222222-2222-4222-8222-222222222222",
    "label": "Front-left probe"
  },
  "soilmoisture2": {
    "tent_id": "11111111-1111-4111-8111-111111111111",
    "label": "Back-right probe"
  }
}
\`\`\`

Every \`tent_id\` in the map **must** equal \`VERDANT_TENT_ID\`. Mixed-tent maps are rejected with error code \`mixed_tent_channel_map\` — see the [startup validation doc](./ecowitt-bridge-startup-validation.md) for the full error-code catalog and fix hints.

### Rejected example (mixed tents)

\`\`\`json
{
  "soilmoisture1": { "tent_id": "11111111-1111-4111-8111-111111111111" },
  "soilmoisture2": { "tent_id": "99999999-9999-4999-8999-999999999999" }
}
\`\`\`

Fails \`assertSingleTentSoilChannelMap\` with \`code=mixed_tent_channel_map\` and a \`fields\` diagnostic pointing at \`$.soilmoisture2.tent_id\`.

---

## Quick operator workflow

\`\`\`bash
cp examples/ecowitt-bridge/.env.example .env
# edit .env — fill in VERDANT_TENT_ID, VERDANT_BRIDGE_TOKEN, channel map
node scripts/ecowitt-live-soil-bridge.ts config validate --fix-hints
node scripts/ecowitt-live-soil-bridge.ts config validate --dry-run --out=./effective.json
\`\`\`

For the full error-code catalog and machine-readable envelope shape, see [\`docs/ecowitt-bridge-startup-validation.md\`](./ecowitt-bridge-startup-validation.md).
`;
}

function main() {
  const check = process.argv.includes("--check");
  verifyEnvRegistryAgainstCli();
  const next = render();
  if (check) {
    let current = "";
    try {
      current = readFileSync(OUT_PATH, "utf8");
    } catch {
      current = "";
    }
    // The generatedAt timestamp changes every run; normalize before diff.
    const normalize = (s) =>
      s.replace(/Generated at: `[^`]*`/g, "Generated at: `<ts>`");
    if (normalize(current) !== normalize(next)) {
      console.error(
        `[check] ${OUT_PATH} is stale. Run:\n  node scripts/generate-ecowitt-config-schema-docs.mjs`,
      );
      process.exit(1);
    }
    console.log(`[check] ${OUT_PATH} is up to date`);
    return;
  }
  writeFileSync(OUT_PATH, next, "utf8");
  console.log(`wrote ${OUT_PATH}`);
}

main();
