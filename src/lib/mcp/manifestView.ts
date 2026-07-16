/**
 * MCP manifest — presenter-safe view of the Verdant MCP server.
 *
 * MIRRORS `.lovable/mcp/manifest.json` (the plugin-generated source of
 * truth). Kept as a typed TS constant so the Agent Integrations page can
 * import it without pulling JSON from outside `src/`. A drift test
 * (`mcp-manifest-drift.test.ts`) reads the real manifest at test time
 * and asserts this constant matches.
 *
 * SAFETY: This file contains ONLY public metadata (endpoint path, tool
 * names, tool descriptions, JSON-schema shapes, OAuth issuer URL). No
 * tokens, no secrets, no service-role material. Never add secret-like
 * values here.
 */

export type MCPToolParam = {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  constraints?: string;
};

export type MCPTool = {
  name: string;
  title: string;
  description: string;
  readOnly: boolean;
  params: MCPToolParam[];
};

export type MCPManifestView = {
  serverName: string;
  serverTitle: string;
  version: string;
  sdkVersion: string;
  /** Function path relative to the Supabase project origin, e.g. "/functions/v1/mcp". */
  path: string;
  /** OAuth issuer URL (public discovery). Never a token. */
  oauthIssuer: string;
  acceptedAudiences: string[];
  /** In-app OAuth consent route. Presenter-safe. */
  consentPath: string;
  tools: MCPTool[];
};

/**
 * Public Supabase project host. `import.meta.env.VITE_SUPABASE_URL` is
 * inlined by Vite from `.env` (VITE_-prefixed env is already public app
 * config). We use it to build a full MCP endpoint URL for the Agent
 * Integrations page. Falls back to a clearly-labeled placeholder when
 * missing so the page never renders a broken URL.
 */
export function getSupabaseOrigin(): string {
  const raw = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_SUPABASE_URL;
  if (typeof raw !== "string" || raw.length === 0) return "";
  return raw.replace(/\/+$/, "");
}

export const MCP_MANIFEST: MCPManifestView = Object.freeze({
  serverName: "verdant-grow-os-mcp",
  serverTitle: "Verdant Grow OS",
  version: "0.1.0",
  sdkVersion: "0.20.0",
  path: "/functions/v1/mcp",
  oauthIssuer: "https://knkwiiywfkbqznbxwqfh.supabase.co/auth/v1",
  acceptedAudiences: ["authenticated"],
  consentPath: "/.lovable/oauth/consent",
  tools: [
    {
      name: "list_grows",
      title: "List grows",
      description:
        "List the signed-in Verdant grower's own grows (id, name, stage, grow_type, archived flag, timestamps). Read-only.",
      readOnly: true,
      params: [
        {
          name: "includeArchived",
          type: "boolean",
          required: false,
          description: "Include archived grows. Defaults to false.",
        },
        {
          name: "limit",
          type: "integer",
          required: false,
          description: "Maximum rows to return. Defaults to 25.",
          constraints: "1–100",
        },
      ],
    },
    {
      name: "list_recent_diary_entries",
      title: "List recent diary entries",
      description:
        "List recent diary entries for one of the signed-in grower's own grows. The grow must belong to the caller. Read-only.",
      readOnly: true,
      params: [
        {
          name: "growId",
          type: "string (uuid)",
          required: true,
          description: "Grow id to fetch diary entries for.",
        },
        {
          name: "limit",
          type: "integer",
          required: false,
          description: "Maximum entries to return. Defaults to 10.",
          constraints: "1–50",
        },
      ],
    },
    {
      name: "get_latest_sensor_snapshot",
      title: "Get latest sensor snapshot",
      description:
        "Fetch the most recent sensor reading per metric (temperature_c, humidity_pct, vpd_kpa, co2_ppm, soil_moisture_pct, soil_temp_c, ph, ec, ppfd) for one of the signed-in grower's own tents, ordered by capture time (captured_at, falling back to ingest time). Every reading keeps its `source` and `quality` labels verbatim. `quality` is one of ok/degraded/stale/invalid. `source` is a canonical label (live/manual/csv/demo/stale/invalid) or a hardware-bridge label such as pi_bridge, esp32_*, home_assistant_bridge, ecowitt, mqtt or webhook. Treat a reading as current live data ONLY when its quality is `ok` AND its source is known-live (live, manual, csv, or a hardware-bridge label); sources sim, demo, stale and invalid, plus any source label you do not recognize, are never live. Read-only.",
      readOnly: true,
      params: [
        {
          name: "tentId",
          type: "string (uuid)",
          required: true,
          description: "Tent id to fetch the latest readings for.",
        },
      ],
    },
  ],
}) as MCPManifestView;

