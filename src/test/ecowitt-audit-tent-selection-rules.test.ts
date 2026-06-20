import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ECOWITT_AUDIT_TENT_QUERY_PARAM,
  ECOWITT_AUDIT_INVALID_TENT_COPY,
  ECOWITT_AUDIT_EMPTY_FOR_TENT_COPY,
  applyEcowittAuditTentIdToSearch,
  buildEcowittAuditDevSenderCommand,
  buildEcowittAuditHref,
  readEcowittAuditTentIdFromSearch,
  resolveEcowittAuditSelectedTent,
} from "@/lib/ecowittAuditTentSelectionRules";

const TENTS = [
  { id: "tent-seedling" },
  { id: "tent-flower" },
];

describe("ecowittAuditTentSelectionRules — URL read/write", () => {
  it("reads tentId from a query string", () => {
    expect(readEcowittAuditTentIdFromSearch("?tentId=tent-flower")).toBe(
      "tent-flower",
    );
  });

  it("returns null when no tentId is present", () => {
    expect(readEcowittAuditTentIdFromSearch("")).toBeNull();
    expect(readEcowittAuditTentIdFromSearch("?foo=bar")).toBeNull();
    expect(readEcowittAuditTentIdFromSearch(null)).toBeNull();
  });

  it("ignores empty/oversize values and does not crash on malformed input", () => {
    expect(readEcowittAuditTentIdFromSearch("?tentId=")).toBeNull();
    expect(readEcowittAuditTentIdFromSearch("?tentId=   ")).toBeNull();
    expect(
      readEcowittAuditTentIdFromSearch(`?tentId=${"x".repeat(500)}`),
    ).toBeNull();
    expect(() => readEcowittAuditTentIdFromSearch("%%%")).not.toThrow();
  });

  it("applies tentId while preserving other query params", () => {
    const next = applyEcowittAuditTentIdToSearch("?foo=bar&baz=1", "tent-flower");
    expect(next.get(ECOWITT_AUDIT_TENT_QUERY_PARAM)).toBe("tent-flower");
    expect(next.get("foo")).toBe("bar");
    expect(next.get("baz")).toBe("1");
  });

  it("removes tentId when set to null/empty", () => {
    const next = applyEcowittAuditTentIdToSearch(
      "?tentId=tent-flower&foo=bar",
      null,
    );
    expect(next.has(ECOWITT_AUDIT_TENT_QUERY_PARAM)).toBe(false);
    expect(next.get("foo")).toBe("bar");
  });

  it("buildEcowittAuditHref includes ?tentId=", () => {
    expect(buildEcowittAuditHref("tent-flower")).toBe(
      "/sensors/ecowitt-audit?tentId=tent-flower",
    );
    expect(buildEcowittAuditHref(null)).toBe("/sensors/ecowitt-audit");
    expect(buildEcowittAuditHref("   ")).toBe("/sensors/ecowitt-audit");
  });
});

describe("ecowittAuditTentSelectionRules — resolveEcowittAuditSelectedTent", () => {
  it("URL tentId wins when valid", () => {
    const r = resolveEcowittAuditSelectedTent({
      urlTentId: "tent-flower",
      availableTents: TENTS,
    });
    expect(r.selectedTentId).toBe("tent-flower");
    expect(r.invalidRequested).toBe(false);
    expect(r.invalidCopy).toBeNull();
  });

  it("Flower request does not silently default to Seedling", () => {
    const r = resolveEcowittAuditSelectedTent({
      urlTentId: "tent-flower",
      availableTents: TENTS,
    });
    expect(r.selectedTentId).not.toBe("tent-seedling");
    expect(r.selectedTentId).toBe("tent-flower");
  });

  it("invalid URL tentId falls back to first tent and flags invalidRequested", () => {
    const r = resolveEcowittAuditSelectedTent({
      urlTentId: "ghost",
      availableTents: TENTS,
    });
    expect(r.selectedTentId).toBe("tent-seedling");
    expect(r.invalidRequested).toBe(true);
    expect(r.invalidCopy).toBe(ECOWITT_AUDIT_INVALID_TENT_COPY);
  });

  it("missing URL tentId defaults to first tent without invalid flag", () => {
    const r = resolveEcowittAuditSelectedTent({
      urlTentId: null,
      availableTents: TENTS,
    });
    expect(r.selectedTentId).toBe("tent-seedling");
    expect(r.invalidRequested).toBe(false);
  });

  it("no tents → null selection", () => {
    const r = resolveEcowittAuditSelectedTent({
      urlTentId: null,
      availableTents: [],
    });
    expect(r.selectedTentId).toBeNull();
    expect(r.source).toBe("none");
  });

  it("explicit user selection wins over URL", () => {
    const r = resolveEcowittAuditSelectedTent({
      urlTentId: "tent-flower",
      availableTents: TENTS,
      userSelectedTentId: "tent-seedling",
    });
    expect(r.selectedTentId).toBe("tent-seedling");
  });
});

describe("ecowittAuditTentSelectionRules — dev sender command", () => {
  const BASE = "bun run dev:send-ecowitt";
  it("prefixes VERDANT_TENT_ID when a tent id is provided", () => {
    expect(buildEcowittAuditDevSenderCommand(BASE, "tent-flower")).toBe(
      "VERDANT_TENT_ID=tent-flower bun run dev:send-ecowitt",
    );
  });
  it("returns the unscoped command when no tent id is provided", () => {
    expect(buildEcowittAuditDevSenderCommand(BASE, null)).toBe(BASE);
    expect(buildEcowittAuditDevSenderCommand(BASE, "   ")).toBe(BASE);
  });
  it("never emits an empty command", () => {
    expect(buildEcowittAuditDevSenderCommand("", "tent-flower")).toBe("");
  });
});

describe("ecowittAuditTentSelectionRules — copy constants", () => {
  it("invalid tent copy matches the documented operator message", () => {
    expect(ECOWITT_AUDIT_INVALID_TENT_COPY).toBe(
      "The requested tent could not be selected. Choose a tent to view EcoWitt ingest evidence.",
    );
  });
  it("empty state copy is scoped to the selected tent", () => {
    expect(ECOWITT_AUDIT_EMPTY_FOR_TENT_COPY).toBe(
      "No EcoWitt ingest records found for the selected tent.",
    );
  });
});

describe("ecowittAuditTentSelectionRules — static safety", () => {
  const content = readFileSync(
    resolve(__dirname, "../lib/ecowittAuditTentSelectionRules.ts"),
    "utf8",
  );
  it("does not import Supabase, React, or device-control surfaces", () => {
    expect(content).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(content).not.toMatch(/from\s+["']react["']/);
    expect(content).not.toMatch(/deviceControl|device_control/);
  });
  it("does not import AI/Action Queue surfaces", () => {
    expect(content).not.toMatch(/ai-?doctor|aiCoach|model-?call/i);
    expect(content).not.toMatch(/actionQueue|action_queue/);
  });
  it("contains no fake live data hints", () => {
    expect(content).not.toMatch(/fake|mock-live|demo-live/i);
  });
});
