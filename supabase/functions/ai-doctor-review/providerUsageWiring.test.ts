// providerUsageWiring.test.ts — measurement-only safety tests for the
// AI Doctor provider response boundary wiring inside ai-doctor-review/index.ts.
//
// These tests exercise the SAME composer the Edge Function imports
// (`src/lib/cost/index.ts → attachProviderResponseUsageToAiDoctorPromptMeasurement`)
// to prove the runtime wiring is safe:
//   - attaches providerReportedTokens for the supported response shapes
//   - clears to null for malformed / missing / nested-but-unexpected shapes
//   - never mutates the original measurement
//   - never retains references to the raw provider response or any sub-object
//   - never recursively searches into nested fields (no throwing-getter trip)
//   - the runtime wiring does NOT introduce persistence, capture, budget,
//     back-pressure, alerts, action_queue writes, or service-role usage.
//
// Runtime safety: this is a LOCAL/UNIT test file only.
//   * No provider API call is made.
//   * No Supabase call is made.
//   * No network access is required.
//   * No secrets/environment variables are required.
// Safe to run in CI on every PR (including untrusted forks).
import {
  assert,
  assertEquals,
  assertNotStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  attachProviderResponseUsageToAiDoctorPromptMeasurement,
  buildAiDoctorPromptMeasurement,
} from "../../../src/lib/cost/index.ts";

function freshMeasurement() {
  return buildAiDoctorPromptMeasurement({
    promptName: "ai_doctor_review",
    recordedAt: "2026-06-16T00:00:00.000Z",
    userPromptText: "hello world",
  }).measurement;
}

Deno.test("attaches providerReportedTokens for top-level usage", () => {
  const m = freshMeasurement();
  const out = attachProviderResponseUsageToAiDoctorPromptMeasurement(m, {
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  });
  assertEquals(out.providerReportedTokens, {
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
  });
});

Deno.test("attaches providerReportedTokens for response.usage", () => {
  const out = attachProviderResponseUsageToAiDoctorPromptMeasurement(
    freshMeasurement(),
    { response: { usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } } },
  );
  assertEquals(out.providerReportedTokens, {
    promptTokens: 1,
    completionTokens: 2,
    totalTokens: 3,
  });
});

Deno.test("attaches providerReportedTokens for data.usage", () => {
  const out = attachProviderResponseUsageToAiDoctorPromptMeasurement(
    freshMeasurement(),
    { data: { usage: { prompt_tokens: 7, completion_tokens: 8, total_tokens: 15 } } },
  );
  assertEquals(out.providerReportedTokens, {
    promptTokens: 7,
    completionTokens: 8,
    totalTokens: 15,
  });
});

Deno.test("malformed usage → providerReportedTokens null", () => {
  const out = attachProviderResponseUsageToAiDoctorPromptMeasurement(
    freshMeasurement(),
    { usage: { prompt_tokens: "ten", completion_tokens: null } },
  );
  assertEquals(out.providerReportedTokens, null);
});

Deno.test("missing usage → providerReportedTokens null", () => {
  const out = attachProviderResponseUsageToAiDoctorPromptMeasurement(
    freshMeasurement(),
    { id: "x", model: "y", choices: [] },
  );
  assertEquals(out.providerReportedTokens, null);
});

Deno.test("preserves existing measurement fields and content", () => {
  const m = freshMeasurement();
  const out = attachProviderResponseUsageToAiDoctorPromptMeasurement(m, {
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });
  assertEquals(out.promptName, m.promptName);
  assertEquals(out.summaryByteSize, m.summaryByteSize);
  assertEquals(out.rawHistoryFallback, m.rawHistoryFallback);
  assertEquals(out.status, m.status);
  assertEquals(out.recordedAt, m.recordedAt);
  assertEquals(out.domain, m.domain);
});

Deno.test("returns a new object and does not mutate frozen original", () => {
  const m = Object.freeze(freshMeasurement());
  const out = attachProviderResponseUsageToAiDoctorPromptMeasurement(m, {
    usage: { prompt_tokens: 4, completion_tokens: 4, total_tokens: 8 },
  });
  assertNotStrictEquals(out, m);
  assertEquals(m.providerReportedTokens, null);
});

