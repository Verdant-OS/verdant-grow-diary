/**
 * "Connect this browser as a test agent" panel for /settings/agent-integrations.
 *
 * SAFETY:
 * - Runs a real OAuth 2.1 authorization_code + PKCE flow via
 *   `browserOAuthClient`. The access token lives in sessionStorage only
 *   and is NEVER rendered here; the UI shows derived booleans and coarse
 *   probe results only.
 * - Uses the app's existing Supabase session (via useAuth) purely to
 *   surface the signed-in email; the OAuth flow is independent.
 * - Same-origin redirect_uri, validated before use.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plug, PlugZap, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  completeAuthorization,
  disconnect,
  hasStoredToken,
  probeTools,
  readCallbackParams,
  startAuthorization,
  type ProbeResult,
} from "@/lib/mcp/browserOAuthClient";
import { MCP_MANIFEST, getSupabaseOrigin } from "@/lib/mcp/manifestView";

const REDIRECT_PATH = "/settings/agent-integrations";

type Phase = "idle" | "authorizing" | "exchanging" | "probing";

export default function BrowserConnectPanel() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [connected, setConnected] = useState<boolean>(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const endpoint = `${getSupabaseOrigin()}${MCP_MANIFEST.path}`;
  const issuer = MCP_MANIFEST.oauthIssuer;

  // Initial mount: refresh token state, and if we came back with ?code=,
  // finish the exchange and auto-probe.
  useEffect(() => {
    setConnected(hasStoredToken());
    const cb = readCallbackParams(window.location.search);
    if (!cb) return;
    (async () => {
      setPhase("exchanging");
      setError(null);
      try {
        await completeAuthorization(issuer, cb);
        setConnected(true);
        // Clean the query string so a refresh doesn't retry the code.
        navigate(REDIRECT_PATH, { replace: true });
        setPhase("probing");
        const r = await probeTools(endpoint);
        setResult(r);
      } catch (e) {
        setError((e as Error).message || "OAuth exchange failed");
      } finally {
        setPhase("idle");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onConnect = useCallback(async () => {
    setError(null);
    setPhase("authorizing");
    try {
      await startAuthorization(issuer, REDIRECT_PATH);
      // startAuthorization navigates away; nothing else to do.
    } catch (e) {
      setError((e as Error).message || "Could not start OAuth");
      setPhase("idle");
    }
  }, [issuer]);

  const onProbe = useCallback(async () => {
    setPhase("probing");
    setError(null);
    try {
      const r = await probeTools(endpoint);
      setResult(r);
      if (r.status === "unauthorized") setConnected(false);
    } finally {
      setPhase("idle");
    }
  }, [endpoint]);

  const onDisconnect = useCallback(() => {
    disconnect();
    setConnected(false);
    setResult(null);
    setError(null);
  }, []);

  const busy = phase !== "idle";
  const statusBadge = connected ? (
    <Badge variant="default" data-testid="browser-oauth-status">
      Connected in this browser
    </Badge>
  ) : (
    <Badge variant="outline" data-testid="browser-oauth-status">
      Not connected
    </Badge>
  );

  const showPreauthWarning = !user;

  return (
    <section
      aria-label="Connect this browser as a test agent"
      className="glass rounded-2xl border p-5 space-y-4"
      data-testid="browser-connect-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Connect this browser as a test agent</h2>
        {statusBadge}
      </div>
      <p className="text-sm text-muted-foreground">
        Runs the real OAuth 2.1 flow against the Verdant MCP server as{" "}
        <span className="font-medium text-foreground">
          {user?.email ?? "the signed-in grower"}
        </span>
        , then calls <code className="font-mono">list_grows</code> to confirm tools are reachable
        for your account. The access token lives only in this browser tab's memory and is never
        displayed.
      </p>

      {showPreauthWarning ? (
        <div
          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
          data-testid="browser-connect-signin-warning"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
          <span>Sign in to Verdant first so the consent step can identify you.</span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {connected ? (
          <>
            <Button onClick={onProbe} disabled={busy} data-testid="browser-connect-probe">
              {phase === "probing" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <PlugZap className="mr-2 h-4 w-4" aria-hidden />
              )}
              Run list_grows probe
            </Button>
            <Button
              variant="outline"
              onClick={onDisconnect}
              disabled={busy}
              data-testid="browser-connect-disconnect"
            >
              Disconnect this browser
            </Button>
          </>
        ) : (
          <Button
            onClick={onConnect}
            disabled={busy || showPreauthWarning}
            data-testid="browser-connect-start"
          >
            {phase === "authorizing" || phase === "exchanging" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Plug className="mr-2 h-4 w-4" aria-hidden />
            )}
            Connect this browser
          </Button>
        )}
      </div>

      <div
        className="rounded-lg border p-3 text-sm space-y-1"
        role="status"
        aria-live="polite"
        data-testid="browser-connect-result"
        data-status={result?.status ?? (connected ? "idle_connected" : "idle_disconnected")}
      >
        {error ? (
          <div className="text-destructive" data-testid="browser-connect-error">
            {error}
          </div>
        ) : result ? (
          <>
            <div className="font-medium">
              {result.status === "connected"
                ? "Live probe: authorized"
                : result.status === "unauthorized"
                  ? "Live probe: unauthorized"
                  : result.status === "failed"
                    ? "Live probe: failed"
                    : "Live probe: not connected"}
            </div>
            <div className="text-muted-foreground">{result.message}</div>
            {typeof result.toolCount === "number" ? (
              <div className="text-xs text-muted-foreground">
                Tools discovered via tools/list: {result.toolCount}
                {result.toolNames && result.toolNames.length > 0 ? (
                  <> — <span className="font-mono">{result.toolNames.join(", ")}</span></>
                ) : null}
              </div>
            ) : null}
            <div className="text-xs text-muted-foreground">Checked at {result.checkedAt}</div>
          </>
        ) : (
          <div className="text-muted-foreground">
            {phase === "exchanging"
              ? "Exchanging authorization code…"
              : phase === "probing"
                ? "Calling initialize → tools/list → list_grows…"
                : phase === "authorizing"
                  ? "Redirecting to consent…"
                  : connected
                    ? "Connected. Run the probe to confirm tools are callable."
                    : "Not connected yet."}
          </div>
        )}
      </div>
    </section>
  );
}
