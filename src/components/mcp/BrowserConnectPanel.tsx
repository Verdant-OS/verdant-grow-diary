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
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "@/lib/react-router-compat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plug, PlugZap, RotateCcw, ShieldAlert } from "lucide-react";
import { useAuth } from "@/store/auth";
import {
  clearPendingAuthorization,
  completeAuthorization,
  disconnect,
  getPendingAuthorizationState,
  hasPendingAuthorization,
  hasStoredToken,
  probeTools,
  readCallbackErrorParams,
  readCallbackParams,
  startAuthorization,
  type ProbeResult,
} from "@/lib/mcp/browserOAuthClient";
import {
  readLastOAuthAttempt,
  recordOAuthAttemptFailure,
  recordOAuthAttemptStart,
  recordOAuthAttemptSuccess,
  sanitizeAttemptReason,
  type OAuthAttemptRecord,
} from "@/lib/mcp/oauthAttemptLog";
import { MCP_MANIFEST, getSupabaseOrigin } from "@/lib/mcp/manifestView";

const REDIRECT_PATH = "/settings/agent-integrations";

type Phase = "idle" | "authorizing" | "exchanging" | "probing";

function formatAttemptTime(record: OAuthAttemptRecord): string {
  const iso = record.completedAt ?? record.startedAt;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleString();
}

function attemptOutcomeLabel(record: OAuthAttemptRecord): string {
  if (record.outcome === "success") return "Success";
  if (record.outcome === "failed") return "Failed";
  return "Incomplete (did not return from consent)";
}

export type BrowserConnectPanelProps = {
  /**
   * Local (this-browser) preference for the probe tool `list_grows`.
   * When false, the live probe is disabled with an explanation — the
   * server itself still allows the call for any connected assistant.
   */
  probeToolEnabled?: boolean;
  /**
   * Mirrors the panel's displayed last-attempt record to the parent so
   * the support export can use the SAME in-memory state the UI shows —
   * a storage-write failure must not make the export contradict the page.
   */
  onLastAttemptChange?: (record: OAuthAttemptRecord | null) => void;
};

