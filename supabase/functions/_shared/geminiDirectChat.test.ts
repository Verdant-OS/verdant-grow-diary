// Gemini-direct provider helper. Mock fetch only — no network, no secrets.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  GEMINI_API_KEY_ENV,
  GEMINI_DIRECT_PROVIDER,
  GEMINI_OPENAI_CHAT_COMPLETIONS_URL,
  buildGeminiDirectChatRequest,
  lookupGeminiDirectRoute,
  postGeminiDirectChat,
  readGeminiDirectApiKey,
  resolveGeminiDirectChat,
} from "./geminiDirectChat.ts";
import { handleAiDoctorReviewRequest } from "../ai-doctor-review/index.ts";
import { handleAiCoachRequest } from "../ai-coach/index.ts";

const DOCTOR_KEY = "test-doctor-key-not-a-secret";
const COACH_KEY = "test-coach-key-not-a-secret";

function envWith(value: string | undefined): { get(name: string): string | undefined } {
  return {
    get(name: string) {
      return name === GEMINI_API_KEY_ENV ? value : undefined;
    },
  };
}

Deno.test("standard routes resolve provider, native model, and recorded gateway id", () => {
  const doctor = lookupGeminiDirectRoute("ai_doctor_review", "standard");
  assert(doctor.ok);
  assertEquals(doctor.provider, GEMINI_DIRECT_PROVIDER);
  assertEquals(doctor.url, GEMINI_OPENAI_CHAT_COMPLETIONS_URL);
  assertEquals(doctor.geminiModelId, "gemini-3-flash-preview");
  assertEquals(doctor.recordedModelId, "google/gemini-3-flash-preview");
  assertEquals(doctor.feature, "ai_doctor_review");
  assertEquals(doctor.tier, "standard");

  const coach = lookupGeminiDirectRoute("ai_coach", "standard");
  assert(coach.ok);
  assertEquals(coach.provider, GEMINI_DIRECT_PROVIDER);
  assertEquals(coach.url, GEMINI_OPENAI_CHAT_COMPLETIONS_URL);
  assertEquals(coach.geminiModelId, "gemini-2.5-flash");
  assertEquals(coach.recordedModelId, "google/gemini-2.5-flash");
  assertEquals(coach.feature, "ai_coach");
  assertEquals(coach.tier, "standard");
});

Deno.test("unknown feature and non-standard tier fail closed without a model", () => {
  assertEquals(lookupGeminiDirectRoute("ai_cultivar_qa", "standard"), {
    ok: false,
    reason: "unsupported_feature",
  });
  assertEquals(lookupGeminiDirectRoute("ai_doctor_review", "premium"), {
    ok: false,
    reason: "unsupported_tier",
  });
  assertEquals(lookupGeminiDirectRoute("ai_coach", "escalated"), {
    ok: false,
    reason: "unsupported_tier",
  });
});

Deno.test("missing or blank GEMINI_API_KEY fails closed and does not call fetch", async () => {
  for (const raw of [undefined, "", "   ", "\n\t"]) {
    assertEquals(readGeminiDirectApiKey(envWith(raw)), null);
    const resolved = resolveGeminiDirectChat({
      feature: "ai_doctor_review",
      tier: "standard",
      apiKey: readGeminiDirectApiKey(envWith(raw)),
    });
    assertEquals(resolved, { ok: false, reason: "missing_api_key" });
  }

  let calls = 0;
  const posted = await postGeminiDirectChat({
    feature: "ai_coach",
    tier: "standard",
    apiKey: null,
    body: { messages: [] },
    fetchImpl: () => {
      calls += 1;
      return Promise.resolve(new Response("nope"));
    },
  });
  assertEquals(posted, { ok: false, reason: "missing_api_key" });
  assertEquals(calls, 0);

  const unsupported = await postGeminiDirectChat({
    feature: "ai_doctor_review",
    tier: "premium",
    apiKey: DOCTOR_KEY,
    body: { messages: [] },
    fetchImpl: () => {
      calls += 1;
      return Promise.resolve(new Response("nope"));
    },
  });
  assertEquals(unsupported, { ok: false, reason: "unsupported_tier" });
  assertEquals(calls, 0);
});

