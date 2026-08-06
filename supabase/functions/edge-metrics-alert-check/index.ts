/**
 * edge-metrics-alert-check — evaluates persisted
 * `public.edge_function_metric_events` for elevated `rpc_error` /
 * `startup_import_failed` rates and fires an alert when any threshold is
 * exceeded over the configured window.
 *
 * INTENDED USE:
 *  - Invoked on a schedule (pg_cron -> pg_net POST) every few minutes.
 *  - Also callable manually by operators (verified via has_role).
 *
 * CONFIG (env, all optional — sane defaults):
 *  - ALERT_WINDOW_MINUTES         default 15
 *  - ALERT_RPC_ERROR_THRESHOLD    default 5   (absolute count in window)
 *  - ALERT_RPC_ERROR_RATE         default 0.2 (share of requests, 0..1)
 *  - ALERT_STARTUP_FAILURE_THRESHOLD default 1
 *  - ALERT_MIN_REQUESTS           default 10  (skip rate check below this)
 *  - ALERT_COOLDOWN_MINUTES       default 60  (dedupe window per fn+metric)
 *  - ALERT_WEBHOOK_URL            Slack-compatible incoming webhook. If
 *                                 unset, the function only reports JSON.
 *  - ALERT_WEBHOOK_TIMEOUT_MS     default 5000
 *  - ALERT_WEBHOOK_MAX_ATTEMPTS   default 4    (initial try + retries)
 *  - ALERT_WEBHOOK_BASE_DELAY_MS  default 500  (exponential backoff base)
 *  - ALERT_WEBHOOK_MAX_DELAY_MS   default 8000 (cap per-attempt delay)
 *
 * SAFETY:
 *  - Reads with the service-role client (aggregate counts only, no PII).
 *  - Operator role required for manual invocation. Scheduled cron uses
 *    the anon-key path but the function only ever returns aggregate
 *    counts.
 *  - Webhook payload contains counts + fn names + env — never PII, never
 *    request IDs.
 *  - Cooldown state lives in `public.edge_metrics_alert_dispatches`
 *    (service-role only). While a (fn, metric) is inside its cooldown
 *    window it is reported as `suppressed` and NOT posted to the
 *    webhook, preventing repeat firing on the same breach condition.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const FN = "edge-metrics-alert-check";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id, x-alert-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-request-id",
};

const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveRequestId(req: Request): string {
  const raw = req.headers.get("x-request-id")?.trim();
  if (raw && REQUEST_ID_RE.test(raw)) return raw.toLowerCase();
  return crypto.randomUUID();
}

function json(status: number, body: Record<string, unknown>, requestId: string): Response {
  return new Response(JSON.stringify({ ...body, request_id: requestId }), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "x-request-id": requestId,
    },
  });
}

function fail(status: number, errorCode: string, message: string, requestId: string): Response {
  return json(status, { error: message, error_code: errorCode }, requestId);
}

function log(
  severity: "info" | "warn" | "error",
  event: string,
  extra: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({ fn: FN, ts: new Date().toISOString(), severity, event, ...extra });
  if (severity === "error") console.error(line);
  else if (severity === "warn") console.warn(line);
  else console.log(line);
}

function numEnv(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

interface Thresholds {
  windowMinutes: number;
  rpcErrorCount: number;
  rpcErrorRate: number;
  startupFailureCount: number;
  minRequests: number;
  cooldownMinutes: number;
}

function loadThresholds(): Thresholds {
  return {
    windowMinutes: numEnv("ALERT_WINDOW_MINUTES", 15),
    rpcErrorCount: numEnv("ALERT_RPC_ERROR_THRESHOLD", 5),
    rpcErrorRate: numEnv("ALERT_RPC_ERROR_RATE", 0.2),
    startupFailureCount: numEnv("ALERT_STARTUP_FAILURE_THRESHOLD", 1),
    minRequests: numEnv("ALERT_MIN_REQUESTS", 10),
    cooldownMinutes: numEnv("ALERT_COOLDOWN_MINUTES", 60),
  };
}

interface EventRow {
  fn: string;
  outcome: string | null;
  observed_at: string;
}

interface Breach {
  fn: string;
  metric: "rpc_error_count" | "rpc_error_rate" | "startup_import_failed";
  value: number;
  threshold: number;
  requests_in_window: number;
}

function evaluate(rows: EventRow[], t: Thresholds): Breach[] {
  // Group per-fn counts.
  const perFn = new Map<string, { total: number; rpcError: number; startupFail: number }>();
  for (const r of rows) {
    const bucket = perFn.get(r.fn) ?? { total: 0, rpcError: 0, startupFail: 0 };
    bucket.total += 1;
    if (r.outcome === "rpc_error") bucket.rpcError += 1;
    if (r.outcome === "startup_import_failed") bucket.startupFail += 1;
    perFn.set(r.fn, bucket);
  }
  const breaches: Breach[] = [];
  for (const [fn, b] of perFn) {
    if (b.startupFail >= t.startupFailureCount && t.startupFailureCount > 0) {
      breaches.push({
        fn,
        metric: "startup_import_failed",
        value: b.startupFail,
        threshold: t.startupFailureCount,
        requests_in_window: b.total,
      });
    }
    if (b.rpcError >= t.rpcErrorCount && t.rpcErrorCount > 0) {
      breaches.push({
        fn,
        metric: "rpc_error_count",
        value: b.rpcError,
        threshold: t.rpcErrorCount,
        requests_in_window: b.total,
      });
    }
    if (b.total >= t.minRequests && t.rpcErrorRate > 0) {
      const rate = b.rpcError / b.total;
      if (rate >= t.rpcErrorRate) {
        breaches.push({
          fn,
          metric: "rpc_error_rate",
          value: Math.round(rate * 1000) / 1000,
          threshold: t.rpcErrorRate,
          requests_in_window: b.total,
        });
      }
    }
  }
  return breaches;
}

interface DispatchRow {
  fn: string;
  metric: string;
  last_fired_at: string;
}

interface SuppressedBreach extends Breach {
  last_fired_at: string;
  next_eligible_at: string;
  cooldown_remaining_seconds: number;
}

function partitionByCooldown(
  breaches: Breach[],
  existing: DispatchRow[],
  now: Date,
  cooldownMinutes: number,
): { toFire: Breach[]; suppressed: SuppressedBreach[] } {
  if (cooldownMinutes <= 0) return { toFire: breaches, suppressed: [] };
  const cooldownMs = cooldownMinutes * 60_000;
  const key = (fn: string, metric: string) => `${fn}::${metric}`;
  const lastByKey = new Map<string, string>();
  for (const row of existing) {
    lastByKey.set(key(row.fn, row.metric), row.last_fired_at);
  }
  const toFire: Breach[] = [];
  const suppressed: SuppressedBreach[] = [];
  for (const b of breaches) {
    const last = lastByKey.get(key(b.fn, b.metric));
    if (!last) {
      toFire.push(b);
      continue;
    }
    const lastMs = Date.parse(last);
    if (!Number.isFinite(lastMs)) {
      toFire.push(b);
      continue;
    }
    const nextMs = lastMs + cooldownMs;
    if (nextMs <= now.getTime()) {
      toFire.push(b);
    } else {
      suppressed.push({
        ...b,
        last_fired_at: last,
        next_eligible_at: new Date(nextMs).toISOString(),
        cooldown_remaining_seconds: Math.max(0, Math.ceil((nextMs - now.getTime()) / 1000)),
      });
    }
  }
  return { toFire, suppressed };
}

interface WebhookAttempt {
  attempt: number;
  status?: number;
  ok: boolean;
  transient: boolean;
  error?: string;
  delay_before_ms: number;
  duration_ms: number;
}

interface WebhookResult {
  posted: boolean;
  status?: number;
  error?: string;
  attempts: WebhookAttempt[];
  gave_up_transient?: boolean;
}

function isTransientStatus(status: number): boolean {
  // 408 Request Timeout, 425 Too Early, 429 Too Many Requests, and any 5xx.
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function computeBackoffMs(attempt: number, baseMs: number, maxMs: number): number {
  // Exponential backoff with full jitter: random in [0, min(max, base * 2^(attempt-1))].
  const exp = baseMs * Math.pow(2, Math.max(0, attempt - 1));
  const capped = Math.min(maxMs, exp);
  return Math.floor(Math.random() * (capped + 1));
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((r) => setTimeout(r, ms));
}

async function postWebhook(
  breaches: Breach[],
  t: Thresholds,
  logger: (
    severity: "info" | "warn" | "error",
    event: string,
    extra?: Record<string, unknown>,
  ) => void = log,
  requestId?: string,
): Promise<WebhookResult> {
  const url = Deno.env.get("ALERT_WEBHOOK_URL");
  if (!url) return { posted: false, attempts: [] };
  const timeout = numEnv("ALERT_WEBHOOK_TIMEOUT_MS", 5000);
  const maxAttempts = Math.max(1, numEnv("ALERT_WEBHOOK_MAX_ATTEMPTS", 4));
  const baseDelay = numEnv("ALERT_WEBHOOK_BASE_DELAY_MS", 500);
  const maxDelay = numEnv("ALERT_WEBHOOK_MAX_DELAY_MS", 8000);
  const lines = breaches.map(
    (b) =>
      `• *${b.fn}* — ${b.metric}: ${b.value} (threshold ${b.threshold}, requests ${b.requests_in_window})`,
  );
  const text = `:rotating_light: Verdant edge alert — ${breaches.length} breach(es) in last ${t.windowMinutes}m\n${lines.join("\n")}`;
  const body = JSON.stringify({ text, breaches, window_minutes: t.windowMinutes });

  const attempts: WebhookAttempt[] = [];
  let lastError: string | undefined;
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const delayBefore = attempt === 1 ? 0 : computeBackoffMs(attempt - 1, baseDelay, maxDelay);
    if (delayBefore > 0) {
      logger("info", "webhook_retry_scheduled", {
        request_id: requestId,
        attempt,
        delay_ms: delayBefore,
        previous_status: lastStatus,
        previous_error: lastError,
      });
      await sleep(delayBefore);
    }
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeout);
    const startedAt = Date.now();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
      const duration = Date.now() - startedAt;
      const ok = res.status >= 200 && res.status < 300;
      const transient = !ok && isTransientStatus(res.status);
      attempts.push({
        attempt,
        status: res.status,
        ok,
        transient,
        delay_before_ms: delayBefore,
        duration_ms: duration,
      });
      lastStatus = res.status;
      lastError = undefined;
      if (ok) {
        logger("info", "webhook_delivered", {
          request_id: requestId,
          attempt,
          status: res.status,
          duration_ms: duration,
        });
        return { posted: true, status: res.status, attempts };
      }
      if (!transient) {
        logger("warn", "webhook_permanent_failure", {
          request_id: requestId,
          attempt,
          status: res.status,
          duration_ms: duration,
        });
        return { posted: false, status: res.status, error: `http_${res.status}`, attempts };
      }
      logger("warn", "webhook_transient_failure", {
        request_id: requestId,
        attempt,
        status: res.status,
        duration_ms: duration,
        attempts_remaining: maxAttempts - attempt,
      });
    } catch (err) {
      const duration = Date.now() - startedAt;
      const msg = err instanceof Error ? err.message : String(err);
      // Network/timeout/abort errors are treated as transient.
      attempts.push({
        attempt,
        ok: false,
        transient: true,
        error: msg,
        delay_before_ms: delayBefore,
        duration_ms: duration,
      });
      lastError = msg;
      lastStatus = undefined;
      logger("warn", "webhook_transient_failure", {
        request_id: requestId,
        attempt,
        error: msg,
        duration_ms: duration,
        attempts_remaining: maxAttempts - attempt,
      });
    } finally {
      clearTimeout(to);
    }
  }

  logger("error", "webhook_retries_exhausted", {
    request_id: requestId,
    attempts: attempts.length,
    last_status: lastStatus,
    last_error: lastError,
  });
  return {
    posted: false,
    status: lastStatus,
    error: lastError ?? (lastStatus ? `http_${lastStatus}` : "unknown"),
    attempts,
    gave_up_transient: true,
  };
}

async function requireOperator(
  authHeader: string,
  requestId: string,
): Promise<{ ok: true } | { ok: false; res: Response }> {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) {
    return { ok: false, res: fail(503, "env_missing", "Service unavailable", requestId) };
  }
  const supa = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const token = authHeader.slice("Bearer ".length);
  const { data: claims, error } = await supa.auth.getClaims(token);
  if (error || !claims?.claims?.sub) {
    return { ok: false, res: fail(401, "invalid_jwt", "Unauthorized", requestId) };
  }
  const { data: isOp, error: rErr } = await supa.rpc("has_role", {
    _user_id: claims.claims.sub,
    _role: "operator",
  });
  if (rErr) {
    return { ok: false, res: fail(503, "role_check_failed", "Service unavailable", requestId) };
  }
  if (!isOp) {
    return { ok: false, res: fail(403, "operator_role_required", "Forbidden", requestId) };
  }
  return { ok: true };
}

const ALLOWED_METRICS = new Set<Breach["metric"]>([
  "rpc_error_count",
  "rpc_error_rate",
  "startup_import_failed",
]);

interface SimulateSpec {
  fn: string;
  metric: Breach["metric"];
  value?: number;
  requests_in_window?: number;
}

interface ParsedBody {
  dryRun: boolean;
  simulate?: SimulateSpec;
  error?: string;
}

async function parseBody(req: Request): Promise<ParsedBody> {
  if (req.method !== "POST") return { dryRun: false };
  const ctype = req.headers.get("content-type") ?? "";
  if (!ctype.includes("application/json")) return { dryRun: false };
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { dryRun: false, error: "invalid_json" };
  }
  if (!raw || typeof raw !== "object") return { dryRun: false };
  const obj = raw as Record<string, unknown>;
  const dryRun = obj.dry_run === true;
  if (!dryRun) return { dryRun: false };
  const sim = obj.simulate;
  if (!sim || typeof sim !== "object") {
    return { dryRun, error: "simulate_required" };
  }
  const s = sim as Record<string, unknown>;
  const fn = typeof s.fn === "string" ? s.fn.trim() : "";
  const metric =
    typeof s.metric === "string" ? (s.metric as Breach["metric"]) : ("" as Breach["metric"]);
  if (!fn || fn.length > 128) return { dryRun, error: "invalid_fn" };
  if (!ALLOWED_METRICS.has(metric)) return { dryRun, error: "invalid_metric" };
  const value = typeof s.value === "number" && Number.isFinite(s.value) ? s.value : undefined;
  const requests =
    typeof s.requests_in_window === "number" && Number.isFinite(s.requests_in_window)
      ? s.requests_in_window
      : undefined;
  return { dryRun, simulate: { fn, metric, value, requests_in_window: requests } };
}

function buildSimulatedBreach(spec: SimulateSpec, t: Thresholds): Breach {
  const defaults: Record<Breach["metric"], { value: number; threshold: number; requests: number }> =
    {
      rpc_error_count: {
        value: Math.max(t.rpcErrorCount, 1),
        threshold: t.rpcErrorCount,
        requests: Math.max(t.minRequests, t.rpcErrorCount),
      },
      rpc_error_rate: {
        value: Math.min(1, Math.max(t.rpcErrorRate, 0.01)),
        threshold: t.rpcErrorRate,
        requests: Math.max(t.minRequests, 10),
      },
      startup_import_failed: {
        value: Math.max(t.startupFailureCount, 1),
        threshold: t.startupFailureCount,
        requests: 1,
      },
    };
  const d = defaults[spec.metric];
  return {
    fn: spec.fn,
    metric: spec.metric,
    value: spec.value ?? d.value,
    threshold: d.threshold,
    requests_in_window: spec.requests_in_window ?? d.requests,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const requestId = resolveRequestId(req);

  if (req.method !== "GET" && req.method !== "POST") {
    return fail(405, "method_not_allowed", "Method not allowed", requestId);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    log("error", "env_missing", { request_id: requestId });
    return fail(503, "env_missing", "Service unavailable", requestId);
  }

  // Manual invocations must present an operator JWT. Scheduled pg_cron
  // calls set the shared `x-alert-cron-secret` header instead — this
  // lets pg_net trigger the check without carrying a user session.
  const cronSecret = Deno.env.get("ALERT_CRON_SECRET");
  const providedCronSecret = req.headers.get("x-alert-cron-secret");
  const isCron = Boolean(cronSecret && providedCronSecret && providedCronSecret === cronSecret);

  if (!isCron) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail(401, "missing_bearer_token", "Unauthorized", requestId);
    }
    const gate = await requireOperator(authHeader, requestId);
    if (!gate.ok) return gate.res;
  }

  const parsedBody = await parseBody(req);
  if (parsedBody.error) {
    return fail(400, parsedBody.error, "Invalid request body", requestId);
  }
  // Dry-run is strictly operator-driven; cron never carries a body.
  const isDryRun = parsedBody.dryRun && !isCron;

  const thresholds = loadThresholds();
  const supa = createClient(url, serviceKey);
  const since = new Date(Date.now() - thresholds.windowMinutes * 60_000).toISOString();

  const { data, error } = await supa
    .from("edge_function_metric_events")
    .select("fn, outcome, observed_at")
    .eq("event_type", "request_metric")
    .gte("observed_at", since)
    .limit(10000);

  if (error) {
    log("error", "query_failed", { request_id: requestId, code: error.code });
    return fail(503, "query_failed", "Service unavailable", requestId);
  }

  const rows = (data ?? []) as EventRow[];
  const realBreaches = evaluate(rows, thresholds);
  let simulatedBreach: Breach | null = null;
  if (isDryRun && parsedBody.simulate) {
    simulatedBreach = buildSimulatedBreach(parsedBody.simulate, thresholds);
    log("info", "dry_run_simulated_breach", {
      request_id: requestId,
      fn: simulatedBreach.fn,
      metric: simulatedBreach.metric,
    });
  }
  const breaches = simulatedBreach ? [...realBreaches, simulatedBreach] : realBreaches;

  let toFire: Breach[] = breaches;
  let suppressed: SuppressedBreach[] = [];
  if (breaches.length > 0 && thresholds.cooldownMinutes > 0) {
    const pairs = Array.from(new Set(breaches.map((b) => `${b.fn}|${b.metric}`)));
    const fns = Array.from(new Set(breaches.map((b) => b.fn)));
    const metrics = Array.from(new Set(breaches.map((b) => b.metric)));
    const { data: dispatchRows, error: dispatchErr } = await supa
      .from("edge_metrics_alert_dispatches")
      .select("fn, metric, last_fired_at")
      .in("fn", fns)
      .in("metric", metrics);
    if (dispatchErr) {
      // Cooldown is best-effort — never let a lookup failure block alerting.
      log("warn", "cooldown_lookup_failed", {
        request_id: requestId,
        code: dispatchErr.code,
      });
    } else {
      const filtered = (dispatchRows ?? []).filter((r) =>
        pairs.includes(`${r.fn}|${r.metric}`),
      ) as DispatchRow[];
      const parts = partitionByCooldown(breaches, filtered, new Date(), thresholds.cooldownMinutes);
      toFire = parts.toFire;
      suppressed = parts.suppressed;
    }
  }

  let webhook: Awaited<ReturnType<typeof postWebhook>> = { posted: false, attempts: [] };
  if (isDryRun) {
    log("info", "dry_run_evaluated", {
      request_id: requestId,
      fired_count: toFire.length,
      suppressed_count: suppressed.length,
    });
  } else if (toFire.length > 0) {
    webhook = await postWebhook(toFire, thresholds, log, requestId);
    log("warn", "alert_fired", {
      request_id: requestId,
      breach_count: toFire.length,
      suppressed_count: suppressed.length,
      webhook_posted: webhook.posted,
      webhook_status: webhook.status,
      webhook_attempts: webhook.attempts.length,
      webhook_gave_up_transient: webhook.gave_up_transient ?? false,
    });
    // Persist per-attempt history so operators can inspect scheduled /
    // delivered / exhausted delivery attempts per breach in the UI.
    if (webhook.attempts.length > 0) {
      const dispatchId = crypto.randomUUID();
      const lastIdx = webhook.attempts.length - 1;
      const attemptRows = toFire.flatMap((b) =>
        webhook.attempts.map((a, idx) => {
          let outcome: "delivered" | "transient_failure" | "permanent_failure" | "exhausted";
          if (a.ok) outcome = "delivered";
          else if (!a.transient) outcome = "permanent_failure";
          else if (idx === lastIdx && webhook.gave_up_transient) outcome = "exhausted";
          else outcome = "transient_failure";
          return {
            dispatch_id: dispatchId,
            fn: b.fn,
            metric: b.metric,
            attempt: a.attempt,
            outcome,
            status_code: a.status ?? null,
            ok: a.ok,
            transient: a.transient,
            error: a.error ?? null,
            delay_before_ms: a.delay_before_ms,
            duration_ms: a.duration_ms,
            value: b.value,
            threshold: b.threshold,
            requests_in_window: b.requests_in_window,
            request_id: requestId,
          };
        }),
      );
      const { error: attemptsErr } = await supa
        .from("edge_metrics_webhook_attempts")
        .insert(attemptRows);
      if (attemptsErr) {
        log("warn", "webhook_attempts_insert_failed", {
          request_id: requestId,
          code: attemptsErr.code,
        });
      }
    }
    // Only record cooldown for breaches whose webhook actually delivered.
    // If delivery failed transiently and we exhausted retries, leave the
    // dispatch row untouched so the next cron pass can retry immediately
    // instead of being silently suppressed by cooldown.
    if (webhook.posted || !webhook.gave_up_transient) {
      const nowIso = new Date().toISOString();
      const upsertRows = toFire.map((b) => ({
        fn: b.fn,
        metric: b.metric,
        last_fired_at: nowIso,
        last_value: b.value,
        last_threshold: b.threshold,
        last_requests_in_window: b.requests_in_window,
        updated_at: nowIso,
      }));
      const { error: upsertErr } = await supa
        .from("edge_metrics_alert_dispatches")
        .upsert(upsertRows, { onConflict: "fn,metric" });
      if (upsertErr) {
        log("warn", "cooldown_upsert_failed", {
          request_id: requestId,
          code: upsertErr.code,
        });
      }
    } else {
      log("warn", "cooldown_skipped_after_transient_failure", {
        request_id: requestId,
        breach_count: toFire.length,
      });
    }
  } else if (suppressed.length > 0) {
    log("info", "alert_suppressed_by_cooldown", {
      request_id: requestId,
      suppressed_count: suppressed.length,
      cooldown_minutes: thresholds.cooldownMinutes,
    });
  } else {
    log("info", "alert_check_clean", {
      request_id: requestId,
      window_minutes: thresholds.windowMinutes,
      sampled: rows.length,
    });
  }

  return json(
    200,
    {
      ok: true,
      dry_run: isDryRun,
      simulated: simulatedBreach,
      window_minutes: thresholds.windowMinutes,
      sampled_events: rows.length,
      thresholds,
      breaches,
      fired: toFire,
      suppressed,
      webhook,
      invoked_via: isCron ? "cron" : isDryRun ? "operator_dry_run" : "operator",
    },
    requestId,
  );
});

export const __internals = { evaluate, loadThresholds, partitionByCooldown, postWebhook, log };
