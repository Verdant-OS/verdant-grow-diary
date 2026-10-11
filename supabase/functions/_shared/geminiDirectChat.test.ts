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

  const doctorKey = doctor.indexOf("readGeminiDirectApiKey");
  const doctorSpend = doctor.indexOf("creditSpendMayExist = true");
  assert(doctorKey >= 0 && doctorSpend > doctorKey);
  assert(doctor.includes("p_model_id: MODEL"));
  assert(doctor.includes("const MODEL = doctorRoute.recordedModelId"));
  assert(doctor.includes("model: WIRE_MODEL"));
  assert(doctor.includes('return calmFailure("config")'));

  const coachKey = coach.indexOf("readGeminiDirectApiKey");
  const coachSpend = coach.indexOf('creditSupabase.rpc("ai_credit_spend"');
  assert(coachKey >= 0 && coachSpend > coachKey);
  assert(coach.includes('return json({ error: "AI not configured" }, 500)'));
  assert(coach.includes('response_format: { type: "json_object" }'));
  assert(!coach.includes("p_model_id"));
});
