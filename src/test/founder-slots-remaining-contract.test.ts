import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFounderSlotsPayload,
  FOUNDER_SLOTS_TOTAL,
} from "../../supabase/functions/founder-slots-remaining/contract.ts";

const INDEX_SOURCE = readFileSync(
  resolve(process.cwd(), "supabase/functions/founder-slots-remaining/index.ts"),
  "utf8",
);
const INDEX_CODE = INDEX_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(
  /(^|[^:])\/\/[^\n]*/g,
  "$1",
);

describe("founder slots remaining — public payload contract", () => {
  it.each([0, 42, 100])("accepts the bounded integer %s with exactly two public fields", (value) => {
    const payload = buildFounderSlotsPayload(value);

    expect(payload).toEqual({ remaining: value, total: 100 });
    expect(Object.keys(payload ?? {}).sort()).toEqual(["remaining", "total"]);
  });

  it.each([-1, 101])("rejects the out-of-range integer %s", (value) => {
    expect(buildFounderSlotsPayload(value)).toBeNull();
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects the non-finite or fractional number %s",
    (value) => {
      expect(buildFounderSlotsPayload(value)).toBeNull();
    },
  );

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a numeric string", "42"],
    ["an object", {}],
    ["an array", []],
  ])("rejects %s", (_label, value) => {
    expect(buildFounderSlotsPayload(value)).toBeNull();
  });

  it("is deterministic and keeps the fixed total in one Edge Function contract", () => {
    const first = buildFounderSlotsPayload(23);
    const second = buildFounderSlotsPayload(23);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(FOUNDER_SLOTS_TOTAL).toBe(100);
  });
});

describe("founder slots remaining — Edge Function wiring", () => {
  it("validates RPC data before the success response and never defaults invalid data to zero", () => {
    const validationIndex = INDEX_CODE.indexOf("buildFounderSlotsPayload(data)");
    // Not "return json(200, payload" — the metrics/outcome-tracking refactor
    // (see `done()`/`Outcome`) wraps the success response as
    // `return done(json(200, { ...payload, request_id: requestId }, ...), "success")`,
    // so the literal `json(200, payload` substring no longer occurs. The
    // payload spread is a stable marker of the same success path either way.
    const successIndex = INDEX_CODE.indexOf("...payload, request_id: requestId");

    // The module-scope `typeof import("./contract.ts")` type reference plus a
    // runtime `import("./contract.ts")` inside the injectable deps loader
    // (see __setDepsLoaderForTesting / import_failure_test.ts) replaced a
    // static `from "./contract.ts"` import — deliberately, so a simulated
    // import failure can be tested. Both forms contain this substring.
    expect(INDEX_SOURCE).toMatch(/import\(\s*["']\.\/contract\.ts["']\s*\)/);
    expect(validationIndex).toBeGreaterThan(-1);
    expect(successIndex).toBeGreaterThan(validationIndex);
    // The null-payload branch itself now routes through the shared `fail(code)`
    // helper (added alongside structured request/outcome logging) rather than
    // constructing `json(503, ...)` inline — checked as two parts: the branch
    // calls `fail(...)`, and `fail` itself is independently confirmed below to
    // build the sanitized 503 / slots_unavailable shape.
    expect(INDEX_CODE.slice(validationIndex, successIndex)).toMatch(
      /if \(!payload\) \{[\s\S]*?return fail\(/,
    );
    const failIndex = INDEX_CODE.indexOf("const fail = (");
    expect(failIndex).toBeGreaterThan(-1);
    expect(INDEX_CODE.slice(failIndex, failIndex + 400)).toMatch(
      /json\(\s*503,\s*\{[\s\S]*?error:\s*["']slots_unavailable["']/,
    );
    expect(INDEX_CODE).not.toMatch(/typeof data === ['"]number['"] \? data : 0/);
  });

  it("keeps public failures sanitized and preserves the narrow method contract", () => {
    expect(INDEX_SOURCE).toContain("slots_unavailable");
    expect(INDEX_SOURCE).toContain("method_not_allowed");
    // Scoped rather than a blanket ban: `error.message` legitimately appears
    // inside `rlog({...})` — a structured, server-side-only log call (see
    // `log()`: console.log/warn/error, never the HTTP Response) — for operator
    // diagnostics. What must never happen is the CLIENT-facing response
    // leaking it. Strip every `rlog({...});` call block (flat key:value
    // bodies in this file, no nested braces, so a non-greedy match safely
    // finds each call's true end) before checking for the unsafe patterns,
    // so this test verifies the RESPONSE stays sanitized without banning a
    // safe, already-verified logging call it doesn't apply to.
    const withoutLogCalls = INDEX_CODE.replace(/\brlog\(\{[\s\S]*?\}\);/g, "");
    expect(withoutLogCalls).not.toMatch(/error\.message|JSON\.stringify\(data\)|body:\s*data/);
    expect(INDEX_SOURCE).toMatch(/req\.method !== ["']GET["'] && req\.method !== ["']POST["']/);
  });
});
