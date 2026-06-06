/**
 * SensorsTestbenchPanel — Sensors-page panel that:
 *
 *   1. Surfaces a Testbench vs Live indicator for the selected tent based
 *      on recent sensor_readings rows (read-only). Testbench-tagged data
 *      is NEVER rendered as Live.
 *   2. Lets the grower mint a tent-scoped bridge token (plaintext shown
 *      once, never persisted).
 *   3. Generates a PowerShell snippet for the Windows EcoWitt listener
 *      using the selected tent_id + (if just-minted) bridge token.
 *   4. Provides a "Send test EcoWitt payload" button that POSTs an
 *      EcoWitt-form-style sample to sensor-ingest-webhook using the
 *      just-minted bridge token (in-memory only) and renders the verbatim
 *      response.
 *
 * Safety:
 *  - Bridge token plaintext lives in local component state only. It is
 *    never logged, never persisted, never sent to analytics. Dismiss
 *    clears it.
 *  - No service_role. Auth is the bridge token Bearer header for tests.
 *  - No device control. No automation. Testbench is auditable, not live.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Copy, KeyRound, Send, ShieldAlert, Activity, CheckCircle2, XCircle, Server, Trash2, Terminal, FileJson, History, Download, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import {
  classifySensorTestbench,
  buildEcowittPowerShellSnippet,
  type SensorTestbenchClassification,
} from "@/lib/sensorTestbenchIndicatorRules";
import {
  BRIDGE_TOKEN_DEFAULT_TTL_DAYS,
  bridgeTokenStatus,
  clampTtlDays,
  formatIngestCount,
  looksLikeBridgeToken,
  sanitizeTokenName,
  type BridgeTokenRow,
} from "@/lib/bridgeTokenRules";
import {
  buildEnvMatchChecklist,
  classifySensorIngestTestResult,
} from "@/lib/sensorIngestTestResultRules";
import {
  buildDownloadFilename,
  buildHistoryExport,
  buildPowerShellIngestTestScript,
  buildRedactedPayloadPreview,
  buildSensorIngestCurl,
  buildSensorIngestHistoryItem,
  buildSensorIngestTestPayload,
  diagnosticsExportToJson,
  diagnosticsExportToText,
  historyExportToJson,
  SENSOR_INGEST_HISTORY_MAX,
  type SensorIngestHistoryItem,
} from "@/lib/sensorDiagnosticsExportRules";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const INGEST_URL = `${SUPABASE_URL}/functions/v1/sensor-ingest-webhook`;


interface Props {
  tentId: string | null;
  tentName?: string | null;
}

interface TestPayloadResult {
  status: number;

  ok: boolean;
  body: unknown;
}

function indicatorBadge(c: SensorTestbenchClassification) {
  if (c.indicator === "testbench") {
    return (
      <Badge
        variant="secondary"
        data-testid="sensors-testbench-indicator"
        data-state="testbench"
        className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      >
        EcoWitt testbench
      </Badge>
    );
  }
  if (c.indicator === "live") {
    return (
      <Badge
        variant="secondary"
        data-testid="sensors-testbench-indicator"
        data-state="live"
        className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      >
        Live connected sensor
      </Badge>
    );
  }
  if (c.indicator === "stale") {
    return (
      <Badge
        variant="outline"
        data-testid="sensors-testbench-indicator"
        data-state="stale"
      >
        Stale — no recent ingest
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      data-testid="sensors-testbench-indicator"
      data-state="none"
    >
      No ingest yet
    </Badge>
  );
}

function relativeFromIso(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return new Date(iso).toLocaleString();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function SensorsTestbenchPanel({ tentId, tentName }: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Array<{ source: string | null; captured_at: string | null; created_at: string | null; raw_payload: unknown }>>([]);
  const [ingestCount, setIngestCount] = useState<number>(0);
  const [tokenName, setTokenName] = useState("ecowitt-testbench");
  const [ttlDays, setTtlDays] = useState<number>(BRIDGE_TOKEN_DEFAULT_TTL_DAYS);
  const [reveal, setReveal] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<TestPayloadResult | null>(null);
  const [tokens, setTokens] = useState<BridgeTokenRow[]>([]);
  const [history, setHistory] = useState<SensorIngestHistoryItem[]>([]);
  const [lastPayload, setLastPayload] = useState<unknown>(null);

  // Reset reveal/result/history when tent changes — plaintext token must
  // never be reused across tents, and history is per-tent only.
  useEffect(() => {
    setReveal(null);
    setResult(null);
    setHistory([]);
    setLastPayload(null);
  }, [tentId]);


  useEffect(() => {
    let cancelled = false;
    if (!tentId) {
      setRows([]);
      setIngestCount(0);
      setTokens([]);
      return;
    }
    (async () => {
      const [{ data: latest }, { count }, { data: tokenRows }] = await Promise.all([
        supabase
          .from("sensor_readings")
          .select("source, captured_at, created_at, raw_payload")
          .eq("tent_id", tentId)
          .order("captured_at", { ascending: false })
          .limit(10),
        supabase
          .from("sensor_readings")
          .select("id", { count: "exact", head: true })
          .eq("tent_id", tentId),
        supabase
          .from("bridge_tokens")
          .select(
            "id, name, token_prefix, expires_at, last_used_at, first_used_at, ingest_count, revoked_at, created_at",
          )
          .eq("tent_id", tentId)
          .order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      setRows((latest ?? []) as typeof rows);
      setIngestCount(count ?? 0);
      setTokens((tokenRows ?? []) as BridgeTokenRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [tentId, result, minting]);

  const classification = useMemo(
    () => classifySensorTestbench({ rows }),
    [rows],
  );

  const activeToken = useMemo<BridgeTokenRow | null>(() => {
    const active = tokens.find((t) => bridgeTokenStatus(t) === "active");
    return active ?? tokens[0] ?? null;
  }, [tokens]);

  const envMatch = useMemo(
    () =>
      buildEnvMatchChecklist({
        supabaseUrl: SUPABASE_URL,
        ingestUrl: INGEST_URL,
        tentId,
        hasActiveToken: !!activeToken && bridgeTokenStatus(activeToken) === "active",
        tokenTentScoped: true, // tokens query is filtered by tent_id
        lastIngestAtIso: activeToken?.last_used_at ?? classification.latestAtIso,
      }),
    [tentId, activeToken, classification.latestAtIso],
  );

  const resultClass = useMemo(() => {
    if (!result) return null;
    return classifySensorIngestTestResult({
      status: result.status,
      body: result.body,
      networkError: result.status === 0,
    });
  }, [result]);


  const powershell = useMemo(
    () =>
      buildEcowittPowerShellSnippet({
        tentId,
        bridgeTokenPlaintext: reveal,
        ingestUrl: INGEST_URL,
      }),
    [tentId, reveal],
  );

  async function mint() {
    if (!tentId) return;
    setMinting(true);
    setReveal(null);
    setResult(null);
    const { data, error } = await supabase.functions.invoke("mint-bridge-token", {
      body: {
        tent_id: tentId,
        name: sanitizeTokenName(tokenName),
        ttl_days: clampTtlDays(ttlDays),
      },
    });
    setMinting(false);
    if (error || !data?.ok || !looksLikeBridgeToken(data?.token ?? "")) {
      toast({
        title: "Mint failed",
        description: error?.message ?? data?.error ?? "Unknown error",
        variant: "destructive",
      });
      return;
    }
    setReveal(data.token as string);
  }

  async function sendTestPayload() {
    if (!tentId || !reveal) return;
    setSending(true);
    setResult(null);
    const capturedAt = new Date().toISOString();
    const payload = buildSensorIngestTestPayload({
      tentId,
      capturedAtIso: capturedAt,
    });
    setLastPayload(payload);
    const idempotencyKey = `testbench-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let res: Response | null = null;
    let body: unknown = null;
    let status = 0;
    let networkError = false;
    try {
      res = await fetch(INGEST_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${reveal}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
      status = res.status;
      try {
        body = await res.json();
      } catch {
        body = { error: "non_json_response" };
      }
    } catch (err) {
      networkError = true;
      body = { error: "network_error", message: (err as Error).message };
    }
    setSending(false);
    setResult({ status, ok: !!res?.ok, body });
    // Append to local history (newest first, capped). History items do not
    // store Authorization headers or plaintext tokens.
    const classification = classifySensorIngestTestResult({ status, body, networkError });
    const item = buildSensorIngestHistoryItem({
      attempted_at: capturedAt,
      request_url: INGEST_URL,
      idempotency_key: idempotencyKey,
      http_status: status,
      body,
      classification,
    });
    setHistory((prev) => [item, ...prev].slice(0, SENSOR_INGEST_HISTORY_MAX));
  }

  async function safeCopy(text: string, label: string) {
    try {
      if (!navigator.clipboard?.writeText) {
        toast({
          title: "Clipboard unavailable — select and copy manually.",
          variant: "destructive",
        });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copied` });
    } catch {
      toast({
        title: "Clipboard unavailable — select and copy manually.",
        variant: "destructive",
      });
    }
  }


  async function copyPowerShell() {
    await safeCopy(powershell, "PowerShell snippet");
  }

  function buildDiagnosticsPayload() {
    return {
      generated_at: new Date().toISOString(),
      supabase_url: SUPABASE_URL ?? null,
      ingest_url: INGEST_URL,
      tent_id: tentId,
      tent_name: tentName ?? null,
      token: activeToken
        ? {
            token_prefix: activeToken.token_prefix,
            name: activeToken.name,
            status: bridgeTokenStatus(activeToken),
            last_used_at: activeToken.last_used_at,
            ingest_count: activeToken.ingest_count,
            expires_at: activeToken.expires_at,
          }
        : null,
      env_match: envMatch,
      latest_test_result:
        result && resultClass
          ? {
              attempted_at: history[0]?.attempted_at ?? new Date().toISOString(),
              http_status: result.status,
              classification: resultClass.category,
              headline: resultClass.headline,
              body: result.body,
            }
          : null,
    };
  }

  async function copyDiagnosticsJson() {
    await safeCopy(
      diagnosticsExportToJson(buildDiagnosticsPayload()),
      "Diagnostics JSON",
    );
  }

  async function copyDiagnosticsText() {
    await safeCopy(
      diagnosticsExportToText(buildDiagnosticsPayload()),
      "Diagnostics text",
    );
  }

  async function copyCurl() {
    const cmd = buildSensorIngestCurl({
      ingestUrl: INGEST_URL,
      tentId,
      bridgeTokenPlaintext: reveal,
      idempotencyKey: `testbench-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      capturedAtIso: new Date().toISOString(),
    });
    await safeCopy(cmd, "curl command");
  }

  function clearHistory() {
    setHistory([]);
  }


  if (!tentId) {
    return null;
  }

  return (
    <div
      className="glass rounded-2xl p-4 mt-4"
      data-testid="sensors-testbench-panel"
    >
      <div className="flex items-center gap-2 mb-1">
        <Activity className="size-4 text-muted-foreground" />
        <h2 className="font-display font-semibold">EcoWitt testbench &amp; setup</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {indicatorBadge(classification)}
        <span className="text-xs text-muted-foreground" data-testid="sensors-testbench-last-ingest">
          Last ingest: {relativeFromIso(classification.latestAtIso)}
        </span>
        <span className="text-xs text-muted-foreground" data-testid="sensors-testbench-ingest-count">
          · {ingestCount} ingest{ingestCount === 1 ? "" : "s"}
        </span>
        {classification.source && (
          <span className="text-xs text-muted-foreground">· source: {classification.source}</span>
        )}
        {classification.vendor && (
          <span className="text-xs text-muted-foreground" data-testid="sensors-testbench-vendor">
            · vendor: {classification.vendor}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Testbench data is auditable but is <strong>not</strong> production live
        sensor state. Promote to live by minting a production bridge token and
        pointing your real EcoWitt gateway at this tent.
      </p>

      {/* Environment diagnostics — proves the app, endpoint, tent, and token
          are all scoped to the same Lovable Cloud project. */}
      <div
        className="rounded-lg border border-border/60 p-3 mb-3"
        data-testid="sensors-diagnostics"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Server className="size-4 text-muted-foreground" />
            <div className="text-sm font-medium">Environment diagnostics</div>
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={copyDiagnosticsJson}
              data-testid="sensors-diag-copy-json"
            >
              <FileJson className="size-3 mr-1" /> JSON
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={copyDiagnosticsText}
              data-testid="sensors-diag-copy-text"
            >
              <Copy className="size-3 mr-1" /> Text
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={copyCurl}
              data-testid="sensors-diag-copy-curl"
              title="Contains token if copied during reveal. Do not paste into chat, screenshots, or git."
            >
              <Terminal className="size-3 mr-1" /> curl
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mb-2">
          Exports contain safe identity only. The curl button includes the
          bridge token only while the one-time reveal is in memory — do not
          paste it into chat, screenshots, or git. Revoke any token that leaks.
        </p>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-muted-foreground">App Supabase URL</dt>
          <dd
            className="font-mono break-all"
            data-testid="sensors-diag-supabase-url"
          >
            {SUPABASE_URL || "—"}
          </dd>
          <dt className="text-muted-foreground">Ingest endpoint</dt>
          <dd
            className="font-mono break-all"
            data-testid="sensors-diag-ingest-url"
          >
            {INGEST_URL}
          </dd>
          <dt className="text-muted-foreground">Selected tent</dt>
          <dd
            className="font-mono break-all"
            data-testid="sensors-diag-tent-uuid"
          >
            {tentName ? `${tentName} · ` : ""}
            {tentId}
          </dd>
          <dt className="text-muted-foreground">Bridge token</dt>
          <dd data-testid="sensors-diag-token-identity">
            {activeToken ? (
              <span>
                <span className="font-mono">{activeToken.token_prefix}…</span>{" "}
                <span className="text-muted-foreground">
                  ({activeToken.name})
                </span>{" "}
                <Badge
                  variant="outline"
                  className="ml-1 text-[10px]"
                  data-testid="sensors-diag-token-status"
                  data-state={bridgeTokenStatus(activeToken)}
                >
                  {bridgeTokenStatus(activeToken)}
                </Badge>
              </span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">
                No bridge token minted for this tent
              </span>
            )}
          </dd>
          <dt className="text-muted-foreground">Token last used</dt>
          <dd data-testid="sensors-diag-token-last-used">
            {activeToken?.last_used_at
              ? `${relativeFromIso(activeToken.last_used_at)} (${activeToken.last_used_at})`
              : "—"}
          </dd>
          <dt className="text-muted-foreground">Token ingest count</dt>
          <dd data-testid="sensors-diag-token-ingest-count">
            {activeToken ? formatIngestCount(activeToken.ingest_count) : "—"}
          </dd>
        </dl>

        <div className="mt-3 border-t border-border/40 pt-2">
          <div className="text-xs font-medium mb-1">Environment match</div>
          <ul className="space-y-1" data-testid="sensors-diag-env-match">
            {envMatch.map((item) => (
              <li
                key={item.key}
                className="flex items-start gap-1.5 text-[11px]"
                data-testid={`sensors-diag-env-match-${item.key}`}
                data-ok={item.ok ? "true" : "false"}
              >
                {item.ok ? (
                  <CheckCircle2 className="size-3 mt-0.5 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="size-3 mt-0.5 shrink-0 text-amber-600" />
                )}
                <span>
                  <span className={item.ok ? "" : "text-amber-700 dark:text-amber-300"}>
                    {item.label}
                  </span>
                  {item.hint && (
                    <span className="text-muted-foreground"> — {item.hint}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>


      <div className="rounded-lg border border-border/60 p-3 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <KeyRound className="size-4 text-muted-foreground" />
          <div className="text-sm font-medium">Mint a testbench bridge token</div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 mb-2">
          <Input
            aria-label="Token name"
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
            maxLength={60}
            className="sm:max-w-xs"
          />
          <Input
            aria-label="Expires in days"
            type="number"
            min={1}
            max={365}
            value={ttlDays}
            onChange={(e) => setTtlDays(Number(e.target.value))}
            className="sm:max-w-[120px]"
          />
          <Button
            onClick={mint}
            disabled={minting}
            data-testid="sensors-testbench-mint-btn"
          >
            {minting ? "Minting…" : "Mint token"}
          </Button>
        </div>
        {reveal && (
          <div
            className="rounded-md border border-primary/40 bg-primary/5 p-2 mb-2"
            role="alert"
            data-testid="sensors-testbench-token-reveal"
          >
            <div className="text-xs font-medium mb-1">
              New token — shown once, copy now
            </div>
            <code className="text-xs break-all select-all">{reveal}</code>
            <p className="text-[11px] text-muted-foreground mt-1 flex items-start gap-1">
              <ShieldAlert className="size-3 mt-0.5 shrink-0" />
              Do not paste this token into chats, screenshots, or git. If it
              leaks, revoke it from the tent detail page.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border/60 p-3 mb-3">
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="text-sm font-medium">Windows EcoWitt listener — PowerShell config</div>
          <Button size="sm" variant="outline" onClick={copyPowerShell}>
            <Copy className="size-3 mr-1" /> Copy
          </Button>
        </div>
        <pre
          className="text-[11px] bg-muted/40 rounded p-2 overflow-x-auto whitespace-pre"
          data-testid="sensors-testbench-powershell"
        >{powershell}</pre>
        <p className="text-[11px] text-muted-foreground mt-2">
          EcoWitt gateway settings: <strong>Protocol</strong> Ecowitt ·{" "}
          <strong>Host</strong> your PC IP · <strong>Port</strong> 8787 ·{" "}
          <strong>Path</strong> /ecowitt. Tent: {tentName ?? tentId}.
        </p>
      </div>

      <div className="rounded-lg border border-border/60 p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-sm font-medium">Send a test EcoWitt payload</div>
          <Button
            size="sm"
            onClick={sendTestPayload}
            disabled={!reveal || sending}
            data-testid="sensors-testbench-send-btn"
          >
            <Send className="size-3 mr-1" />
            {sending ? "Sending…" : "Send test payload"}
          </Button>
        </div>
        {!reveal && (
          <p className="text-xs text-muted-foreground">
            Mint a token above to enable the test send. Test payloads are tagged
            <code className="mx-1">vendor=ecowitt_windows_testbench</code> and
            <code className="mx-1">metadata.confidence=test</code> — they will
            appear as testbench, not live.
          </p>
        )}
        {result && resultClass && (
          <div
            className="mt-2 text-xs"
            data-testid="sensors-testbench-result"
            data-status={result.status}
            data-ok={result.ok ? "true" : "false"}
            data-category={resultClass.category}
          >
            <div
              className={`font-medium mb-1 ${resultClass.isSuccess ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}
              data-testid="sensors-testbench-result-headline"
            >
              {resultClass.headline}
            </div>
            <div
              className="text-muted-foreground mb-2"
              data-testid="sensors-testbench-result-detail"
            >
              {resultClass.detail}
            </div>
            <pre className="bg-muted/40 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
{JSON.stringify(result.body, null, 2)}
            </pre>
          </div>
        )}

        {history.length > 0 && (
          <div
            className="mt-3 border-t border-border/40 pt-2"
            data-testid="sensors-testbench-history"
          >
            <div className="flex items-center justify-between mb-1 gap-2">
              <div className="text-xs font-medium flex items-center gap-1">
                <History className="size-3" />
                Local test history — clears on refresh
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={clearHistory}
                data-testid="sensors-testbench-history-clear"
              >
                <Trash2 className="size-3 mr-1" /> Clear
              </Button>
            </div>
            <ul className="space-y-1">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="rounded border border-border/50 p-2 text-[11px]"
                  data-testid="sensors-testbench-history-item"
                  data-status={h.http_status}
                  data-category={h.classification}
                >
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="font-mono">{h.attempted_at}</span>
                    <span>·</span>
                    <span className="font-medium">HTTP {h.http_status}</span>
                    <span>·</span>
                    <span>{h.classification}</span>
                    {h.inserted !== null && (
                      <span className="text-muted-foreground">
                        · inserted {h.inserted}
                      </span>
                    )}
                    {h.skipped_duplicate !== null && (
                      <span className="text-muted-foreground">
                        · dup {h.skipped_duplicate}
                      </span>
                    )}
                    {h.rejected_count !== null && (
                      <span className="text-muted-foreground">
                        · rejected {h.rejected_count}
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground break-all">
                    key: {h.idempotency_key}
                  </div>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-muted-foreground">
                      response body
                    </summary>
                    <pre className="bg-muted/40 rounded p-2 mt-1 overflow-x-auto whitespace-pre-wrap break-words">
{JSON.stringify(h.body, null, 2)}
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

