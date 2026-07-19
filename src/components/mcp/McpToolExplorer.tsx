/**
 * McpToolExplorer — interactive playground for the three advertised
 * Verdant MCP tools. Uses the same browser OAuth token minted by the
 * "Connect this browser" panel on Settings → Agent integrations.
 *
 * SAFETY:
 * - Read-only tools only (list_grows, list_recent_diary_entries,
 *   get_latest_sensor_snapshot). No writes, no Action Queue, no AI.
 * - The access token is never rendered, logged, or copied into the
 *   result payload. Only the tool's own `structuredContent`/`content`
 *   is shown.
 * - When there is no stored token the UI shows a Connect CTA that
 *   deep-links to Settings → Agent integrations; it does not attempt
 *   to start a second OAuth flow from the docs page.
 *
 * VALIDATION:
 * - Every input has an inline validator that runs on change AND blur.
 * - Errors appear beneath the specific field with `aria-invalid` +
 *   `aria-describedby` wired to a stable id, so the fix is obvious.
 * - Run is disabled while any field is invalid; a summary line names
 *   the fields that still need attention.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Play, PlugZap, RotateCcw, ShieldAlert } from "lucide-react";
import {
  callMcpTool,
  hasStoredToken,
  type ToolCallOutcome,
} from "@/lib/mcp/browserOAuthClient";
import { MCP_MANIFEST, getSupabaseOrigin } from "@/lib/mcp/manifestView";

type ToolName =
  | "list_grows"
  | "list_recent_diary_entries"
  | "get_latest_sensor_snapshot";

interface RunState {
  loading: boolean;
  outcome: ToolCallOutcome | null;
  ranAt: string | null;
  args: Record<string, unknown> | null;
  previousArgs: Record<string, unknown> | null;
}

const EMPTY: RunState = {
  loading: false,
  outcome: null,
  ranAt: null,
  args: null,
  previousArgs: null,
};

// ---------- pure diff helper ----------

export type ArgDiffKind = "added" | "removed" | "changed" | "unchanged";
export interface ArgDiffEntry {
  key: string;
  kind: ArgDiffKind;
  from: unknown;
  to: unknown;
}

export function diffArgs(
  prev: Record<string, unknown> | null,
  curr: Record<string, unknown> | null,
): ArgDiffEntry[] {
  const a = prev ?? {};
  const b = curr ?? {};
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
  return keys.map((key) => {
    const inA = Object.prototype.hasOwnProperty.call(a, key);
    const inB = Object.prototype.hasOwnProperty.call(b, key);
    const from = a[key];
    const to = b[key];
    let kind: ArgDiffKind;
    if (inA && !inB) kind = "removed";
    else if (!inA && inB) kind = "added";
    else if (JSON.stringify(from) !== JSON.stringify(to)) kind = "changed";
    else kind = "unchanged";
    return { key, kind, from, to };
  });
}

function formatArgValue(v: unknown): string {
  if (v === undefined) return "—";
  return JSON.stringify(v);
}

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// ---------- pure validators ----------

export function validateOptionalIntInRange(
  raw: string,
  min: number,
  max: number,
  fieldLabel: string,
): string | null {
  const t = raw.trim();
  if (t === "") return null;
  if (!/^-?\d+$/.test(t)) return `${fieldLabel} must be a whole number.`;
  const n = Number(t);
  if (!Number.isInteger(n) || n < min || n > max) {
    return `${fieldLabel} must be between ${min} and ${max}.`;
  }
  return null;
}

export function validateRequiredUuid(raw: string, fieldLabel: string): string | null {
  const t = raw.trim();
  if (t === "") return `${fieldLabel} is required.`;
  if (!UUID_RE.test(t)) {
    return `${fieldLabel} must be a UUID (8-4-4-4-12 hex, e.g. 3f2e1a4b-…-9d2f).`;
  }
  return null;
}

function coerceOptionalInt(raw: string): number | undefined {
  const t = raw.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isInteger(n) ? n : undefined;
}

// ---------- presentational helpers ----------

function formatResult(outcome: ToolCallOutcome): string {
  if (outcome.status !== "ok") return outcome.message;
  const r = outcome.result;
  if (r.structuredContent !== undefined) {
    return JSON.stringify(r.structuredContent, null, 2);
  }
  if (Array.isArray(r.content)) {
    const text = r.content.find((c) => c.type === "text")?.text;
    if (text) {
      try {
        return JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        return text;
      }
    }
  }
  return JSON.stringify(r, null, 2);
}

function OutcomeBadge({ outcome }: { outcome: ToolCallOutcome | null }) {
  if (!outcome) return null;
  const variant =
    outcome.status === "ok"
      ? "default"
      : outcome.status === "unauthorized"
        ? "destructive"
        : "outline";
  const label =
    outcome.status === "ok"
      ? outcome.result.isError
        ? "Tool returned isError"
        : "Success"
      : outcome.status === "unauthorized"
        ? "Unauthorized"
        : outcome.status === "not_connected"
          ? "Not connected"
          : "Error";
  return <Badge variant={variant}>{label}</Badge>;
}

interface FieldError {
  id: string;
  label: string;
  message: string;
}

/**
 * Outcome categories the explorer renders guidance for. These are derived
 * from the low-level ToolCallOutcome plus JSON-RPC/tool text conventions
 * documented in /docs/mcp-api.
 */