Deno.test("does not retain raw provider response references", () => {
  const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };
  const nestedMsg = { role: "assistant", content: "secret" };
  const choices = [{ message: nestedMsg }];
  const headers = { authorization: "Bearer secret" };
  const metadata = { trace: "abc" };
  const response = { usage };
  const data = { usage };
  const root = { id: "x", model: "y", usage, response, data, choices, headers, metadata };
  const out = attachProviderResponseUsageToAiDoctorPromptMeasurement(
    freshMeasurement(),
    root,
  );
  const reported = out.providerReportedTokens!;
  assertNotStrictEquals(reported as unknown, root);
  assertNotStrictEquals(reported as unknown, usage);
  assertNotStrictEquals(reported as unknown, response);
  assertNotStrictEquals(reported as unknown, response.usage);
  assertNotStrictEquals(reported as unknown, data);
  assertNotStrictEquals(reported as unknown, data.usage);
  assertNotStrictEquals(reported as unknown, choices);
  assertNotStrictEquals(reported as unknown, headers);
  assertNotStrictEquals(reported as unknown, metadata);
  assertNotStrictEquals(reported as unknown, nestedMsg);
  // Only the normalized numeric fields are present.
  assertEquals(Object.keys(reported).sort(), [
    "completionTokens",
    "promptTokens",
    "totalTokens",
  ]);
});

Deno.test("does not recursively walk into unexpected nested fields (throwing getters)", () => {
  const trap = (): never => {
    throw new Error("composer must not read this field");
  };
  const evil: Record<string, unknown> = {};
  Object.defineProperty(evil, "usage", { get: trap, enumerable: true });
  const result: Record<string, unknown> = { result: evil };
  const choicesWithTrap: Array<Record<string, unknown>> = [{}];
  Object.defineProperty(choicesWithTrap[0], "usage", { get: trap, enumerable: true });
  const metadata: Record<string, unknown> = {};
  Object.defineProperty(metadata, "usage", { get: trap, enumerable: true });
  const payloadDebug: Record<string, unknown> = {};
  Object.defineProperty(payloadDebug, "usage", { get: trap, enumerable: true });
  const root = {
    ...result,
    choices: choicesWithTrap,
    metadata,
    payload: { debug: payloadDebug },
  };
  const out = attachProviderResponseUsageToAiDoctorPromptMeasurement(
    freshMeasurement(),
    root,
  );
  assertEquals(out.providerReportedTokens, null);
});

