// ai-doctor-review — first live AI review slice. Server-side validated,
// non-persistent. Never returns raw model text. Fails closed.
//
// Hard constraints:
//  - No DB writes. No ai_doctor_sessions / alerts / action_queue /
//    sensor_readings writes. No equipment / device control.
//  - LOVABLE_API_KEY stays server-only. Never echoed to client.
//  - Response is always { ok: true, result } or { ok: false, reason }.
//  - Logs include only safe status/reason codes — never raw model text,
//    full packets, secrets, tokens, or unvalidated AI output.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { validateAiDoctorReviewResult } from "./contract.ts";

const TIMEOUT_MS = 25_000;
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

const SYSTEM_PROMPT =
  "You are a cautious cannabis grow assistant. Reply ONLY through the " +
  "submit_ai_doctor_review tool. Use grounded, hedged language. Never " +
  "claim certainty. Never instruct the user to turn on, switch off, " +
  "toggle, or otherwise control fans, heaters, humidifiers, dehumidifiers, " +
  "pumps, lights, valves, controllers, or any other equipment. Use " +
  "advisory phrasing such as 'Avoid…' or 'Do not…' for cautions. Keep all " +
  "arrays to at most 12 items and at most one short sentence per item.";

const TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "submit_ai_doctor_review",
    description: "Return a cautious AI Doctor review for the supplied plant.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string" },
        likely_issue: { type: "string" },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        evidence: { type: "array", items: { type: "string" } },
        missing_information: { type: "array", items: { type: "string" } },
        possible_causes: { type: "array", items: { type: "string" } },
        immediate_action: { type: "string" },
        what_not_to_do: { type: "string" },
        twenty_four_hour_follow_up: { type: "string" },
        three_day_recovery_plan: { type: "string" },
        risk_level: {
          type: "string",
          enum: ["low", "watch", "elevated", "high"],
        },
      },
      required: [
        "summary",
        "likely_issue",
        "confidence",
        "evidence",
        "missing_information",
        "possible_causes",
        "immediate_action",
        "what_not_to_do",
        "twenty_four_hour_follow_up",
        "three_day_recovery_plan",
        "risk_level",
      ],
      additionalProperties: false,
    },
  },
};

function calmFailure(reason: string): Response {
  return new Response(JSON.stringify({ ok: false, reason }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeOk(result: unknown): Response {
  return new Response(JSON.stringify({ ok: true, result }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return calmFailure("http");
  }

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return calmFailure("http");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return calmFailure("http");

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      console.log("ai-doctor-review status=config_missing");
      return calmFailure("config");
    }

    let packet: unknown;
    try {
      packet = await req.json();
    } catch {
      return calmFailure("parse");
    }
    if (!packet || typeof packet !== "object") {
      return calmFailure("shape");
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let upstream: Response;
    try {
      upstream = await fetch(GATEWAY_URL, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content:
                "Grower context packet (JSON):\n" + JSON.stringify(packet),
            },
          ],
          tools: [TOOL_SCHEMA],
          tool_choice: {
            type: "function",
            function: { name: "submit_ai_doctor_review" },
          },
        }),
      });
    } catch {
      console.log("ai-doctor-review status=timeout_or_network");
      return calmFailure("timeout");
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok) {
      console.log(`ai-doctor-review status=http_${upstream.status}`);
      // Drain body to avoid resource leak.
      try {
        await upstream.text();
      } catch {
        /* ignore */
      }
      return calmFailure("http");
    }

    let payload: unknown;
    try {
      payload = await upstream.json();
    } catch {
      console.log("ai-doctor-review status=parse_error");
      return calmFailure("parse");
    }

    const toolArgsStr = readToolArguments(payload);
    if (!toolArgsStr) {
      console.log("ai-doctor-review status=empty");
      return calmFailure("empty");
    }
    let candidate: unknown;
    try {
      candidate = JSON.parse(toolArgsStr);
    } catch {
      console.log("ai-doctor-review status=parse_error");
      return calmFailure("parse");
    }

    const v = validateAiDoctorReviewResult(candidate);
    if (v.ok === false) {
      console.log(`ai-doctor-review status=invalid reason=${v.reason}`);
      return calmFailure("invalid");
    }

    console.log("ai-doctor-review status=ok");
    return safeOk(v.result);
  } catch {
    console.log("ai-doctor-review status=unexpected");
    return calmFailure("http");
  }
});

function readToolArguments(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const choices = (payload as { choices?: unknown[] }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as { message?: { tool_calls?: unknown[] } };
  const calls = first?.message?.tool_calls;
  if (!Array.isArray(calls) || calls.length === 0) return null;
  const c = calls[0] as { function?: { arguments?: unknown } };
  const args = c?.function?.arguments;
  return typeof args === "string" && args.trim().length > 0 ? args : null;
}
