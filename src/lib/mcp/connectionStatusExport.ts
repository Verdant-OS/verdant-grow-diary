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
    /** Supabase project ref from the issuer host; null unless the issuer is a *.supabase.co host. */
    projectRef: string | null;
    /** App origin this export was generated from ("" during SSR). */
    appOrigin: string;
  };
  browserConnection: {
    /**
     * Whether this browser holds an unexpired (by local clock)
     * test-client OAuth token in sessionStorage. Presence is not a
     * liveness or revocation check against the server.
     */
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
    // Only claim a project ref for real Supabase hosts. Localhost, IPs,
    // and custom domains would otherwise yield confident nonsense
    // ("127", "localhost") in a support artifact.
    const match = /^([a-z0-9-]+)\.supabase\.co$/i.exec(host);
    return match ? match[1].toLowerCase() : null;
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
      "issuerContext is derived from the app's committed manifest copy; no live endpoint or issuer verification was performed for this export.",
      "Built from public metadata and sanitized attempt reasons only; the payload is scanned against known secret patterns and the download is refused on any match.",
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
