import { describe, expect, it } from "vitest";
import {
  FAST_ADD_ACTIONS,
  FAST_ADD_PARAM,
  buildFastAddPickerCtas,
  fastAddActionLabel,
  readFastAddParam,
  resolveFastAddIntent,
} from "@/lib/fastAddActionRules";

describe("buildFastAddPickerCtas", () => {
  it("carries every known action id into both picker paths", () => {
    for (const action of FAST_ADD_ACTIONS) {
      const ctas = buildFastAddPickerCtas(action.id);
      expect(ctas.map((c) => c.to)).toEqual([
        `/plants?${FAST_ADD_PARAM}=${action.id}`,
        `/tents?${FAST_ADD_PARAM}=${action.id}`,
      ]);
      expect(ctas.map((c) => c.id)).toEqual(["choose_plant", "choose_tent"]);
    }
  });

  it("degrades to bare picker paths for null/unknown actions", () => {
    for (const bad of [null, undefined, "nope" as never]) {
      expect(buildFastAddPickerCtas(bad).map((c) => c.to)).toEqual(["/plants", "/tents"]);
    }
  });
});

describe("readFastAddParam", () => {
  it("round-trips every known action id", () => {
    for (const action of FAST_ADD_ACTIONS) {
      expect(readFastAddParam(`?${FAST_ADD_PARAM}=${action.id}`)).toBe(action.id);
      expect(readFastAddParam(`${FAST_ADD_PARAM}=${action.id}`)).toBe(action.id);
    }
  });

  it("returns null for absent, empty, unknown, or malformed input", () => {
    expect(readFastAddParam(null)).toBeNull();
    expect(readFastAddParam(undefined)).toBeNull();
    expect(readFastAddParam("")).toBeNull();
    expect(readFastAddParam("?other=1")).toBeNull();
    expect(readFastAddParam(`?${FAST_ADD_PARAM}=`)).toBeNull();
    expect(readFastAddParam(`?${FAST_ADD_PARAM}=not_an_action`)).toBeNull();
    expect(readFastAddParam(`?${FAST_ADD_PARAM}=%%%`)).toBeNull();
  });

  it("never throws on hostile input", () => {
    for (const s of ["?a=%E0%A4%A", "?=", "???", "&&&", "%"]) {
      expect(() => readFastAddParam(s)).not.toThrow();
    }
  });
});

describe("fastAddActionLabel", () => {
  it("labels known actions and rejects unknown ones", () => {
    expect(fastAddActionLabel("environment")).toBe("Environment");
    expect(fastAddActionLabel(null)).toBeNull();
    expect(fastAddActionLabel("nope" as never)).toBeNull();
  });
});

describe("resolveFastAddIntent needs-context ctas", () => {
  it("preserves the pending action when no plant/tent is selected", () => {
    const intent = resolveFastAddIntent("environment", null);
    expect(intent.kind).toBe("needs-context");
    if (intent.kind !== "needs-context") return;
    expect(intent.ctas.map((c) => c.to)).toEqual([
      `/plants?${FAST_ADD_PARAM}=environment`,
      `/tents?${FAST_ADD_PARAM}=environment`,
    ]);
  });

  it("still preserves intent when context is present but empty", () => {
    const intent = resolveFastAddIntent("harvest", {
      plantId: null,
      tentId: null,
      growId: null,
    });
    expect(intent.kind).toBe("needs-context");
    if (intent.kind !== "needs-context") return;
    expect(readFastAddParam(intent.ctas[1].to.split("?")[1] ?? "")).toBe("harvest");
  });

  it("does not alter intents that already have context", () => {
    const intent = resolveFastAddIntent("environment", {
      plantId: null,
      tentId: "tent-1",
      growId: null,
    });
    expect(intent.kind).toBe("open-quicklog");
  });
});