Deno.test("request posts to the Gemini OpenAI endpoint with the native model", async () => {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  const posted = await postGeminiDirectChat({
    feature: "ai_doctor_review",
    tier: "standard",
    apiKey: DOCTOR_KEY,
    body: {
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "user", content: "plant" }],
      tools: [{ type: "function", function: { name: "submit_ai_doctor_review" } }],
      tool_choice: { type: "function", function: { name: "submit_ai_doctor_review" } },
    },
    fetchImpl: (url, init) => {
      seen.push({ url: String(url), init: init ?? {} });
      return Promise.resolve(new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    },
  });

  assert(posted.ok);
  assertEquals(posted.geminiModelId, "gemini-3-flash-preview");
  assertEquals(posted.recordedModelId, "google/gemini-3-flash-preview");
  assertEquals(seen.length, 1);
  assertEquals(seen[0].url, GEMINI_OPENAI_CHAT_COMPLETIONS_URL);
  const headers = seen[0].init.headers as Record<string, string>;
  assertEquals(headers.Authorization, `Bearer ${DOCTOR_KEY}`);
  assertEquals(headers["Content-Type"], "application/json");
  assertEquals(seen[0].init.method, "POST");
  const payload = JSON.parse(String(seen[0].init.body));
  assertEquals(payload.model, "gemini-3-flash-preview");
  assertEquals(payload.messages, [{ role: "user", content: "plant" }]);
  assertEquals(payload.tools[0].function.name, "submit_ai_doctor_review");
  assert(
    !JSON.stringify({
      provider: posted.provider,
      url: posted.url,
      geminiModelId: posted.geminiModelId,
      recordedModelId: posted.recordedModelId,
    }).includes(DOCTOR_KEY),
  );

  const coachInit = buildGeminiDirectChatRequest({
    apiKey: COACH_KEY,
    geminiModelId: "gemini-2.5-flash",
    body: {
      model: "gemini-3.8-flash",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: [{ type: "text", text: "note" }] }],
    },
  });
  const coachPayload = JSON.parse(String(coachInit.body));
  assertEquals(coachPayload.model, "gemini-2.5-flash");
  assertEquals(coachPayload.response_format, { type: "json_object" });
  const coachHeaders = coachInit.headers as Record<string, string>;
  assertEquals(coachHeaders.Authorization, `Bearer ${COACH_KEY}`);
  assert(!JSON.stringify(coachPayload).includes(COACH_KEY));
});

Deno.test("a failed fetch does not put the key into the error", async () => {
  const key = "super-secret-gemini-key";
  try {
    await postGeminiDirectChat({
      feature: "ai_coach",
      tier: "standard",
      apiKey: key,
      body: { messages: [] },
      fetchImpl: () => Promise.reject(new Error("network down")),
    });
    assert(false, "expected the fetch rejection to surface");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assertEquals(message, "network down");
    assert(!message.includes(key));
    assert(!message.includes(GEMINI_API_KEY_ENV));
  }
});

Deno.test("both functions call the helper and keep the key check before credit spend", () => {
  const doctor = Deno.readTextFileSync(new URL("../ai-doctor-review/index.ts", import.meta.url));
  const coach = Deno.readTextFileSync(new URL("../ai-coach/index.ts", import.meta.url));

  for (const src of [doctor, coach]) {
    assert(src.includes('from "../_shared/geminiDirectChat.ts"'));
    assert(src.includes("fetch(GATEWAY_URL, providerRequest)"));
    assert(src.includes("buildGeminiDirectChatRequest("));
    assert(src.includes("readGeminiDirectApiKey"));
    assert(src.includes("resolveGeminiDirectChat"));
    assert(!src.includes("ai.gateway.lovable.dev"));
    assert(!src.includes("LOVABLE_API_KEY"));
    assert(!src.includes('Deno.env.get("GEMINI_API_KEY")'));
  }

  assert(keyCheckPrecedesSpend(doctor, SPEND_RPC));
  assert(doctor.includes("p_model_id: MODEL"));
  assert(doctor.includes("const MODEL = doctorRoute.recordedModelId"));
  assert(doctor.includes("model: WIRE_MODEL"));
  assert(doctor.includes('return calmFailure("config")'));

  assert(keyCheckPrecedesSpend(coach, SPEND_RPC));
  assert(coach.includes('return json({ error: "AI not configured" }, 500)'));
  assert(coach.includes('response_format: { type: "json_object" }'));
  assert(!coach.includes("p_model_id"));
});

// The order check must find the key read itself. The bare name also matches the
// import at the top of each file, which is always ahead of the spend, so a check
// on the name alone stays green when the call moves below the spend.
const KEY_READ_CALL = "readGeminiDirectApiKey(Deno.env)";
// Both functions spend through this RPC. AI Doctor sets its creditSpendMayExist flag one
// line earlier, so the flag is not the spend and is not used as the marker.
const SPEND_RPC = 'creditSupabase.rpc("ai_credit_spend"';

function keyCheckPrecedesSpend(src: string, spendMarker: string): boolean {
  const call = src.indexOf(KEY_READ_CALL);
  if (call < 0 || src.indexOf(KEY_READ_CALL, call + 1) >= 0) return false;
  const spend = src.indexOf(spendMarker);
  return spend >= 0 && call < spend;
}

