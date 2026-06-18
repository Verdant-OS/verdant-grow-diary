import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  TENT_PLANT_TABS_URL_PARAM,
  readTentPlantTabsUrlPlantId,
  applyTentPlantTabsUrlPlantId,
  resolveInitialTentPlantTabsSelection,
} from "@/lib/tentPlantTabsUrlState";

const PLANTS = [
  { id: "p1", isArchived: false },
  { id: "p2", isArchived: false },
  { id: "p3", isArchived: true },
];

describe("tentPlantTabsUrlState — read", () => {
  it("returns null when no plant param is present", () => {
    expect(readTentPlantTabsUrlPlantId("")).toBeNull();
    expect(readTentPlantTabsUrlPlantId("?foo=bar")).toBeNull();
    expect(readTentPlantTabsUrlPlantId(null)).toBeNull();
    expect(readTentPlantTabsUrlPlantId(undefined)).toBeNull();
  });

  it("reads the plant id from a query string", () => {
    expect(readTentPlantTabsUrlPlantId("?plant=p1")).toBe("p1");
    expect(readTentPlantTabsUrlPlantId("plant=p2&foo=bar")).toBe("p2");
  });

  it("accepts a URLSearchParams instance", () => {
    const sp = new URLSearchParams();
    sp.set("plant", "p9");
    expect(readTentPlantTabsUrlPlantId(sp)).toBe("p9");
  });

  it("ignores empty / whitespace / oversize values", () => {
    expect(readTentPlantTabsUrlPlantId("?plant=")).toBeNull();
    expect(readTentPlantTabsUrlPlantId("?plant=%20%20")).toBeNull();
    expect(
      readTentPlantTabsUrlPlantId(`?plant=${"x".repeat(500)}`),
    ).toBeNull();
  });

  it("does not crash on malformed input", () => {
    expect(() => readTentPlantTabsUrlPlantId("%%%%")).not.toThrow();
  });
});

describe("tentPlantTabsUrlState — apply", () => {
  it("sets the plant param without disturbing others", () => {
    const next = applyTentPlantTabsUrlPlantId("?foo=bar&baz=1", "p1");
    expect(next.get("plant")).toBe("p1");
    expect(next.get("foo")).toBe("bar");
    expect(next.get("baz")).toBe("1");
  });

  it("removes the plant param when given null/empty", () => {
    const next = applyTentPlantTabsUrlPlantId("?plant=p1&foo=bar", null);
    expect(next.has("plant")).toBe(false);
    expect(next.get("foo")).toBe("bar");
    const next2 = applyTentPlantTabsUrlPlantId("?plant=p1", "   ");
    expect(next2.has("plant")).toBe(false);
  });

  it("replaces an existing plant param", () => {
    const next = applyTentPlantTabsUrlPlantId("?plant=p1", "p2");
    expect(next.get("plant")).toBe("p2");
  });

  it("does not mutate the caller's URLSearchParams", () => {
    const sp = new URLSearchParams("plant=p1&foo=bar");
    const next = applyTentPlantTabsUrlPlantId(sp, "p2");
    expect(sp.get("plant")).toBe("p1");
    expect(next.get("plant")).toBe("p2");
  });

  it("exports the canonical param name", () => {
    expect(TENT_PLANT_TABS_URL_PARAM).toBe("plant");
  });
});

describe("tentPlantTabsUrlState — resolveInitialTentPlantTabsSelection", () => {
  it("URL plant id wins when visible", () => {
    const r = resolveInitialTentPlantTabsSelection({
      urlPlantId: "p1",
      storedPlantId: "p2",
      plants: PLANTS,
      includeArchived: false,
    });
    expect(r).toEqual({ selectedPlantId: "p1", source: "url" });
  });

  it("falls back to storage when URL absent and storage visible", () => {
    const r = resolveInitialTentPlantTabsSelection({
      urlPlantId: null,
      storedPlantId: "p2",
      plants: PLANTS,
      includeArchived: false,
    });
    expect(r).toEqual({ selectedPlantId: "p2", source: "storage" });
  });

  it("defaults to All plants when both URL and storage are absent", () => {
    const r = resolveInitialTentPlantTabsSelection({
      urlPlantId: null,
      storedPlantId: null,
      plants: PLANTS,
      includeArchived: false,
    });
    expect(r).toEqual({ selectedPlantId: null, source: "default" });
  });

  it("invalid URL plant id falls back to All plants (NOT storage)", () => {
    const r = resolveInitialTentPlantTabsSelection({
      urlPlantId: "ghost",
      storedPlantId: "p2",
      plants: PLANTS,
      includeArchived: false,
    });
    expect(r).toEqual({ selectedPlantId: null, source: "default" });
  });

  it("URL plant id from another tent falls back to All plants", () => {
    const r = resolveInitialTentPlantTabsSelection({
      urlPlantId: "from-other-tent",
      storedPlantId: null,
      plants: PLANTS,
      includeArchived: false,
    });
    expect(r).toEqual({ selectedPlantId: null, source: "default" });
  });

  it("archived URL plant falls back to All plants when archived hidden", () => {
    const r = resolveInitialTentPlantTabsSelection({
      urlPlantId: "p3",
      storedPlantId: null,
      plants: PLANTS,
      includeArchived: false,
    });
    expect(r).toEqual({ selectedPlantId: null, source: "default" });
  });

  it("archived URL plant opens when archived shown", () => {
    const r = resolveInitialTentPlantTabsSelection({
      urlPlantId: "p3",
      storedPlantId: null,
      plants: PLANTS,
      includeArchived: true,
    });
    expect(r).toEqual({ selectedPlantId: "p3", source: "url" });
  });

  it("archived stored plant is ignored when archived hidden", () => {
    const r = resolveInitialTentPlantTabsSelection({
      urlPlantId: null,
      storedPlantId: "p3",
      plants: PLANTS,
      includeArchived: false,
    });
    expect(r).toEqual({ selectedPlantId: null, source: "default" });
  });

  it("malformed plant inputs do not crash", () => {
    expect(() =>
      resolveInitialTentPlantTabsSelection({
        urlPlantId: "",
        storedPlantId: "   ",
        plants: PLANTS,
        includeArchived: false,
      }),
    ).not.toThrow();
  });
});

describe("tentPlantTabsUrlState static safety", () => {
  const content = readFileSync(
    resolve(__dirname, "../lib/tentPlantTabsUrlState.ts"),
    "utf8",
  );

  it("does not import Supabase clients", () => {
    expect(content).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(content).not.toMatch(/supabase\.from\(/);
  });

  it("does not import AI/alerts/action-queue/device-control surfaces", () => {
    expect(content).not.toMatch(/ai-?doctor|aiCoach|model-?call/i);
    expect(content).not.toMatch(/from\s+["'][^"']*\/alerts?/);
    expect(content).not.toMatch(/actionQueue|action_queue/);
    expect(content).not.toMatch(/deviceControl|device_control/);
  });

  it("does not import React or perform any I/O", () => {
    expect(content).not.toMatch(/from\s+["']react["']/);
    expect(content).not.toMatch(/fetch\(/);
    expect(content).not.toMatch(/window\.localStorage/);
  });
});
