/**
 * Agent Integrations settings page.
 *
 * Presenter-only. Shows public metadata about the Verdant MCP server
 * (endpoint, OAuth consent route, tool list, read-only safety copy)
 * sourced from `src/lib/mcp/manifestView.ts`. Never exposes tokens,
 * secrets, service-role keys, or private env values.
 *
 * Route: /settings/agent-integrations
 */
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Copy, ExternalLink, ShieldCheck, FileText } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePageSeo } from "@/hooks/usePageSeo";
import ManifestSummaryModal from "@/components/mcp/ManifestSummaryModal";
import {
  MCP_MANIFEST,
  buildConnectionDetailsText,
  getSupabaseOrigin,
} from "@/lib/mcp/manifestView";
import {
  computeManifestHash,
  shortenManifestHash,
} from "@/lib/mcp/manifestHash";
import {
  verifyMcpToolAccess,
  defaultBrowserHarness,
  getVerifyStatusGuidance,
  NOT_CHECKED_LABEL,
  NOT_CHECKED_DESCRIPTION,
  type HarnessAdapter,
  type VerifyMcpToolAccessResult,
} from "@/lib/mcp/verifyMcpToolAccess";


type CopyState = "idle" | "copied" | "failed";

type OAuthStatus = "configured" | "not_configured" | "unverified";

/**
 * Safe status derivation. We treat the OAuth server as `configured`
 * when the manifest advertises the OAuth auth type AND we have a
 * plausible issuer URL string. Anything else falls back to `unverified`
 * — the page never reads env values or tokens to answer this.
 */
function deriveOAuthStatus(): OAuthStatus {
  try {
    const issuer = MCP_MANIFEST.oauthIssuer;
    if (typeof issuer === "string" && /^https:\/\/.+\/auth\/v1$/.test(issuer)) {
      return "configured";
    }
    if (!issuer) return "not_configured";
    return "unverified";
  } catch {
    return "unverified";
  }
}

