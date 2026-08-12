/**
 * Support/debug JSON export of the MCP connection status.
 *
 * Pure builder + serializer for the "Export status JSON" action on the
 * MCP status page (/settings/agent-integrations).
 *
 * SAFETY:
 * - Contains ONLY presenter-safe public metadata (manifest view, derived
 *   statuses, coarse booleans, sanitized attempt reasons). Never tokens,
 *   secrets, authorization codes, or raw error bodies.
 * - Fail-closed: `serializeConnectionStatusExport` re-scans its own
 *   output with the secret-pattern guard and refuses to produce a file
 *   if anything secret-like slipped in.
 * - Deterministic for identical inputs (timestamp is injected).
 */
import {
  MCP_MANIFEST,
  containsSecretLikeValue,
  type MCPManifestView,
} from "@/lib/mcp/manifestView";
import type { IssuerContext } from "@/lib/mcp/issuerSetupGuide";
import type { LocalToolPreferences } from "@/lib/mcp/localToolPreferences";
import type { OAuthAttemptRecord } from "@/lib/mcp/oauthAttemptLog";

export type ConnectionStatusExport = {
  exportKind: "verdant-mcp-connection-status";
  exportVersion: 1;
  exportedAt: string;
  server: {
    name: string;
    title: string;
    version: string;
    sdkVersion: string;
    manifestFingerprint: string;
  };
  endpoints: {
    mcpEndpoint: string;
    manifestUrl: string;
    consentUrl: string;
    setupGuidePath: string;
  };
  oauth: {
    /** Derived presenter status — configured / not_configured / unverified. */
    issuerContext: IssuerContext;
    issuer: string;
    acceptedAudiences: string[];
    /**
     * Last in-browser OAuth attempt (coarse metadata only), or null if
     * none was recorded in this browser.
     */
    lastAttempt: OAuthAttemptRecord | null;
  };
  orgContext: {
    /** Supabase project origin the endpoint is built from ("" when unset). */
    supabaseProjectOrigin: string;
    /** Project ref parsed from the issuer host, or null when unparseable. */
    projectRef: string | null;
    /** App origin this export was generated from ("" during SSR). */
    appOrigin: string;
  };
  browserConnection: {
    /** Whether this browser currently holds a live test-client OAuth token. */
    connectedInThisBrowser: boolean;
  };
  tools: Array<{
    name: string;
    title: string;
    readOnly: boolean;
    paramCount: number;
    /**
     * Server-side authorization is integration-wide: one OAuth consent
     * covers every advertised tool. This field is constant by design.
     */
    authorization: "integration-wide-oauth-grant";
    /** Local, this-browser-only preference. Does NOT change server access. */
    enabledInThisBrowser: boolean;
  }>;
  notes: string[];
};

export type ConnectionStatusExportInput = {
  manifest?: MCPManifestView;
  supabaseOrigin: string;
  appOrigin: string;
  issuerContext: IssuerContext;
  manifestFingerprint: string;
  connectedInThisBrowser: boolean;
  localToolPreferences: LocalToolPreferences;
  lastOAuthAttempt: OAuthAttemptRecord | null;
  /** Injected timestamp for deterministic tests. */
  exportedAt: string;
};

export function deriveProjectRef(issuer: string): string | null {
  try {
    const host = new URL(issuer).hostname;
    const first = host.split(".")[0];
    return first && first.length > 0 ? first : null;
  } catch {
    return null;
  }
}

export function buildConnectionStatusExport(
  input: ConnectionStatusExportInput,
): ConnectionStatusExport {
  const manifest = input.manifest ?? MCP_MANIFEST;
  const endpoint = input.supabaseOrigin ? `${input.supabaseOrigin}${manifest.path}` : manifest.path;
  const consentUrl = input.appOrigin
    ? `${input.appOrigin}${manifest.consentPath}`
    : manifest.consentPath;
  return {
    exportKind: "verdant-mcp-connection-status",
    exportVersion: 1,
    exportedAt: input.exportedAt,
    server: {
      name: manifest.serverName,
      title: manifest.serverTitle,
      version: manifest.version,
      sdkVersion: manifest.sdkVersion,
      manifestFingerprint: input.manifestFingerprint,
    },
    endpoints: {
      mcpEndpoint: endpoint,
      manifestUrl: endpoint,
      consentUrl,
      setupGuidePath: "/docs/mcp-api",
    },
    oauth: {
      issuerContext: input.issuerContext,
      issuer: manifest.oauthIssuer,
      acceptedAudiences: [...manifest.acceptedAudiences],
      lastAttempt: input.lastOAuthAttempt,
    },
    orgContext: {
      supabaseProjectOrigin: input.supabaseOrigin,
      projectRef: deriveProjectRef(manifest.oauthIssuer),
      appOrigin: input.appOrigin,
    },
    browserConnection: {
      connectedInThisBrowser: input.connectedInThisBrowser,
    },
    tools: manifest.tools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      readOnly: tool.readOnly,
      paramCount: tool.params.length,
      authorization: "integration-wide-oauth-grant" as const,
      enabledInThisBrowser: input.localToolPreferences[tool.name] !== false,
    })),
    notes: [
      "All tools are read-only and RLS-scoped to the signed-in grower.",
      "Server-side authorization is integration-wide; per-tool toggles above are local to one browser and do not change server access.",
      "This export contains no tokens, secrets, or credential material.",
    ],
  };
}

export type SerializedExport =
  { ok: true; json: string; filename: string } | { ok: false; error: string };

/**
 * Serialize with a fail-closed secret scan. The filename embeds the
 * export timestamp (colon-free) so support bundles sort naturally.
 */
export function serializeConnectionStatusExport(
  exportObj: ConnectionStatusExport,
): SerializedExport {
  const json = JSON.stringify(exportObj, null, 2);
  if (containsSecretLikeValue(json)) {
    return {
      ok: false,
      error: "Export blocked: payload matched a secret-like pattern. Nothing was downloaded.",
    };
  }
  const stamp = exportObj.exportedAt.replace(/[:.]/g, "-");
  return { ok: true, json, filename: `verdant-mcp-connection-status-${stamp}.json` };
}
