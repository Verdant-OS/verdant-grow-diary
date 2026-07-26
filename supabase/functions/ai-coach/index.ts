import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  resolveQuickLogSensorSnapshotForAi,
  type QuickLogSensorAcquisitionRow,
} from "../_shared/lib/lib/quick-log/quickLogSensorSnapshotAcquisitionRules.ts";
import { buildAiSensorSnapshotContext } from "../_shared/lib/lib/aiSensorSnapshotContextRules.ts";
import { pickLatestSensorSnapshotEvidenceByCapturedAt } from "../_shared/lib/lib/aiCoachLatestSensorSnapshot.ts";
import { resolveRequiredServerBillingEnvironment } from "../_shared/unionEntitlementLookup.ts";
import { isMissingAiCreditRpcOverload } from "../_shared/aiCreditRpcCompatibility.ts";
import {
  classifyAiDoctorCreditSpend,
  isConfirmedAiDoctorCreditRefund,
  parseAiDoctorResultAttachment,
} from "../_shared/aiDoctorCreditReplayRules.ts";

type Mode = "diagnose" | "next_steps";
interface Body {
  mode: Mode;
  growId?: string;
  photoUrl?: string;
  question?: string;
  idempotencyKey: string;
}

interface DiaryRow {
  id: string;
  note: string | null;
  stage: string | null;
  entry_at: string;
  photo_url: string | null;
  plant_id: string | null;
  tent_id: string | null;
  details: Record<string, unknown> | null;
}

const QUICK_LOG_SENSOR_PROVENANCE_LOOKBACK_MS = 4 * 60 * 60 * 1000;
const QUICK_LOG_SENSOR_PROVENANCE_ROW_LIMIT = 200;
const QUICK_LOG_SENSOR_PROVENANCE_COLUMNS =
  "id,metric,value,quality,source,captured_at,ts,created_at,raw_payload";
const PROVIDER_TIMEOUT_MS = 25_000;
const RESULT_PERSISTENCE_TIMEOUT_MS = 3_000;
const MAX_QUESTION_LENGTH = 2_000;
const MAX_PHOTO_URL_LENGTH = 8_192;

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isNestedQuickLogSnapshot(snapshot: unknown): boolean {
  const object = asObject(snapshot);
  return asObject(object?.metrics) !== null;
}

function isDeclaredLiveSnapshot(snapshot: unknown): boolean {
  const source = asObject(snapshot)?.source;
  return typeof source === "string" && source.trim().toLowerCase() === "live";
}

function capturedAtMs(snapshot: unknown): number | null {
  const object = asObject(snapshot);
  const raw = object?.captured_at;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function isBoundedText(value: unknown, maxLength = 2_000): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isBoundedTextList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 20 &&
    value.every((item) => typeof item === "string" && item.length <= 1_000)
  );
}

type ValidatedCoachResult =
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; reason: string };

/**
 * Fail-closed parser for fresh and replayed AI Coach results. The provider is
 * untrusted; only the documented analysis shape crosses the Edge boundary.
 * Structured diagnosis remains an opaque object for the canonical client
 * diagnosis sanitizer, but arrays/primitives are rejected here.
 */
function validateAiCoachResult(value: unknown): ValidatedCoachResult {
  const root = asObject(value);
  const analysis = asObject(root?.analysis);
  if (!root || !analysis) return { ok: false, reason: "shape" };

  const likelyIssue = analysis.likely_issue;
  if (
    !isBoundedText(analysis.summary, 4_000) ||
    (likelyIssue !== null && !isBoundedText(likelyIssue, 1_000)) ||
    !["low", "medium", "high"].includes(String(analysis.confidence)) ||
    !["low", "medium", "high", "unknown"].includes(String(analysis.risk_level)) ||
    !isBoundedTextList(analysis.evidence) ||
    !isBoundedTextList(analysis.possible_causes) ||
    !isBoundedTextList(analysis.recommended_actions) ||
    !isBoundedTextList(analysis.do_not_do) ||
    !isBoundedText(analysis.follow_up_24h) ||
    !isBoundedText(analysis.follow_up_3_day)
  ) {
    return { ok: false, reason: "analysis" };
  }

  const diagnosis = root.diagnosis;
  if (diagnosis !== null && diagnosis !== undefined && !asObject(diagnosis)) {
    return { ok: false, reason: "diagnosis" };
  }

  return {
    ok: true,
    result: {
      analysis: {
        summary: analysis.summary,
        likely_issue: likelyIssue,
        confidence: analysis.confidence,
        risk_level: analysis.risk_level,
        evidence: analysis.evidence,
        possible_causes: analysis.possible_causes,
        recommended_actions: analysis.recommended_actions,
        do_not_do: analysis.do_not_do,
        follow_up_24h: analysis.follow_up_24h,
        follow_up_3_day: analysis.follow_up_3_day,
      },
      diagnosis: diagnosis ?? null,
      sparse: root.sparse === true,
      empty: root.empty === true,
    },
  };
}