function OAuthStatusBadge({ status }: { status: OAuthStatus }) {
  if (status === "configured") {
    return (
      <Badge variant="default" data-testid="oauth-status">
        OAuth configured
      </Badge>
    );
  }
  if (status === "not_configured") {
    return (
      <Badge variant="outline" data-testid="oauth-status">
        OAuth not configured
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" data-testid="oauth-status">
      Unable to verify safely
    </Badge>
  );
}

export type AgentIntegrationsProps = {
  /**
   * Optional injectable verification harness. Defaults to a browser-safe
   * "unavailable" adapter so we never attempt live MCP calls from the UI.
   * Tests inject a fake adapter to exercise the four presenter states.
   */
  verifyHarness?: HarnessAdapter;
};

export default function AgentIntegrations({
  verifyHarness = defaultBrowserHarness,
}: AgentIntegrationsProps = {}) {
  usePageSeo({
    title: "Agent integrations — Verdant Grow Diary",
    description:
      "Connect ChatGPT, Claude, or another AI assistant to your Verdant grow data through a read-only MCP server.",
    path: "/settings/agent-integrations",
    noindex: true,
  });

  const supabaseOrigin = getSupabaseOrigin();
  const endpoint = useMemo(
    () => (supabaseOrigin ? `${supabaseOrigin}${MCP_MANIFEST.path}` : MCP_MANIFEST.path),
    [supabaseOrigin],
  );
  const manifestUrl = useMemo(
    () => (supabaseOrigin ? `${supabaseOrigin}${MCP_MANIFEST.path}` : MCP_MANIFEST.path),
    [supabaseOrigin],
  );
  const appOrigin =
    typeof window !== "undefined" ? window.location.origin : "";
  const consentUrl = `${appOrigin}${MCP_MANIFEST.consentPath}`;
  const oauthStatus = deriveOAuthStatus();

  const manifestHash = useMemo(() => computeManifestHash(MCP_MANIFEST), []);
  const manifestFingerprint = useMemo(
    () => shortenManifestHash(manifestHash),
    [manifestHash],
  );
  const toolNames = MCP_MANIFEST.tools.map((t) => t.name);

  const [copyState, setCopyState] = useState<CopyState>("idle");
  const onCopy = useCallback(async () => {
    const payload = buildConnectionDetailsText(MCP_MANIFEST, supabaseOrigin, appOrigin);
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(payload);
        setCopyState("copied");
        return;
      }
      setCopyState("failed");
    } catch {
      setCopyState("failed");
    }
  }, [supabaseOrigin, appOrigin]);

  const [verifyResult, setVerifyResult] =
    useState<VerifyMcpToolAccessResult | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const onVerify = useCallback(async () => {
    setVerifyBusy(true);
    try {
      const result = await verifyMcpToolAccess({ adapter: verifyHarness });
      setVerifyResult(result);
    } finally {
      setVerifyBusy(false);
    }
  }, [verifyHarness]);

  const panelStatus = verifyResult?.status ?? "not_checked";
  const panelLabel = verifyResult?.label ?? NOT_CHECKED_LABEL;
  const panelDescription = verifyResult?.description ?? NOT_CHECKED_DESCRIPTION;
  const panelGuidance = getVerifyStatusGuidance(panelStatus);

  const [manifestModalOpen, setManifestModalOpen] = useState(false);



  return (
    <div className="min-h-dvh px-4 py-6 md:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link
            to="/settings"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Settings
          </Link>
        </div>

        <PageHeader
          title="Agent integrations"
          description="Connect ChatGPT, Claude, Cursor, or another MCP-capable assistant to your Verdant grow data."
        />

        <section
          aria-label="Safety statement"
          className="glass rounded-2xl border p-5"
          data-testid="agent-integrations-safety"
        >
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <p className="text-sm leading-relaxed">
              Verdant agent integrations are <strong>read-only</strong> in this
              release. Agents can list grows, recent diary entries, and latest
              sensor snapshots for the signed-in grower only. They cannot write
              logs, create Action Queue items, run AI Doctor, control equipment,
              or automate grow-room devices.
            </p>
          </div>
        </section>

        <section
          aria-label="Connection details"
          className="glass rounded-2xl border p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Connection details</h2>
            <OAuthStatusBadge status={oauthStatus} />
          </div>

          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">MCP endpoint</dt>
              <dd
                className="break-all font-mono text-xs"
                data-testid="mcp-endpoint"
              >
                {endpoint}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">MCP manifest</dt>
              <dd className="break-all font-mono text-xs">
                <a
                  href={manifestUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline"
                  data-testid="mcp-manifest-link"
                >
                  {manifestUrl}
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">OAuth consent route</dt>
              <dd
                className="break-all font-mono text-xs"
                data-testid="oauth-consent-url"
              >
                {consentUrl}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Server</dt>
              <dd className="text-xs">
                {MCP_MANIFEST.serverTitle} ({MCP_MANIFEST.serverName}) v
                {MCP_MANIFEST.version}
              </dd>
            </div>
            <div data-testid="manifest-identity">
              <dt className="text-muted-foreground">Manifest identity</dt>
              <dd className="text-xs space-y-1">
                <div>
                  Manifest version:{" "}
                  <span className="font-mono" data-testid="manifest-version">
                    {MCP_MANIFEST.version}
                  </span>
                </div>
                <div>
                  Manifest fingerprint:{" "}
                  <span className="font-mono" data-testid="manifest-fingerprint">
                    {manifestFingerprint}
                  </span>
                </div>
                <div data-testid="manifest-tool-count">
                  Tools advertised: {toolNames.length}
                </div>
                <div className="text-muted-foreground">
                  Last-known tools:{" "}
                  <span className="font-mono">{toolNames.join(", ")}</span>
                </div>
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={onCopy}
              aria-label="Copy Verdant MCP connection details"
              data-testid="copy-connection-details"
            >
              <Copy className="mr-2 h-4 w-4" aria-hidden />
              Copy connection details
            </Button>
            <Button
              variant="outline"
              onClick={() => setManifestModalOpen(true)}
              aria-label="View safe MCP manifest summary"
              data-testid="open-manifest-summary-modal"
            >
              <FileText className="mr-2 h-4 w-4" aria-hidden />
              View MCP manifest
            </Button>
            <span
              role="status"
              aria-live="polite"
              className="text-sm text-muted-foreground"
              data-testid="copy-status"
            >
              {copyState === "copied"
                ? "Copied — safe to paste into your MCP client."
                : copyState === "failed"
                  ? "Copy failed — please copy the endpoint manually."
                  : ""}
            </span>
          </div>

        </section>

        <section
          aria-label="Verify tool access"
          className="glass rounded-2xl border p-5 space-y-3"
          data-testid="verify-tool-access"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Verify tool access</h2>
            <Button
              onClick={onVerify}
              disabled={verifyBusy}
              data-testid="verify-tool-access-button"
              variant="outline"
            >
              {verifyBusy ? "Verifying…" : "Verify tool access"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Runs a read-only <code className="font-mono">list_grows</code>{" "}
            check against the local verification harness when available.
            Never exposes tokens, secrets, or raw response rows.
          </p>
          <div
            className="rounded-lg border p-3 text-sm space-y-1"
            role="status"
            aria-live="polite"
            data-testid="verify-tool-access-result"
            data-status={panelStatus}
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium" data-testid="verify-label">
                {panelLabel}
              </div>
              <Badge variant="outline" className="text-[10px] uppercase" data-testid="verify-tool-checked">
                tool: list_grows
              </Badge>
            </div>
            <div
              className="text-muted-foreground"
              data-testid="verify-description"
            >
              {panelDescription}
            </div>
            {typeof verifyResult?.growCount === "number" ? (
              <div
                className="text-xs text-muted-foreground"
                data-testid="verify-grow-count"
              >
                {verifyResult.growCount === 0
                  ? "0 grows found (authorized empty state)."
                  : `${verifyResult.growCount} grow(s) visible to the signed-in grower.`}
              </div>
            ) : null}
            <div
              className="text-xs text-foreground"
              data-testid="verify-next-step"
            >
              {panelGuidance}
            </div>
          </div>

        </section>

        <section
          aria-label="Connect an agent"
          className="glass rounded-2xl border p-5 space-y-3"
          data-testid="connect-agent-checklist"
        >
          <h2 className="text-lg font-semibold">Connect an agent</h2>
          <ol
            className="list-decimal space-y-2 pl-5 text-sm"
            data-testid="connect-agent-steps"
          >
            <li>
              Open your agent app: ChatGPT, Claude, Cursor, or another
              MCP-compatible client.
            </li>
            <li>Go to Agent Integrations / MCP server settings.</li>
            <li>Add the Verdant MCP endpoint.</li>
            <li>Complete OAuth consent.</li>
            <li>Confirm available read-only tools.</li>
            <li>
              Run a read-only test like{" "}
              <code className="font-mono">list_grows</code>.
            </li>
            <li>
              Use diary entries and sensor snapshots as context, not
              automation.
            </li>
          </ol>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild size="sm" variant="outline">
              <a
                href={consentUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open Verdant OAuth consent route"
                data-testid="open-oauth-consent-link"
              >
                <ExternalLink className="mr-2 h-3 w-3" aria-hidden />
                Open OAuth consent
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a
                href={manifestUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open Verdant MCP manifest"
                data-testid="view-mcp-manifest-link"
              >
                <ExternalLink className="mr-2 h-3 w-3" aria-hidden />
                View MCP manifest
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a
                href="#agent-tool-reference"
                aria-label="Jump to Verdant agent tool reference"
                data-testid="view-tool-reference-link"
              >
                View agent tool reference
              </a>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onCopy}
              aria-label="Copy Verdant MCP connection details"
              data-testid="checklist-copy-connection-details"
            >
              <Copy className="mr-2 h-3 w-3" aria-hidden />
              Copy connection details
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setManifestModalOpen(true)}
              aria-label="View safe MCP manifest summary"
              data-testid="checklist-open-manifest-summary-modal"
            >
              <FileText className="mr-2 h-3 w-3" aria-hidden />
              View MCP manifest summary
            </Button>
          </div>

          <p
            className="text-xs text-muted-foreground"
            data-testid="connect-agent-safety-copy"
          >
            Verdant agent access is read-only in this release. Agents can
            list grows, recent diary entries, and latest sensor snapshots
            for the signed-in grower only. They cannot write logs, create
            Action Queue items, run AI Doctor, control equipment, or
            automate grow-room devices.
          </p>
        </section>


        <section
          id="agent-tool-reference"
          aria-label="Agent tool reference"
          className="glass rounded-2xl border p-5 space-y-4"
          data-testid="agent-tool-reference"
        >
          <h2 className="text-lg font-semibold">Agent tool reference</h2>
          <p className="text-sm text-muted-foreground">
            Every tool is read-only and runs under the signed-in grower's own
            row-level security. Agents cannot see other growers' data.
          </p>
          <ul className="space-y-4">
            {MCP_MANIFEST.tools.map((tool) => (
              <li
                key={tool.name}
                className="rounded-lg border p-4"
                data-testid={`mcp-tool-${tool.name}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-sm">{tool.name}</code>
                  {tool.readOnly ? (
                    <Badge variant="outline" className="text-xs">
                      read-only
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-2 text-sm">{tool.description}</p>
                {tool.params.length > 0 ? (
                  <div className="mt-3">
                    <div className="text-xs font-medium text-muted-foreground">
                      Parameters
                    </div>
                    <ul className="mt-1 space-y-1 text-xs">
                      {tool.params.map((p) => (
                        <li key={p.name} className="font-mono">
                          <span>{p.name}</span>
                          <span className="text-muted-foreground">
                            {" "}
                            : {p.type}
                          </span>{" "}
                          <span
                            className={
                              p.required
                                ? "text-primary"
                                : "text-muted-foreground"
                            }
                          >
                            ({p.required ? "required" : "optional"})
                          </span>
                          {p.constraints ? (
                            <span className="text-muted-foreground">
                              {" "}
                              [{p.constraints}]
                            </span>
                          ) : null}
                          {p.description ? (
                            <div className="ml-4 font-sans text-muted-foreground">
                              {p.description}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No parameters.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