Deno.test("the key-before-spend check fails when the key read moves below the spend", () => {
  const sources: Array<[string, string]> = [
    [Deno.readTextFileSync(new URL("../ai-doctor-review/index.ts", import.meta.url)), SPEND_RPC],
    [Deno.readTextFileSync(new URL("../ai-coach/index.ts", import.meta.url)), SPEND_RPC],
  ];
  for (const [src, spendMarker] of sources) {
    const lines = src.split("\n");
    const callLine = lines.findIndex((line) => line.includes(KEY_READ_CALL));
    const spendLine = lines.findIndex((line) => line.includes(spendMarker));
    assert(callLine >= 0 && spendLine > callLine);

    const moved = [...lines];
    const [call] = moved.splice(callLine, 1);
    moved.splice(spendLine, 0, call);
    const movedSrc = moved.join("\n");
    assert(movedSrc.indexOf(KEY_READ_CALL) > movedSrc.indexOf(spendMarker));
    // The import still sits above the spend, so a name-only check cannot see the move.
    assert(movedSrc.indexOf("readGeminiDirectApiKey") < movedSrc.indexOf(spendMarker));
    assertEquals(keyCheckPrecedesSpend(movedSrc, spendMarker), false);

    assertEquals(keyCheckPrecedesSpend(src.replace(KEY_READ_CALL, "null"), spendMarker), false);
    assertEquals(keyCheckPrecedesSpend(`${src}\n${KEY_READ_CALL};`, spendMarker), false);
  }
});

// Behavioural check (Codex review on #2070): the source scans above can be fooled by
// an inactive token, so drive both handlers. With every other precondition met, a
// request with GEMINI_API_KEY set reaches ai_credit_spend once; the same request with
// the key unset must fail closed with zero spend calls. fetch is stubbed throughout.
const PROBE_URL = "https://project.supabase.co";
const PROBE_USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type ProbeHandler = (
  req: Request,
  deps: { createClient: (url: string, key: string, options?: Record<string, unknown>) => unknown },
) => Promise<Response>;

function probePacket() {
  return {
    schemaVersion: 1,
    plant: { strain: "Northern Lights", stage: "flower", medium: "coco", potSize: "11 L" },
    readiness: { state: "strong", evidence: ["sensor-snapshot"], missing: [] },
    recentEvents: [],
    recentSensorSnapshot: {
      capturedAt: "2026-09-25T12:05:00.000Z",
      severity: "ok",
      readings: [{ field: "humidity_pct", value: 50, unit: "%" }],
    },
    recentSensorSnapshotAnnotation: {
      line: "[source=manual, trust=medium] humidity_pct=50 %",
      source: "manual",
      stale: false,
      trust: "medium",
      includesValues: true,
      safetyNotes: [],
      missingInformationHints: [],
    },
  };
}

async function countSpendCalls(
  handler: ProbeHandler,
  path: string,
  body: Record<string, unknown>,
  withKey: boolean,
): Promise<{ spends: number; status: number; body: unknown }> {
  const env: Record<string, string> = {
    SUPABASE_URL: PROBE_URL,
    SUPABASE_ANON_KEY: "test-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    PAYMENTS_ENVIRONMENT: "live",
    AI_DOCTOR_RECEIPT_HMAC_KEY: "test-receipt-hmac-key-0123456789abcdef",
    AI_DOCTOR_RECEIPT_HMAC_KEY_ID: "test-key-1",
  };
  const touched = [...Object.keys(env), GEMINI_API_KEY_ENV];
  const previousEnv = new Map(touched.map((name) => [name, Deno.env.get(name)]));
  for (const [name, value] of Object.entries(env)) Deno.env.set(name, value);
  if (withKey) Deno.env.set(GEMINI_API_KEY_ENV, "test-gemini-key-not-a-secret");
  else Deno.env.delete(GEMINI_API_KEY_ENV);

  let spends = 0;
  const createClient = () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: PROBE_USER } } }) },
    rpc: (name: string) => {
      if (name === "ai_credit_spend") spends += 1;
      // A denied spend ends the request right after the call this probe counts.
      return Promise.resolve({ data: { ok: false, status: "denied" }, error: null });
    },
    from: () => {
      throw new Error("table read was not expected");
    },
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error("network is not available"))) as typeof fetch;
  try {
    const response = await handler(
      new Request(`${PROBE_URL}/functions/v1/${path}`, {
        method: "POST",
        headers: { Authorization: "Bearer test-jwt", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { createClient },
    );
    return { spends, status: response.status, body: await response.json() };
  } finally {
    globalThis.fetch = previousFetch;
    for (const [name, value] of previousEnv) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
}

Deno.test("AI Doctor spends no credit when GEMINI_API_KEY is missing", async () => {
  const handler = handleAiDoctorReviewRequest as unknown as ProbeHandler;
  const body = {
    packet: probePacket(),
    growId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  };
  const control = await countSpendCalls(handler, "ai-doctor-review", body, true);
  assertEquals(control.spends, 1, `control ${JSON.stringify(control.body)}`);

  const missing = await countSpendCalls(handler, "ai-doctor-review", body, false);
  assertEquals(missing.spends, 0);
  assertEquals(missing.body, { ok: false, reason: "config" });
});

Deno.test("AI Coach spends no credit when GEMINI_API_KEY is missing", async () => {
  const handler = handleAiCoachRequest as unknown as ProbeHandler;
  const body = { mode: "next_steps", idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab" };
  const control = await countSpendCalls(handler, "ai-coach", body, true);
  assertEquals(control.spends, 1, `control ${JSON.stringify(control.body)}`);

  const missing = await countSpendCalls(handler, "ai-coach", body, false);
  assertEquals(missing.spends, 0);
  assertEquals(missing.status, 500);
  assertEquals(missing.body, { error: "AI not configured" });
});