function readCoachMessageContent(value: unknown): string | null {
  const payload = asObject(value);
  const choices = payload?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = asObject(asObject(choices[0])?.message);
  const content = message?.content;
  return typeof content === "string" && content.trim().length > 0 ? content : null;
}

// S2: server-pinned tier/feature. Escalation is deferred.
const FEATURE = "ai_coach";
const MODEL_TIER = "standard";

const EMPTY_ANALYSIS = {
  summary: "No diary entries yet — log a note, photo, or sensor snapshot to get a real diagnosis.",
  likely_issue: null,
  confidence: "low",
  risk_level: "unknown",
  evidence: [],
  possible_causes: [],
  recommended_actions: [
    "Open Quick Log and add today's observation (note + photo if possible).",
    "Attach a sensor snapshot so the coach can see environment trends.",
  ],
  do_not_do: [],
  follow_up_24h: "Log at least one entry in the next 24 hours.",
  follow_up_3_day: "Aim for 3 entries across the next 3 days to establish a baseline.",
};

function isUuid(s: unknown): s is string {
  return (
    typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );
}

function parseAiCoachBody(value: unknown, supabaseUrl: string): Body | null {
  const raw = asObject(value);
  if (!raw || (raw.mode !== "diagnose" && raw.mode !== "next_steps")) return null;
  if (!isUuid(raw.idempotencyKey)) return null;

  let growId: string | undefined;
  if (raw.growId !== undefined && raw.growId !== null) {
    if (!isUuid(raw.growId)) return null;
    growId = raw.growId.toLowerCase();
  }

  let question: string | undefined;
  if (raw.question !== undefined && raw.question !== null) {
    if (typeof raw.question !== "string" || raw.question.length > MAX_QUESTION_LENGTH) return null;
    question = raw.question.trim() || undefined;
  }

  let photoUrl: string | undefined;
  if (raw.photoUrl !== undefined && raw.photoUrl !== null) {
    if (
      typeof raw.photoUrl !== "string" ||
      raw.photoUrl.length === 0 ||
      raw.photoUrl.length > MAX_PHOTO_URL_LENGTH
    ) {
      return null;
    }
    const allowedPhotoPrefix = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/sign/`;
    if (!raw.photoUrl.startsWith(allowedPhotoPrefix)) return null;
    photoUrl = raw.photoUrl;
  }

  return {
    mode: raw.mode,
    growId,
    photoUrl,
    question,
    idempotencyKey: raw.idempotencyKey,
  };
}

function calmFailure(reason: string, extra?: Record<string, unknown>): Response {
  return json({ ok: false, reason, ...(extra ?? {}) }, 200);
}

function safeOk(result: unknown, credit?: Record<string, unknown>): Response {
  return json({ ok: true, result, ...(credit ? { credit } : {}) }, 200);
}

async function settleResultPersistence<T>(operation: PromiseLike<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("result_persistence_timeout")),
          RESULT_PERSISTENCE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // After the spend RPC starts, an unexpected error is ambiguous: the ledger
  // may have committed. A same-key replay must resolve it instead of charging
  // a second credit.
  let creditSpendMayExist = false;
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const userId = u.user.id;

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const creditSupabaseUrl = Deno.env.get("SUPABASE_URL");
    const billingEnvironmentResolution = resolveRequiredServerBillingEnvironment();
    if (!serviceRoleKey || !creditSupabaseUrl || !billingEnvironmentResolution.ok) {
      return json({ error: "AI not configured" }, 500);
    }
    let requestBody: unknown;
    try {
      requestBody = await req.json();
    } catch {
      return calmFailure("shape");
    }
    const body = parseAiCoachBody(requestBody, creditSupabaseUrl);
    if (!body) return calmFailure("shape");

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return json({ error: "AI not configured" }, 500);

    const creditSupabase = createClient(creditSupabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const billingEnvironment = billingEnvironmentResolution.environment;

    // ---- S2: ai_credit_spend (atomic check-and-spend) -----------------------
    const growId = body.growId ?? null;
    const idempotencyKey = body.idempotencyKey;

    creditSpendMayExist = true;
    let spendResponse = await creditSupabase.rpc("ai_credit_spend", {
      p_user_id: userId,
      p_billing_environment: billingEnvironment,
      p_feature: FEATURE,
      p_grow_id: growId,
      p_model_tier: MODEL_TIER,
      p_idempotency_key: idempotencyKey,
      p_result: null,
    });
    if (isMissingAiCreditRpcOverload(spendResponse.error, "ai_credit_spend", "p_user_id")) {
      spendResponse = await supabase.rpc("ai_credit_spend", {
        p_feature: FEATURE,
        p_grow_id: growId,
        p_model_tier: MODEL_TIER,
        p_idempotency_key: idempotencyKey,
        p_result: null,
      });
    }
    const { data: spend, error: spendErr } = spendResponse;
    if (spendErr || !spend || typeof spend !== "object") {
      console.log("ai-coach status=credit_rpc_error");
      return calmFailure("credit_rpc");
    }
    const spendObj = spend as Record<string, unknown>;

    type RefundOutcome = "confirmed" | "unconfirmed";

    const refund = async (spendId: string | null, reason: string): Promise<RefundOutcome> => {
      if (!spendId) return "unconfirmed";
      const refundKey = `refund:${spendId}`;
      try {
        let refundResponse = await settleResultPersistence(
          creditSupabase.rpc("ai_credit_refund", {
            p_expected_user_id: userId,
            p_spend_id: spendId,
            p_idempotency_key: refundKey,
            p_reason: reason,
          }),
        );
        if (
          isMissingAiCreditRpcOverload(
            refundResponse.error,
            "ai_credit_refund",
            "p_expected_user_id",
          )
        ) {
          refundResponse = await settleResultPersistence(
            supabase.rpc("ai_credit_refund", {
              p_spend_id: spendId,
              p_idempotency_key: refundKey,
              p_reason: reason,
            }),
          );
        }
        if (!refundResponse.error && isConfirmedAiDoctorCreditRefund(refundResponse.data)) {
          console.log("ai-coach refund=confirmed");
          return "confirmed";
        }
      } catch {
        // A transport timeout is ambiguous; the caller must retain the same
        // request key until a replay resolves the ledger state.
      }
      console.log("ai-coach refund=unconfirmed");
      return "unconfirmed";
    };

    async function failureAfterRefund(
      spendId: string | null,
      refundReason: string,
      terminalReason: string,
    ): Promise<Response> {
      const outcome = await refund(spendId, refundReason);
      return calmFailure(outcome === "confirmed" ? terminalReason : "result_pending");
    }

    const spendDecision = classifyAiDoctorCreditSpend(spendObj, Date.now());
    if (spendDecision.kind === "refunded") {
      console.log("ai-coach status=result_recording_failed");
      return calmFailure("result_recording_failed");
    }
    if (spendDecision.kind === "denied") {
      console.log(`ai-coach status=credit_denied http=200 reason=${String(spendObj.reason ?? "")}`);
      return calmFailure("credit_denied", { credit: spendObj });
    }
    if (spendDecision.kind === "conflict") {
      console.log("ai-coach status=idempotency_conflict");
      return calmFailure("invalid");
    }
    if (spendDecision.kind === "invalid") {
      console.log("ai-coach status=credit_status_invalid");
      return calmFailure("credit_rpc");
    }

    if (
      spendObj.feature !== FEATURE ||
      spendObj.model_tier !== MODEL_TIER ||
      spendObj.grow_id !== growId
    ) {
      console.log("ai-coach status=credit_scope_mismatch");
      return calmFailure("credit_rpc");
    }

    if (spendDecision.kind === "pending") {
      console.log("ai-coach status=result_pending");
      return calmFailure("result_pending");
    }
    if (spendDecision.kind === "stale") {
      console.log("ai-coach status=stale_resultless_replay");
      return failureAfterRefund(
        spendDecision.spendId,
        "stale_resultless_replay",
        "result_recording_failed",
      );
    }
    if (spendDecision.kind === "cached") {
      const cached = validateAiCoachResult(spendDecision.result);
      if (cached.ok) {
        console.log("ai-coach status=ok_replayed");
        return safeOk(cached.result, { replayed: true });
      }
      console.log("ai-coach status=cached_result_invalid");
      return failureAfterRefund(
        spendDecision.spendId,
        "cached_result_invalid",
        "result_recording_failed",
      );
    }

    const spendId = spendDecision.spendId;

    // --- gather real context ---
    let grow: Record<string, unknown> | null = null;
    let entries: DiaryRow[] = [];
    const plantsById = new Map<string, Record<string, unknown>>();
    const tentsById = new Map<string, Record<string, unknown>>();
    let latestSnapshot: Record<string, unknown> | null = null;

    if (body.growId) {
      const { data: g } = await supabase
        .from("grows")
        .select("*")
        .eq("id", body.growId)
        .maybeSingle();
      grow = g;

      const { data: e } = await supabase
        .from("diary_entries")
        .select("id,note,stage,entry_at,photo_url,plant_id,tent_id,details")
        .eq("grow_id", body.growId)
        .order("entry_at", { ascending: false })
        .limit(12);
      entries = (e ?? []) as DiaryRow[];

      const plantIds = [...new Set(entries.map((x) => x.plant_id).filter(Boolean) as string[])];
      const tentIds = [...new Set(entries.map((x) => x.tent_id).filter(Boolean) as string[])];

      if (plantIds.length) {
        const { data: p } = await supabase
          .from("plants")
          .select("id,name,strain,stage,health,medium,pot_size")
          .in("id", plantIds);
        (p ?? []).forEach((row: Record<string, unknown>) => plantsById.set(row.id as string, row));
      }
      if (tentIds.length) {
        const { data: t } = await supabase
          .from("tents")
          .select("id,name,stage,size")
          .in("id", tentIds);
        (t ?? []).forEach((row: Record<string, unknown>) => tentsById.set(row.id as string, row));
      }

      // Select the freshest snapshot by its own captured_at (not by diary
      // entry_at order). Quick Log's legacy flat RPC discarded per-row raw
      // lineage, so nested live snapshots are corroborated against the
      // corresponding RLS-scoped sensor rows before they can raise AI trust.
      const selected = pickLatestSensorSnapshotEvidenceByCapturedAt(entries);
      if (selected) {
        let provenanceRows: QuickLogSensorAcquisitionRow[] | null = null;
        const selectedCapturedMs = capturedAtMs(selected.snapshot);
        if (
          isNestedQuickLogSnapshot(selected.snapshot) &&
          isDeclaredLiveSnapshot(selected.snapshot) &&
          selected.tentId &&
          selectedCapturedMs !== null
        ) {
          const capturedAt = new Date(selectedCapturedMs).toISOString();
          const lowerBound = new Date(
            selectedCapturedMs - QUICK_LOG_SENSOR_PROVENANCE_LOOKBACK_MS,
          ).toISOString();
          const { data: sensorRows, error: sensorRowsError } = await supabase
            .from("sensor_readings")
            .select(QUICK_LOG_SENSOR_PROVENANCE_COLUMNS)
            .eq("tent_id", selected.tentId)
            .gte("captured_at", lowerBound)
            .lte("captured_at", capturedAt)
            .order("captured_at", { ascending: false })
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(QUICK_LOG_SENSOR_PROVENANCE_ROW_LIMIT);
          if (!sensorRowsError && Array.isArray(sensorRows)) {
            provenanceRows = sensorRows as QuickLogSensorAcquisitionRow[];
          }
        }
        latestSnapshot = resolveQuickLogSensorSnapshotForAi(
          selected.snapshot,
          provenanceRows,
        ) as Record<string, unknown>;
      }
    }

    const sparse = entries.length < 2;
    const empty = !grow || entries.length === 0;

    if (empty && !body.photoUrl) {
      // No model call → refund the just-spent credit so empty preflights are free.
      const refundOutcome = await refund(spendId, "empty_no_model_call");
      if (refundOutcome !== "confirmed") return calmFailure("result_pending");
      return safeOk({ analysis: EMPTY_ANALYSIS, diagnosis: null, sparse: true, empty: true });
    }

    // --- build structured context block ---
    const ctxLines: string[] = [];
    if (grow) {
      ctxLines.push(
        `GROW: ${grow.name} | type=${grow.grow_type} | stage=${grow.stage} | started=${grow.started_at}`,
      );
    }
    const snapshotCtx = buildAiSensorSnapshotContext(latestSnapshot);
    ctxLines.push(snapshotCtx.annotationLine);
    for (const note of snapshotCtx.safetyNotes) {
      ctxLines.push(`SENSOR_SAFETY_NOTE: ${note}`);
    }
    for (const hint of snapshotCtx.missingInformationHints) {
      ctxLines.push(`MISSING_INFORMATION_HINT: ${hint}`);
    }
    ctxLines.push(`ENTRY_COUNT: ${entries.length}${sparse ? " (sparse)" : ""}`);
    ctxLines.push("");
    ctxLines.push("RECENT_ENTRIES (newest first):");
    for (const [i, row] of entries.entries()) {
      const plant = row.plant_id ? plantsById.get(row.plant_id) : null;
      const tent = row.tent_id ? tentsById.get(row.tent_id) : null;
      const plantStr = plant
        ? `plant=${plant.name}/${plant.strain ?? "?"} stage=${plant.stage} health=${plant.health}` +
          (plant.medium ? ` medium=${plant.medium}` : "") +
          (plant.pot_size ? ` pot_size=${plant.pot_size}` : "")
        : null;
      const parts = [
        `#${i + 1}`,
        new Date(row.entry_at).toISOString(),
        row.stage ? `stage=${row.stage}` : null,
        plantStr,
        tent ? `tent=${tent.name} stage=${tent.stage} size=${tent.size ?? "?"}` : null,
        row.photo_url ? "photo=yes" : null,
        row.note ? `note="${String(row.note).slice(0, 240)}"` : null,
      ].filter(Boolean);
      ctxLines.push(parts.join(" | "));
    }

    const context = ctxLines.join("\n");

    const system = `You are Verdant's AI Grow Doctor for cannabis cultivation. Use ONLY the provided context. Do not invent sensor values, plants, or history. If data is sparse or a single photo/reading is the only signal, lower confidence and say so explicitly in the summary. When in doubt, prefer safe, reversible steps over interventionist ones.

Verdant has stage-aware environmental truth (VPD/Temp/RH stage bands, stability summaries, default environment alerts). Use that as context but never claim certainty from VPD/Temp/RH alone. Autoflower bias: favor low-stress, root health, avoid heavy defoliation, avoid aggressive feeding/training. NEVER imply Verdant or any AI can send commands, automate equipment, or actuate fans/lights/pumps/heaters/humidifiers/dehumidifiers/valves. Suggested actions are DRAFTS that the grower must explicitly approve.

Return STRICT JSON ONLY (no prose, no markdown) matching this exact shape:
{
  "analysis": {
    "summary": string,
    "likely_issue": string | null,
    "confidence": "low" | "medium" | "high",
    "risk_level": "low" | "medium" | "high" | "unknown",
    "evidence": string[],
    "possible_causes": string[],
    "recommended_actions": string[],
    "do_not_do": string[],
    "follow_up_24h": string,
    "follow_up_3_day": string
  },
  "diagnosis": {
    "summary": string,
    "likelyIssue": string | null,
    "confidence": number,
    "evidence": string[],
    "missingInformation": string[],
    "possibleCauses": string[],
    "immediateAction": string | null,
    "whatNotToDo": string[],
    "followUp24h": { "summary": string, "checklist": string[] },
    "recoveryPlan3d": { "summary": string, "checklist": string[] },
    "riskLevel": "low" | "medium" | "high",
    "suggestedActions": [
      {
        "type": "task" | "alert" | "note",
        "title": string,
        "detail": string,
        "priority": "low" | "medium" | "high",
        "reason": string,
        "approvalRequired": true
      }
    ]
  }
}

Rules for analysis (backward-compatible free-text view):
- summary: 1-2 sentences in plain language. If context is sparse, say so explicitly.
- likely_issue: short label or null if unclear.
- confidence: "low" if only one photo OR one sensor reading OR <2 diary entries.
- evidence: bullet facts pulled DIRECTLY from context.
- do_not_do: warn against destructive actions (heavy defoliation, aggressive feeding, transplant shock, irreversible training) so destructive items never appear in recommended_actions.
- recommended_actions: prefer safe, reversible steps; observation/logging first when evidence is thin.
- ${body.mode === "next_steps" ? "Bias toward forward-looking next steps in recommended_actions." : "Bias toward diagnosis in summary + likely_issue."}

Rules for diagnosis (structured view, approval-first):
- confidence is a number in [0, 1]. Use <0.5 when evidence is sparse.
- evidence cites entries or snapshot metrics drawn from context.
- missingInformation MUST be populated when confidence < 0.5.
- immediateAction: a single safe, reversible step OR null. Never a device command.
- whatNotToDo: irreversible/risky moves to avoid.
- suggestedActions: AT MOST 2. Each is a DRAFT requiring grower approval. Never describe turning equipment on/off, automation, message brokers, home-automation bridges, relays, smart plugs, or controllers.
- Never guarantee recovery, yield, or full success.
`;

    const userContent: Array<Record<string, unknown>> = [];
    // parseAiCoachBody already constrained photoUrl to this project's signed
    // Storage path before any credit spend.
    if (body.photoUrl) userContent.push({ type: "image_url", image_url: { url: body.photoUrl } });
    const text = (body.question ? `QUESTION: ${body.question}\n\n` : "") + context;
    userContent.push({ type: "text", text });

    const providerController = new AbortController();
    const providerTimer = setTimeout(() => providerController.abort(), PROVIDER_TIMEOUT_MS);
    let r: Response;
    try {
      r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: providerController.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: userContent },
          ],
        }),
      });
    } catch {
      return failureAfterRefund(spendId, "upstream_network", "timeout");
    } finally {
      clearTimeout(providerTimer);
    }

    if (r.status === 429) {
      return failureAfterRefund(spendId, "upstream_429", "http");
    }
    if (r.status === 402) {
      console.log("ai-coach status=upstream_credit_exhausted http=200");
      return failureAfterRefund(spendId, "upstream_402", "upstream_credit_exhausted");
    }
    if (!r.ok) {
      return failureAfterRefund(spendId, `upstream_${r.status}`, "http");
    }

    let data: unknown;
    try {
      data = await r.json();
    } catch {
      return failureAfterRefund(spendId, "upstream_parse", "parse");
    }

    const raw = readCoachMessageContent(data);
    if (!raw) return failureAfterRefund(spendId, "upstream_empty", "empty");

    let parsed: Record<string, unknown>;
    try {
      const candidate = JSON.parse(raw);
      const object = asObject(candidate);
      if (!object) return failureAfterRefund(spendId, "upstream_parse", "parse");
      parsed = object;
    } catch {
      return failureAfterRefund(spendId, "upstream_parse", "parse");
    }

    // Backward-compatible: the legacy free-text shape lived at the top level.
    // The new prompt nests it under `analysis`. Fall back to top-level if the
    // model returned the legacy shape.
    const analysis =
      asObject(parsed.analysis) ?? (parsed.summary || parsed.recommended_actions ? parsed : null);

    // Structured diagnosis is still sanitized by the canonical client
    // validateAndSanitizeDiagnosis rules before rendering or persistence.
    // This boundary accepts only an object or null so arrays/primitives never
    // become a replayable result.
    const diagnosis = asObject(parsed.diagnosis);
    const validated = validateAiCoachResult({
      analysis,
      diagnosis,
      sparse,
      empty: false,
    });
    if (validated.ok === false) {
      return failureAfterRefund(spendId, "invalid_model_result", "invalid");
    }

    let finalization: ReturnType<typeof parseAiDoctorResultAttachment> = "ambiguous";
    try {
      const attachmentResponse = await settleResultPersistence(
        creditSupabase.rpc("ai_credit_attach_result", {
          p_expected_user_id: userId,
          p_spend_id: spendId,
          p_expected_feature: FEATURE,
          p_result: validated.result,
        }),
      );
      if (!attachmentResponse.error) {
        finalization = parseAiDoctorResultAttachment(attachmentResponse.data);
      }
    } catch {
      // Timeout/transport ambiguity preserves the spend and logical request
      // key. A same-key replay can recover an attachment that committed.
    }

    if (finalization === "ambiguous") {
      console.log("ai-coach status=result_pending");
      return calmFailure("result_pending");
    }
    if (finalization === "rejected") {
      console.log("ai-coach status=result_recording_rejected");
      return failureAfterRefund(spendId, "result_recording_rejected", "result_recording_failed");
    }

    console.log(finalization === "recorded" ? "ai-coach status=ok" : "ai-coach status=ok_replayed");
    return safeOk(validated.result, {
      remaining: spendObj.remaining,
      scope: spendObj.scope,
      scope_limit: spendObj.scope_limit,
    });
  } catch {
    console.log("ai-coach status=unexpected");
    return calmFailure(creditSpendMayExist ? "result_pending" : "http");
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