export default function BrowserConnectPanel({
  probeToolEnabled = true,
  onLastAttemptChange,
}: BrowserConnectPanelProps = {}) {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [connected, setConnected] = useState<boolean>(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState<OAuthAttemptRecord | null>(null);

  const endpoint = `${getSupabaseOrigin()}${MCP_MANIFEST.path}`;
  const issuer = MCP_MANIFEST.oauthIssuer;

  // The auto-probe must honor the preference AT COMPLETION TIME, not the
  // value captured when the []-deps effect mounted — the grower can flip
  // the switch while the token exchange is still in flight.
  const probeToolEnabledRef = useRef(probeToolEnabled);
  useEffect(() => {
    probeToolEnabledRef.current = probeToolEnabled;
  }, [probeToolEnabled]);

  // Keep the parent's copy of the attempt record in lockstep with what
  // this panel displays (see onLastAttemptChange).
  useEffect(() => {
    onLastAttemptChange?.(lastAttempt);
  }, [lastAttempt, onLastAttemptChange]);

  // Initial mount: refresh token + last-attempt state, surface an OAuth
  // error callback (?error=access_denied) if present, and if we came
  // back with ?code=, finish the exchange and auto-probe.
  //
  // Callback params are honored ONLY while this browser holds a pending
  // authorization (the PKCE record written by startAuthorization).
  // Without that check, a crafted or stale ?error=/?code= link could
  // fabricate attempt history in localStorage or clobber real history
  // with a bogus failure (e.g. back-button after a completed exchange).
  useEffect(() => {
    setConnected(hasStoredToken());
    setLastAttempt(readLastOAuthAttempt());
    const pending = hasPendingAuthorization();
    const cbError = readCallbackErrorParams(window.location.search);
    if (cbError) {
      // Consume the error ONLY when it carries the pending flow's own
      // CSRF state. A forged/stale ?error= (no pending flow, missing
      // state, or a state we never issued) is ignored outright — it
      // must neither abort a real in-flight authorization nor
      // fabricate attempt history.
      const pendingState = getPendingAuthorizationState();
      if (!pending || !cbError.state || cbError.state !== pendingState) return;
      clearPendingAuthorization();
      // Persist ONLY a shape-checked error code. error_description is
      // provider-controlled free text that can echo emails, codes, or
      // other sensitive values no blocklist can enumerate — it is never
      // stored, rendered, or exported.
      const errorCode = /^[A-Za-z0-9_.-]{1,64}$/.test(cbError.error)
        ? cbError.error
        : "unknown_error";
      const reason = `Authorization error: ${errorCode}`;
      setLastAttempt(recordOAuthAttemptFailure(reason));
      setError(reason);
      // Clean the query string so a refresh doesn't re-report the error.
      navigate(REDIRECT_PATH, { replace: true });
      return;
    }
    const cb = readCallbackParams(window.location.search);
    if (!cb) return;
    if (!pending) {
      // Replayed callback (e.g. back-button after success): the PKCE
      // verifier is gone, so the exchange cannot succeed. Clean the URL
      // without overwriting real attempt history with a bogus failure.
      navigate(REDIRECT_PATH, { replace: true });
      return;
    }
    (async () => {
      setPhase("exchanging");
      setError(null);
      try {
        await completeAuthorization(issuer, cb);
        setLastAttempt(recordOAuthAttemptSuccess());
        setConnected(true);
        // Clean the query string so a refresh doesn't retry the code.
        navigate(REDIRECT_PATH, { replace: true });
        if (probeToolEnabledRef.current) {
          setPhase("probing");
          const r = await probeTools(endpoint);
          setResult(r);
        }
      } catch (e) {
        const message = sanitizeAttemptReason((e as Error).message || "OAuth exchange failed");
        setLastAttempt(recordOAuthAttemptFailure(message));
        setError(message);
      } finally {
        setPhase("idle");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onConnect = useCallback(async () => {
    setError(null);
    setPhase("authorizing");
    setLastAttempt(recordOAuthAttemptStart());
    try {
      await startAuthorization(issuer, REDIRECT_PATH);
      // startAuthorization navigates away; nothing else to do.
    } catch (e) {
      const message = sanitizeAttemptReason((e as Error).message || "Could not start OAuth");
      setLastAttempt(recordOAuthAttemptFailure(message));
      setError(message);
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
        <span className="font-medium text-foreground">{user?.email ?? "the signed-in grower"}</span>
        {probeToolEnabled ? (
          <>
            , then calls <code className="font-mono">list_grows</code> to confirm tools are
            reachable for your account.
          </>
        ) : (
          <>
            . The automatic <code className="font-mono">list_grows</code> check is skipped while
            that tool is disabled in this browser.
          </>
        )}{" "}
        The access token lives only in this browser tab's memory and is never displayed.
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
            <Button
              onClick={onProbe}
              disabled={busy || !probeToolEnabled}
              data-testid="browser-connect-probe"
            >
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

      {!probeToolEnabled ? (
        <p className="text-xs text-muted-foreground" data-testid="browser-connect-probe-disabled">
          The probe is off because <code className="font-mono">list_grows</code> is disabled in this
          browser (a local preference). Re-enable it in the tool list below to run the probe. The
          server itself still allows this read-only tool for connected assistants.
        </p>
      ) : null}

      <div
        className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
        data-testid="oauth-last-attempt"
        data-outcome={lastAttempt?.outcome ?? "none"}
      >
        {lastAttempt ? (
          <>
            <span>
              Last OAuth attempt in this browser: {formatAttemptTime(lastAttempt)} —{" "}
              <span
                className={
                  lastAttempt.outcome === "failed" ? "text-destructive" : "text-foreground"
                }
                data-testid="oauth-last-attempt-outcome"
              >
                {attemptOutcomeLabel(lastAttempt)}
              </span>
              {lastAttempt.outcome === "failed" && lastAttempt.reason ? (
                <span data-testid="oauth-last-attempt-reason"> ({lastAttempt.reason})</span>
              ) : null}
            </span>
            {lastAttempt.outcome === "failed" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={onConnect}
                disabled={busy || showPreauthWarning}
                data-testid="oauth-retry"
              >
                <RotateCcw className="mr-1 h-3 w-3" aria-hidden />
                Retry OAuth
              </Button>
            ) : null}
          </>
        ) : (
          <span>Last OAuth attempt: none recorded in this browser.</span>
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
                  <>
                    {" "}
                    — <span className="font-mono">{result.toolNames.join(", ")}</span>
                  </>
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