Deno.test("structural safety: edge function wiring contains no forbidden writes", async () => {
  const raw = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  // Strip line + block comments so safety assertions only see executable code.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  // No new persistence / writes introduced by the wiring slice.
  assert(!/action_queue/i.test(src), "must not write action_queue");
  assert(!/\.from\(\s*['"]alerts['"]/i.test(src), "must not write alerts");
  assert(!/ai_doctor_sessions/i.test(src), "must not write ai_doctor_sessions");
  assert(!/SERVICE_ROLE/i.test(src), "must not use service role key");
  // No raw upstream payload logging.
  assert(
    !/console\.log\([^)]*payload/i.test(src),
    "must not log raw provider payload",
  );
  // No capture-store / CSV export wiring in the edge function.
  assert(!/captureStore|csvExport/i.test(src), "no capture/export wiring");
  // No threshold/budget enforcement constants added at this boundary.
  assert(
    !/TOKEN_BUDGET|COST_THRESHOLD|BACK_PRESSURE/.test(src),
    "no budgets/thresholds/back-pressure",
  );
  // Composer is invoked exactly at the provider response boundary.
  assert(
    /attachProviderResponseUsageToAiDoctorPromptMeasurement/.test(src),
    "composer must be wired",
  );
  assert(
    /measurementWithProviderUsage/.test(src),
    "must use the named local variable",
  );
});

// --- Uncommon provider-response shape coverage --------------------------
// All of these MUST clear providerReportedTokens to null without throwing
// and without retaining any raw reference.

function expectsNull(name: string, providerResponse: unknown) {
  Deno.test(`uncommon shape clears to null: ${name}`, () => {
    const m = freshMeasurement();
    const out = attachProviderResponseUsageToAiDoctorPromptMeasurement(
      m,
      providerResponse,
    );
    assertEquals(out.providerReportedTokens, null);
    // Original measurement fields preserved.
    assertEquals(out.promptName, m.promptName);
    assertEquals(out.summaryByteSize, m.summaryByteSize);
    assertEquals(out.status, m.status);
  });
}

expectsNull("usage missing required keys", { usage: {} });
expectsNull("usage with only total_tokens", { usage: { total_tokens: 10 } });
expectsNull("usage with only prompt_tokens", { usage: { prompt_tokens: 5 } });
expectsNull("usage with only completion_tokens", { usage: { completion_tokens: 5 } });
expectsNull("usage with prompt_tokens null", {
  usage: { prompt_tokens: null, completion_tokens: 5, total_tokens: 5 },
});
expectsNull("usage with completion_tokens null", {
  usage: { prompt_tokens: 5, completion_tokens: null, total_tokens: 5 },
});
expectsNull("usage with numeric-looking strings", {
  usage: { prompt_tokens: "5", completion_tokens: "5", total_tokens: "10" },
});
expectsNull("usage with fractional values", {
  usage: { prompt_tokens: 1.5, completion_tokens: 2.5, total_tokens: 4 },
});
expectsNull("usage with negative values", {
  usage: { prompt_tokens: -1, completion_tokens: 5, total_tokens: 4 },
});
expectsNull("usage with NaN", {
  usage: { prompt_tokens: NaN, completion_tokens: 5, total_tokens: 5 },
});
expectsNull("usage with Infinity", {
  usage: { prompt_tokens: Infinity, completion_tokens: 5, total_tokens: 5 },
});
expectsNull("usage nested under result.usage", {
  result: { usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
});
expectsNull("usage nested under choices[0].usage", {
  choices: [{ usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }],
});
expectsNull("usage nested under metadata.usage", {
  metadata: { usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
});
expectsNull("usage nested under payload.debug.usage", {
  payload: {
    debug: { usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
  },
});
expectsNull("deeply nested usage object", {
  a: { b: { c: { d: { usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } } } } },
});

// --- Recursive reference-retention safety -------------------------------
// Walk the returned measurement and assert NONE of the provided raw
// provider-response sub-objects are referenced anywhere in it.

function collectObjectRefs(root: unknown): Set<unknown> {
  const seen = new Set<unknown>();
  const stack: unknown[] = [root];
  while (stack.length) {
    const v = stack.pop();
    if (v === null || typeof v !== "object") continue;
    if (seen.has(v)) continue;
    seen.add(v);
    if (Array.isArray(v)) {
      for (const item of v) stack.push(item);
    } else {
      for (const key of Object.keys(v as Record<string, unknown>)) {
        stack.push((v as Record<string, unknown>)[key]);
      }
    }
  }
  return seen;
}

Deno.test("returned measurement retains no raw provider-response refs (recursive walk)", () => {
  const usage = { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 };
  const nestedMsg = { role: "assistant", content: "do-not-leak" };
  const choices = [{ message: nestedMsg }];
  const headers = { authorization: "Bearer secret" };
  const metadata = { trace: "abc" };
  const response = { usage };
  const data = { usage };
  const root = {
    id: "resp_x",
    model: "y",
    usage,
    response,
    data,
    choices,
    headers,
    metadata,
  };
  const out = attachProviderResponseUsageToAiDoctorPromptMeasurement(
    freshMeasurement(),
    root,
  );
  const refs = collectObjectRefs(out);
  const forbidden: Array<[string, unknown]> = [
    ["root", root],
    ["usage", usage],
    ["response", response],
    ["response.usage", response.usage],
    ["data", data],
    ["data.usage", data.usage],
    ["choices", choices],
    ["choices[0]", choices[0]],
    ["headers", headers],
    ["metadata", metadata],
    ["nestedMsg", nestedMsg],
  ];
  for (const [label, ref] of forbidden) {
    assert(!refs.has(ref), `returned measurement must not retain ${label}`);
  }
  // The normalized token triple is still attached.
  assertEquals(out.providerReportedTokens, {
    promptTokens: 3,
    completionTokens: 4,
    totalTokens: 7,
  });
});

Deno.test("frozen measurement immutability regression", () => {
  const m = Object.freeze(freshMeasurement());
  let out!: ReturnType<typeof attachProviderResponseUsageToAiDoctorPromptMeasurement>;
  // Must not throw despite the original being frozen.
  out = attachProviderResponseUsageToAiDoctorPromptMeasurement(m, {
    usage: { prompt_tokens: 11, completion_tokens: 12, total_tokens: 23 },
  });
  assertNotStrictEquals(out, m);
  // Original is unchanged.
  assertEquals(m.providerReportedTokens, null);
  // Existing fields preserved.
  assertEquals(out.promptName, m.promptName);
  assertEquals(out.recordedAt, m.recordedAt);
  assertEquals(out.summaryByteSize, m.summaryByteSize);
  assertEquals(out.rawHistoryFallback, m.rawHistoryFallback);
  // Provider tokens attached correctly.
  assertEquals(out.providerReportedTokens, {
    promptTokens: 11,
    completionTokens: 12,
    totalTokens: 23,
  });
});
