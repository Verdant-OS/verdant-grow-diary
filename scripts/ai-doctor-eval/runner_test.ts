// Offline proof of the eval runner wiring (Deno). No provider call, no Supabase
// call, no secrets: the provider is a stub and every other host is blocked.
//   bunx deno test --no-lock --allow-env --allow-read scripts/ai-doctor-eval/runner_test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyRefundReason, evalHandlerEnv, runAiDoctorEval } from "./runner.ts";
import { AI_DOCTOR_EVAL_CASES } from "../../src/test/fixtures/ai-doctor-eval/cases.ts";

for (const [k, v] of Object.entries(evalHandlerEnv("stub-key-not-real"))) Deno.env.set(k, v);

function toolCall(args: unknown, usage = { prompt_tokens: 900, completion_tokens: 300 }) {
  return () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    function: { name: "submit_ai_doctor_review", arguments: JSON.stringify(args) },
                  },
                ],
              },
            },
          ],
          usage,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
}

const cautious = {
  summary: "There is not enough information for a review yet.",
  likely_issue: "Unknown without more context.",
  confidence: "low",
  evidence: [],
  // Phrased the way the grounding rules recognise a disclosure: absence bound to a subject.
  missing_information: [
    "No sensor snapshot is available.",
    "Missing recent watering.",
    "Missing recent events.",
  ],
  possible_causes: ["Not enough information to narrow causes."],
  immediate_action: "Add a log entry before changing anything.",
  what_not_to_do: "Do not make large changes based on this review.",
  twenty_four_hour_follow_up: "Add another log entry.",
  three_day_recovery_plan: "Keep logging daily.",
  risk_level: "watch",
};

// Same shape as the known-passing fixture in src/test/ai-doctor-review-grounding-rules.test.ts.
const grounded = {
  summary: "The available context supports a cautious observation-only review.",
  likely_issue: "A possible stress pattern needs follow-up evidence.",
  confidence: "medium",
  evidence: ["Temperature is 25 C in the current source-labeled snapshot."],
  missing_information: [],
  possible_causes: ["Normal variation remains possible."],
  immediate_action: "Observe the plant and add a follow-up note if its condition changes.",
  what_not_to_do: "Do not make abrupt equipment changes from this review.",
  twenty_four_hour_follow_up: "Recheck the plant and record any visible change within 24 hours.",
  three_day_recovery_plan: "Keep observations consistent and review the trend after three days.",
  risk_level: "watch",
};

const strong01 = AI_DOCTOR_EVAL_CASES.filter((c) => c.id === "strong-01");
const thin = AI_DOCTOR_EVAL_CASES.filter((c) => c.group === "thin").slice(0, 2);

Deno.test(
  "a grounded answer on a fresh-live case is shown and recorded with confidence, latency and tokens",
  async () => {
    const out = await runAiDoctorEval({
      providerFetch: toolCall(grounded),
      runs: 2,
      cases: strong01,
    });
    assertEquals(out.records.length, 2);
    for (const r of out.records) {
      assertEquals(r.outcome, "ok", JSON.stringify(r));
      assertEquals(r.confidence, "medium");
      assertEquals(r.missingInformationCount, 0);
      assertEquals(r.promptTokens, 900);
      assertEquals(r.completionTokens, 300);
      assert(typeof r.providerLatencyMs === "number");
    }
    assertEquals(out.shown.length, 2);
    // The only non-provider host the handler reaches for is the placeholder
    // Supabase URL (completion write), and the fence blocks it.
    for (const h of out.blockedHosts) assertEquals(h, "offline-eval.invalid");
  },
);

Deno.test(
  "a contract-invalid answer is classified from the refund reason, not guessed",
  async () => {
    const out = await runAiDoctorEval({
      providerFetch: toolCall({ ...cautious, confidence: "certain" }),
      runs: 1,
      cases: thin,
    });
    for (const r of out.records) {
      assertEquals(r.outcome, "contract_invalid");
      assert(r.failureDetail?.startsWith("invalid_"));
    }
    assertEquals(out.shown.length, 0);
  },
);

Deno.test("a high-confidence answer on a thin case is rejected by the grounding gate", async () => {
  const out = await runAiDoctorEval({
    providerFetch: toolCall({ ...cautious, confidence: "high", missing_information: [] }),
    runs: 1,
    cases: thin,
  });
  for (const r of out.records) {
    assertEquals(r.outcome, "grounding_invalid", JSON.stringify(r));
    assert(r.failureDetail?.startsWith("grounding_"));
  }
});

Deno.test("provider HTTP errors are recorded as incomplete, not as model failures", async () => {
  const out = await runAiDoctorEval({
    providerFetch: () => Promise.resolve(new Response("busy", { status: 503 })),
    runs: 1,
    cases: thin.slice(0, 1),
  });
  assertEquals(out.records[0].outcome, "provider_http_error");
  assertEquals(out.records[0].failureDetail, "upstream_http_503");
});

Deno.test("classifyRefundReason maps every handler refund reason", () => {
  assertEquals(classifyRefundReason("invalid_confidence_enum").outcome, "contract_invalid");
  assertEquals(classifyRefundReason("grounding_absolute_certainty").outcome, "grounding_invalid");
  assertEquals(classifyRefundReason("upstream_empty").outcome, "empty");
  assertEquals(classifyRefundReason("upstream_parse").outcome, "parse");
  assertEquals(classifyRefundReason("upstream_timeout").outcome, "timeout");
  assertEquals(classifyRefundReason("upstream_429").outcome, "provider_http_error");
  assertEquals(classifyRefundReason("something_new").outcome, "unclassified");
  assertEquals(classifyRefundReason(null).outcome, "unclassified");
});