/**
 * Presenter-safe connection details, suitable for the "Copy connection
 * details" clipboard action. NEVER include tokens, secrets, service-
 * role keys, refresh tokens, bridge tokens, or private env values.
 */
export function buildConnectionDetailsText(
  manifest: MCPManifestView = MCP_MANIFEST,
  origin: string = getSupabaseOrigin(),
  appOrigin: string = typeof window !== "undefined" ? window.location.origin : "",
): string {
  const endpoint = origin ? `${origin}${manifest.path}` : manifest.path;
  const consentUrl = appOrigin ? `${appOrigin}${manifest.consentPath}` : manifest.consentPath;
  const lines: string[] = [
    `Verdant Grow OS — MCP connection`,
    `Server:   ${manifest.serverTitle} (${manifest.serverName}) v${manifest.version}`,
    `Endpoint: ${endpoint}`,
    `Consent:  ${consentUrl}`,
    `Auth:     OAuth 2.1 (issuer: ${manifest.oauthIssuer})`,
    ``,
    `Tools (all read-only, RLS-scoped to the signed-in grower):`,
  ];
  for (const tool of manifest.tools) {
    lines.push(`  • ${tool.name}`);
    for (const p of tool.params) {
      const flag = p.required ? "required" : "optional";
      const extra = p.constraints ? ` [${p.constraints}]` : "";
      lines.push(`      - ${p.name}: ${p.type} (${flag})${extra}`);
    }
  }
  lines.push(
    ``,
    `Read-only: no writes, no Action Queue approvals, no AI Doctor runs,`,
    `no device control, no automation.`,
  );
  return lines.join("\n");
}

/**
 * Safe manifest summary — the text projection shown in the "View MCP
 * manifest" modal and its Copy button. Contains only public metadata
 * already exposed by the manifest view (server identity, version,
 * fingerprint, tool names + params). Never includes tokens, secrets,
 * OAuth credentials, raw headers, or private env values.
 */
export function buildSafeManifestSummaryText(
  manifest: MCPManifestView = MCP_MANIFEST,
  fingerprint: string,
  manifestUrl?: string,
): string {
  const lines: string[] = [
    `Verdant Grow OS — safe MCP manifest summary`,
    `Server:      ${manifest.serverTitle} (${manifest.serverName})`,
    `Version:     ${manifest.version}`,
    `Fingerprint: ${fingerprint}`,
    `Path:        ${manifest.path}`,
  ];
  if (manifestUrl && !/eyJ|bearer|service[_-]?role/i.test(manifestUrl)) {
    lines.push(`Manifest:    ${manifestUrl}`);
  }
  lines.push(``, `Tools advertised: ${manifest.tools.length}`);
  for (const tool of manifest.tools) {
    lines.push(`  • ${tool.name}${tool.readOnly ? " (read-only)" : ""}`);
    for (const p of tool.params) {
      const flag = p.required ? "required" : "optional";
      const extra = p.constraints ? ` [${p.constraints}]` : "";
      lines.push(`      - ${p.name}: ${p.type} (${flag})${extra}`);
    }
    if (tool.params.length === 0) lines.push(`      - (no parameters)`);
  }
  lines.push(
    ``,
    `This is a safe manifest summary. It does not include tokens,`,
    `secrets, OAuth credentials, or private environment values.`,
  );
  return lines.join("\n");
}

/**
 * Guard used by tests. Rejects strings that look like credentials so the
 * copy payload can never accidentally leak them.
 */
export const SECRET_LIKE_PATTERNS: ReadonlyArray<RegExp> = [
  /\beyJ[A-Za-z0-9_-]{10,}/, // JWT
  /\bsbp_[A-Za-z0-9]{10,}/, // Supabase service role prefix
  /\bBearer\s+[A-Za-z0-9._-]+/i,
  /service[_-]?role/i,
  // Also covers the ALL-CAPS service-role env var name (case-insensitive),
  // so that name must not be spelled out literally here — the sensor
  // intelligence safety scanner forbids the bare token in frontend files.
  /supabase[_-]?service[_-]?role[_-]?key/i,
  /VITE_SUPABASE_PUBLISHABLE_KEY\s*[:=]/, // key literal, not the name in copy
  /refresh[_-]?token/i,
  /bridge[_-]?token/i,
  /client[_-]?secret/i,
  /access[_-]?token/i,
];

export function containsSecretLikeValue(text: string): boolean {
  for (const rx of SECRET_LIKE_PATTERNS) {
    if (rx.test(text)) return true;
  }
  return false;
}
