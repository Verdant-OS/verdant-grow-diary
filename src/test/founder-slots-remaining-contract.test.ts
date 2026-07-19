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
  it.each([0, 42, 75])("accepts the bounded integer %s with exactly two public fields", (value) => {
    const payload = buildFounderSlotsPayload(value);

    expect(payload).toEqual({ remaining: value, total: 75 });
    expect(Object.keys(payload ?? {}).sort()).toEqual(["remaining", "total"]);
  });

  it.each([-1, 76])("rejects the out-of-range integer %s", (value) => {
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
    expect(FOUNDER_SLOTS_TOTAL).toBe(75);
  });
});

describe("founder slots remaining — Edge Function wiring", () => {
  it("validates RPC data before the success response and never defaults invalid data to zero", () => {
    const validationIndex = INDEX_CODE.indexOf("buildFounderSlotsPayload(data)");
    const successIndex = INDEX_CODE.indexOf("return json(200, payload");

    expect(INDEX_SOURCE).toMatch(/from ["']\.\/contract\.ts["']/);
    expect(validationIndex).toBeGreaterThan(-1);
    expect(successIndex).toBeGreaterThan(validationIndex);
    expect(INDEX_CODE.slice(validationIndex, successIndex)).toMatch(
      /if \(!payload\) \{\s*return json\(503, \{ error: ["']slots_unavailable["'] \}\);\s*\}/,
    );
    expect(INDEX_CODE).not.toMatch(/typeof data === ['"]number['"] \? data : 0/);
  });

  it("keeps public failures sanitized and preserves the narrow method contract", () => {
    expect(INDEX_SOURCE).toContain("slots_unavailable");
    expect(INDEX_SOURCE).toContain("method_not_allowed");
    expect(INDEX_CODE).not.toMatch(/error\.message|JSON\.stringify\(data\)|body:\s*data/);
    expect(INDEX_SOURCE).toMatch(/req\.method !== ["']GET["'] && req\.method !== ["']POST["']/);
  });
});