export type OutcomeCategory =
  | "ok"
  | "unauthorized"
  | "not_connected"
  | "invalid_params"
  | "not_found"
  | "tool_error"
  | "transport_error";

export function classifyOutcome(outcome: ToolCallOutcome | null): OutcomeCategory | null {
  if (!outcome) return null;
  if (outcome.status === "not_connected") return "not_connected";
  if (outcome.status === "unauthorized") return "unauthorized";
  if (outcome.status === "error") {
    // JSON-RPC: -32602 = invalid params, -32601 = method/tool not found,
    // -32000..-32099 = server-defined. Fall back to message text for
    // servers that only stringify the failure.
    if (outcome.code === -32602) return "invalid_params";
    if (outcome.code === -32601) return "not_found";
    const m = outcome.message.toLowerCase();
    if (/invalid[_ ]?params|validation|schema|bad request/.test(m)) return "invalid_params";
    if (/not[_ ]?found|no such|unknown/.test(m)) return "not_found";
    if (/unauthorized|401|token/.test(m)) return "unauthorized";
    return "transport_error";
  }
  // status === "ok"
  if (outcome.result.isError) {
    const text = outcome.result.content?.find((c) => c.type === "text")?.text ?? "";
    const m = text.toLowerCase();
    if (/invalid[_ ]?params|validation|schema|must be|required/.test(m)) return "invalid_params";
    if (/not[_ ]?found|does not (?:exist|belong)|no rows|unknown/.test(m)) return "not_found";
    return "tool_error";
  }
  return "ok";
}

interface GuidanceCopy {
  tone: "destructive" | "warning";
  title: string;
  body: string;
  primaryAction: "reconnect" | "retry" | "fix_params" | null;
}

function guidanceFor(category: OutcomeCategory): GuidanceCopy | null {
  switch (category) {
    case "unauthorized":
      return {
        tone: "destructive",
        title: "Unauthorized (401)",
        body: "Your access token was rejected or expired. Reconnect this browser from Settings → Agent integrations, then retry.",
        primaryAction: "reconnect",
      };
    case "not_connected":
      return {
        tone: "warning",
        title: "Not connected",
        body: "This browser has no MCP session. Connect once from Settings → Agent integrations, then retry.",
        primaryAction: "reconnect",
      };
    case "invalid_params":
      return {
        tone: "destructive",
        title: "Invalid parameters",
        body: "The server rejected the arguments. Fix the highlighted fields above (UUID format, integer range) and run again.",
        primaryAction: "fix_params",
      };
    case "not_found":
      return {
        tone: "warning",
        title: "Not found for the signed-in grower",
        body: "The id was well-formed but doesn't match any of your own rows. Run list_grows to copy a real id, then retry.",
        primaryAction: "retry",
      };
    case "tool_error":
      return {
        tone: "destructive",
        title: "Tool returned isError",
        body: "The server accepted the call but the tool reported a failure. Read the payload below for details, then retry.",
        primaryAction: "retry",
      };
    case "transport_error":
      return {
        tone: "destructive",
        title: "Transport error",
        body: "The call couldn't complete. Check your connection and retry — repeated failures usually mean the endpoint is unreachable.",
        primaryAction: "retry",
      };
    case "ok":
      return null;
  }
}



