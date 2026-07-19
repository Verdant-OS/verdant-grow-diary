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
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Play, PlugZap, ShieldAlert } from "lucide-react";
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
}

const EMPTY: RunState = { loading: false, outcome: null, ranAt: null };

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

function ToolCard({
  toolName,
  endpoint,
  connected,
  children,
  buildArgs,
  onAuthLost,
}: {
  toolName: ToolName;
  endpoint: string;
  connected: boolean;
  children: React.ReactNode;
  buildArgs: () => { ok: true; args: Record<string, unknown> } | { ok: false; error: string };
  onAuthLost: () => void;
}) {
  const [state, setState] = useState<RunState>(EMPTY);
  const [validationError, setValidationError] = useState<string | null>(null);

  const tool = useMemo(
    () => MCP_MANIFEST.tools.find((t) => t.name === toolName)!,
    [toolName],
  );

  const run = useCallback(async () => {
    setValidationError(null);
    const built = buildArgs();
    if (built.ok === false) {
      setValidationError(built.error);
      return;
    }
    setState({ loading: true, outcome: null, ranAt: null });
    const outcome = await callMcpTool(endpoint, toolName, built.args);
    setState({ loading: false, outcome, ranAt: new Date().toISOString() });
    if (outcome.status === "unauthorized" || outcome.status === "not_connected") {
      onAuthLost();
    }
  }, [buildArgs, endpoint, toolName, onAuthLost]);

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

      {validationError ? (
        <div className="text-sm text-destructive" role="alert">
          {validationError}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={run}
          disabled={!connected || state.loading}
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
      </div>

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

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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

  // list_recent_diary_entries state
  const [growId, setGrowId] = useState("");
  const [diaryLimit, setDiaryLimit] = useState("10");

  // get_latest_sensor_snapshot state
  const [tentId, setTentId] = useState("");

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
        buildArgs={() => {
          const args: Record<string, unknown> = {};
          if (includeArchived) args.includeArchived = true;
          const trimmed = growsLimit.trim();
          if (trimmed) {
            const n = Number(trimmed);
            if (!Number.isInteger(n) || n < 1 || n > 100) {
              return { ok: false, error: "limit must be an integer between 1 and 100." };
            }
            args.limit = n;
          }
          return { ok: true, args };
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
          <Label htmlFor="list-grows-limit">Limit (1–100)</Label>
          <Input
            id="list-grows-limit"
            inputMode="numeric"
            value={growsLimit}
            onChange={(e) => setGrowsLimit(e.target.value)}
            placeholder="25"
          />
        </div>
      </ToolCard>

      <ToolCard
        toolName="list_recent_diary_entries"
        endpoint={endpoint}
        connected={connected}
        onAuthLost={refreshAuth}
        buildArgs={() => {
          const trimmedGrow = growId.trim();
          if (!trimmedGrow || !UUID_RE.test(trimmedGrow)) {
            return { ok: false, error: "growId must be a UUID from one of your grows." };
          }
          const args: Record<string, unknown> = { growId: trimmedGrow };
          const trimmedLimit = diaryLimit.trim();
          if (trimmedLimit) {
            const n = Number(trimmedLimit);
            if (!Number.isInteger(n) || n < 1 || n > 50) {
              return { ok: false, error: "limit must be an integer between 1 and 50." };
            }
            args.limit = n;
          }
          return { ok: true, args };
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="list-diary-grow">Grow id (UUID)</Label>
          <Input
            id="list-diary-grow"
            value={growId}
            onChange={(e) => setGrowId(e.target.value)}
            placeholder="e.g. 3f2e…-b1c0"
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">
            Tip: run <code className="font-mono">list_grows</code> above to copy an id
            from your own grows.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="list-diary-limit">Limit (1–50)</Label>
          <Input
            id="list-diary-limit"
            inputMode="numeric"
            value={diaryLimit}
            onChange={(e) => setDiaryLimit(e.target.value)}
            placeholder="10"
          />
        </div>
      </ToolCard>

      <ToolCard
        toolName="get_latest_sensor_snapshot"
        endpoint={endpoint}
        connected={connected}
        onAuthLost={refreshAuth}
        buildArgs={() => {
          const trimmed = tentId.trim();
          if (!trimmed || !UUID_RE.test(trimmed)) {
            return { ok: false, error: "tentId must be a UUID from one of your tents." };
          }
          return { ok: true, args: { tentId: trimmed } };
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="sensor-tent">Tent id (UUID)</Label>
          <Input
            id="sensor-tent"
            value={tentId}
            onChange={(e) => setTentId(e.target.value)}
            placeholder="e.g. 8a13…-9d2f"
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">
            Only <code className="font-mono">current_live=true</code> readings are
            current live telemetry — every other label stays as-is.
          </p>
        </div>
      </ToolCard>
    </section>
  );
}