function ToolCard({
  toolName,
  endpoint,
  connected,
  children,
  buildArgs,
  fieldErrors,
  onAuthLost,
  onRunOutcome,
}: {
  toolName: ToolName;
  endpoint: string;
  connected: boolean;
  children: React.ReactNode;
  buildArgs: () => Record<string, unknown>;
  fieldErrors: FieldError[];
  onAuthLost: () => void;
  onRunOutcome?: (outcome: ToolCallOutcome, category: OutcomeCategory) => void;
}) {
  const [state, setState] = useState<RunState>(EMPTY);

  const tool = useMemo(
    () => MCP_MANIFEST.tools.find((t) => t.name === toolName)!,
    [toolName],
  );

  const invalid = fieldErrors.length > 0;

  const [showDiff, setShowDiff] = useState(false);
  const [confirmBeforeRetry, setConfirmBeforeRetry] = useState(true);
  const [retryPending, setRetryPending] = useState(false);

  const run = useCallback(async () => {
    if (invalid) return;
    const args = buildArgs();
    setState((prev) => ({
      loading: true,
      outcome: null,
      ranAt: null,
      args: prev.args,
      previousArgs: prev.args,
    }));
    const outcome = await callMcpTool(endpoint, toolName, args);
    setState((prev) => ({
      loading: false,
      outcome,
      ranAt: new Date().toISOString(),
      args,
      previousArgs: prev.previousArgs,
    }));
    if (outcome.status === "unauthorized" || outcome.status === "not_connected") {
      onAuthLost();
    }
    const category = classifyOutcome(outcome);
    if (category && onRunOutcome) onRunOutcome(outcome, category);
  }, [invalid, buildArgs, endpoint, toolName, onAuthLost, onRunOutcome]);

  const requestRetry = useCallback(() => {
    if (confirmBeforeRetry) {
      setRetryPending(true);
    } else {
      void run();
    }
  }, [confirmBeforeRetry, run]);

  const confirmRetry = useCallback(() => {
    setRetryPending(false);
    void run();
  }, [run]);

  const summaryId = `tool-explorer-${toolName}-validation-summary`;

  return (
    <section
      className="rounded-2xl border p-5 space-y-4"
      data-testid={`tool-explorer-${toolName}`}
      aria-label={tool.title}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">
            <code className="font-mono">{tool.name}</code>
          </h3>
          <p className="text-sm text-muted-foreground max-w-prose">{tool.description}</p>
        </div>
        <Badge variant="outline">Read-only</Badge>
      </div>

      <div className="space-y-3">{children}</div>

      {invalid ? (
        <div
          id={summaryId}
          role="alert"
          aria-live="polite"
          data-testid={`tool-explorer-validation-${toolName}`}
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive space-y-1"
        >
          <p className="font-medium">Fix {fieldErrors.length === 1 ? "1 field" : `${fieldErrors.length} fields`} before running:</p>
          <ul className="list-disc pl-5">
            {fieldErrors.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className="underline underline-offset-2 hover:no-underline"
                  onClick={() => {
                    const el = document.getElementById(e.id);
                    if (el) {
                      el.focus();
                      el.scrollIntoView({ block: "center", behavior: "smooth" });
                    }
                  }}
                >
                  {e.label}
                </button>
                : {e.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={run}
          disabled={!connected || state.loading || invalid}
          aria-describedby={invalid ? summaryId : undefined}
          data-testid={`tool-explorer-run-${toolName}`}
        >
          {state.loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Play className="mr-2 h-4 w-4" aria-hidden />
          )}
          Run {tool.name}
        </Button>
        <OutcomeBadge outcome={state.outcome} />
        {state.ranAt ? (
          <span className="text-xs text-muted-foreground">Ran at {state.ranAt}</span>
        ) : null}
        {state.previousArgs && state.args ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setShowDiff((s) => !s)}
            aria-expanded={showDiff}
            aria-controls={`tool-explorer-diff-${toolName}`}
            data-testid={`tool-explorer-view-changes-${toolName}`}
          >
            {showDiff ? "Hide changes" : "View changes"}
          </Button>
        ) : null}
      </div>

      {state.previousArgs && state.args && showDiff ? (() => {
        const entries = diffArgs(state.previousArgs, state.args);
        const changed = entries.filter((e) => e.kind !== "unchanged");
        return (
          <div
            id={`tool-explorer-diff-${toolName}`}
            data-testid={`tool-explorer-diff-${toolName}`}
            className="rounded-md border bg-muted/40 p-3 text-xs space-y-2"
          >
            <p className="font-medium text-sm">
              Changes since previous request
              {changed.length === 0 ? (
                <span className="ml-2 font-normal text-muted-foreground">
                  (no fields changed)
                </span>
              ) : null}
            </p>
            {changed.length > 0 ? (
              <ul className="space-y-1 font-mono">
                {changed.map((e) => {
                  const tag =
                    e.kind === "added"
                      ? { label: "added", cls: "text-emerald-600 dark:text-emerald-400" }
                      : e.kind === "removed"
                        ? { label: "removed", cls: "text-destructive" }
                        : { label: "changed", cls: "text-amber-600 dark:text-amber-400" };
                  return (
                    <li key={e.key} className="flex flex-wrap items-baseline gap-2">
                      <span className={`uppercase tracking-wide ${tag.cls}`}>
                        {tag.label}
                      </span>
                      <span className="font-semibold">{e.key}</span>
                      {e.kind !== "added" ? (
                        <span className="text-muted-foreground line-through">
                          {formatArgValue(e.from)}
                        </span>
                      ) : null}
                      {e.kind !== "removed" ? (
                        <span>→ {formatArgValue(e.to)}</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })() : null}

      {(() => {
        const category = classifyOutcome(state.outcome);
        const guidance = category ? guidanceFor(category) : null;
        if (!guidance) return null;
        const toneClass =
          guidance.tone === "destructive"
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200";
        return (
          <div
            role="alert"
            aria-live="polite"
            data-testid={`tool-explorer-guidance-${toolName}`}
            data-category={category}
            className={`rounded-md border p-3 text-sm space-y-2 ${toneClass}`}
          >
            <p className="font-medium">{guidance.title}</p>
            <p>{guidance.body}</p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {guidance.primaryAction === "reconnect" ? (
                <Button asChild size="sm" variant="outline">
                  <Link to="/settings/agent-integrations">
                    <PlugZap className="mr-2 h-4 w-4" aria-hidden />
                    Reconnect this browser
                  </Link>
                </Button>
              ) : null}
              {guidance.primaryAction === "fix_params" && fieldErrors[0] ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const el = document.getElementById(fieldErrors[0].id);
                    if (el) {
                      el.focus();
                      el.scrollIntoView({ block: "center", behavior: "smooth" });
                    }
                  }}
                >
                  Jump to {fieldErrors[0].label}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                onClick={requestRetry}
                disabled={state.loading || invalid || !connected || retryPending}
                aria-haspopup={confirmBeforeRetry ? "dialog" : undefined}
                aria-expanded={retryPending || undefined}
                data-testid={`tool-explorer-retry-${toolName}`}
              >
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
                {guidance.primaryAction === "fix_params" ? "Retry with corrections" : "Retry"}
              </Button>
            </div>
            <label className="flex items-center gap-2 pt-1 text-xs font-normal">
              <Switch
                checked={confirmBeforeRetry}
                onCheckedChange={(v) => {
                  setConfirmBeforeRetry(v);
                  if (v === false) setRetryPending(false);
                }}
                aria-label="Confirm before retry"
                data-testid={`tool-explorer-confirm-toggle-${toolName}`}
              />
              <span>
                Confirm before retry
                <span className="ml-1 text-muted-foreground">
                  (recommended if a tool might have side effects)
                </span>
              </span>
            </label>
            {retryPending ? (
              <div
                role="alertdialog"
                aria-label="Confirm retry"
                data-testid={`tool-explorer-confirm-panel-${toolName}`}
                className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200 space-y-2"
              >
                <p className="font-medium">Re-run this tool?</p>
                <p>
                  The three built-in tools are read-only, but confirming avoids
                  repeating side effects if a future tool ever isn't. The retry
                  will send the current arguments as-is.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={confirmRetry}
                    data-testid={`tool-explorer-confirm-retry-${toolName}`}
                  >
                    Confirm retry
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setRetryPending(false)}
                    data-testid={`tool-explorer-cancel-retry-${toolName}`}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })()}



      <div
        role="status"
        aria-live="polite"
        data-testid={`tool-explorer-result-${toolName}`}
      >
        {state.outcome ? (
          <pre className="bg-muted text-foreground text-xs rounded-md p-4 overflow-x-auto border border-border max-h-96">
            <code>{formatResult(state.outcome)}</code>
          </pre>
        ) : (
          <p className="text-xs text-muted-foreground">
            {connected
              ? "Fill in the parameters and click Run to call this tool as your signed-in account."
              : "Connect this browser to run the tool."}
          </p>
        )}
      </div>
    </section>
  );
}

// ---------- field row with inline validation ----------

function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-xs text-destructive">
      {message}
    </p>
  );
}

export default function McpToolExplorer() {
  const [connected, setConnected] = useState<boolean>(false);

  useEffect(() => {
    setConnected(hasStoredToken());
  }, []);

  const refreshAuth = useCallback(() => {
    setConnected(hasStoredToken());
  }, []);

  const endpoint = `${getSupabaseOrigin()}${MCP_MANIFEST.path}`;

  // list_grows state
  const [includeArchived, setIncludeArchived] = useState(false);
  const [growsLimit, setGrowsLimit] = useState("25");
  const [growsLimitTouched, setGrowsLimitTouched] = useState(false);

  // list_recent_diary_entries state
  const [growId, setGrowId] = useState("");
  const [growIdTouched, setGrowIdTouched] = useState(false);
  const [diaryLimit, setDiaryLimit] = useState("10");
  const [diaryLimitTouched, setDiaryLimitTouched] = useState(false);

  // get_latest_sensor_snapshot state
  const [tentId, setTentId] = useState("");
  const [tentIdTouched, setTentIdTouched] = useState(false);

  // Live per-field validation (always computed; shown once touched).
  const growsLimitError = validateOptionalIntInRange(growsLimit, 1, 100, "limit");
  const growIdError = validateRequiredUuid(growId, "growId");
  const diaryLimitError = validateOptionalIntInRange(diaryLimit, 1, 50, "limit");
  const tentIdError = validateRequiredUuid(tentId, "tentId");

  const listGrowsErrors: FieldError[] = [];
  if (growsLimitError) {
    listGrowsErrors.push({
      id: "list-grows-limit",
      label: "Limit",
      message: growsLimitError,
    });
  }

  const listDiaryErrors: FieldError[] = [];
  if (growIdError) {
    listDiaryErrors.push({ id: "list-diary-grow", label: "Grow id", message: growIdError });
  }
  if (diaryLimitError) {
    listDiaryErrors.push({
      id: "list-diary-limit",
      label: "Limit",
      message: diaryLimitError,
    });
  }

  const sensorErrors: FieldError[] = [];
  if (tentIdError) {
    sensorErrors.push({ id: "sensor-tent", label: "Tent id", message: tentIdError });
  }

  return (
    <section
      className="space-y-5"
      aria-label="Interactive MCP tool explorer"
      data-testid="mcp-tool-explorer"
    >
      <div className="rounded-2xl border p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Try the tools</h2>
            <p className="text-sm text-muted-foreground max-w-prose">
              Run each MCP tool from this page using the browser OAuth session you
              minted on Settings → Agent integrations. Calls are made as your
              signed-in account and are RLS-scoped to your own data.
            </p>
          </div>
          {connected ? (
            <Badge variant="default" data-testid="tool-explorer-status">
              Connected in this browser
            </Badge>
          ) : (
            <Badge variant="outline" data-testid="tool-explorer-status">
              Not connected
            </Badge>
          )}
        </div>
        {!connected ? (
          <div
            className="flex flex-wrap items-center gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
            data-testid="tool-explorer-connect-cta"
          >
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
            <span className="flex-1">
              This explorer needs a browser OAuth session. Connect once from
              Settings → Agent integrations, then return here.
            </span>
            <Button asChild size="sm">
              <Link to="/settings/agent-integrations">
                <PlugZap className="mr-2 h-4 w-4" aria-hidden /> Connect this browser
              </Link>
            </Button>
            <Button size="sm" variant="outline" onClick={refreshAuth}>
              I've connected — refresh
            </Button>
          </div>
        ) : null}
      </div>

      <ToolCard
        toolName="list_grows"
        endpoint={endpoint}
        connected={connected}
        onAuthLost={refreshAuth}
        fieldErrors={growsLimitTouched ? listGrowsErrors : []}
        buildArgs={() => {
          const args: Record<string, unknown> = {};
          if (includeArchived) args.includeArchived = true;
          const n = coerceOptionalInt(growsLimit);
          if (n !== undefined) args.limit = n;
          return args;
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <Label htmlFor="list-grows-archived">Include archived</Label>
            <p className="text-xs text-muted-foreground">Defaults to false.</p>
          </div>
          <Switch
            id="list-grows-archived"
            checked={includeArchived}
            onCheckedChange={setIncludeArchived}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="list-grows-limit">
            Limit <span className="text-muted-foreground">(optional, 1–100)</span>
          </Label>
          <Input
            id="list-grows-limit"
            inputMode="numeric"
            value={growsLimit}
            onChange={(e) => {
              setGrowsLimit(e.target.value);
              setGrowsLimitTouched(true);
            }}
            onBlur={() => setGrowsLimitTouched(true)}
            aria-invalid={growsLimitTouched && !!growsLimitError}
            aria-describedby={
              growsLimitTouched && growsLimitError ? "list-grows-limit-error" : undefined
            }
            placeholder="25"
          />
          {growsLimitTouched ? (
            <FieldError id="list-grows-limit-error" message={growsLimitError} />
          ) : null}
        </div>
      </ToolCard>

      <ToolCard
        toolName="list_recent_diary_entries"
        endpoint={endpoint}
        connected={connected}
        onAuthLost={refreshAuth}
        fieldErrors={[
          ...(growIdTouched && growIdError
            ? [{ id: "list-diary-grow", label: "Grow id", message: growIdError }]
            : []),
          ...(diaryLimitTouched && diaryLimitError
            ? [{ id: "list-diary-limit", label: "Limit", message: diaryLimitError }]
            : []),
        ]}
        buildArgs={() => {
          const args: Record<string, unknown> = { growId: growId.trim() };
          const n = coerceOptionalInt(diaryLimit);
          if (n !== undefined) args.limit = n;
          return args;
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="list-diary-grow">
            Grow id <span className="text-muted-foreground">(required UUID)</span>
          </Label>
          <Input
            id="list-diary-grow"
            value={growId}
            onChange={(e) => {
              setGrowId(e.target.value);
              setGrowIdTouched(true);
            }}
            onBlur={() => setGrowIdTouched(true)}
            aria-invalid={growIdTouched && !!growIdError}
            aria-describedby={
              growIdTouched && growIdError ? "list-diary-grow-error" : undefined
            }
            placeholder="e.g. 3f2e1a4b-…-9d2f"
            spellCheck={false}
          />
          {growIdTouched ? (
            <FieldError id="list-diary-grow-error" message={growIdError} />
          ) : (
            <p className="text-xs text-muted-foreground">
              Tip: run <code className="font-mono">list_grows</code> above to copy an
              id from your own grows.
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="list-diary-limit">
            Limit <span className="text-muted-foreground">(optional, 1–50)</span>
          </Label>
          <Input
            id="list-diary-limit"
            inputMode="numeric"
            value={diaryLimit}
            onChange={(e) => {
              setDiaryLimit(e.target.value);
              setDiaryLimitTouched(true);
            }}
            onBlur={() => setDiaryLimitTouched(true)}
            aria-invalid={diaryLimitTouched && !!diaryLimitError}
            aria-describedby={
              diaryLimitTouched && diaryLimitError ? "list-diary-limit-error" : undefined
            }
            placeholder="10"
          />
          {diaryLimitTouched ? (
            <FieldError id="list-diary-limit-error" message={diaryLimitError} />
          ) : null}
        </div>
      </ToolCard>

      <ToolCard
        toolName="get_latest_sensor_snapshot"
        endpoint={endpoint}
        connected={connected}
        onAuthLost={refreshAuth}
        fieldErrors={tentIdTouched ? sensorErrors : []}
        buildArgs={() => ({ tentId: tentId.trim() })}
      >
        <div className="space-y-1">
          <Label htmlFor="sensor-tent">
            Tent id <span className="text-muted-foreground">(required UUID)</span>
          </Label>
          <Input
            id="sensor-tent"
            value={tentId}
            onChange={(e) => {
              setTentId(e.target.value);
              setTentIdTouched(true);
            }}
            onBlur={() => setTentIdTouched(true)}
            aria-invalid={tentIdTouched && !!tentIdError}
            aria-describedby={
              tentIdTouched && tentIdError ? "sensor-tent-error" : "sensor-tent-hint"
            }
            placeholder="e.g. 8a13c9f0-…-9d2f"
            spellCheck={false}
          />
          {tentIdTouched && tentIdError ? (
            <FieldError id="sensor-tent-error" message={tentIdError} />
          ) : (
            <p id="sensor-tent-hint" className="text-xs text-muted-foreground">
              Only <code className="font-mono">current_live=true</code> readings are
              current live telemetry — every other label stays as-is.
            </p>
          )}
        </div>
      </ToolCard>
    </section>
  );
}
