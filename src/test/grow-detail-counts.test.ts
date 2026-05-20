/**
 * GrowDetail counts — related summary counts scoped to the grow.
 *
 * Asserts:
 *  - Counts queries by grow_id for plants, tents, diary_entries, action_queue,
 *    action_queue_events.
 *  - Pending action_queue filters by status pending_approval.
 *  - Counts render on hub cards (formatCount + countLabel helpers exist).
 *  - Failure path returns "unavailable" instead of throwing.
 *  - Page remains read-only and no device-control surface introduced.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PAGE = readFileSync(resolve(ROOT, "src/pages/GrowDetail.tsx"), "utf8");

describe("GrowDetail — related counts", () => {
  it("issues a count query against plants by grow_id", () => {
    expect(PAGE).toMatch(/countFrom\(\s*["']plants["']\s*\)/);
  });
  it("issues a count query against tents by grow_id", () => {
    expect(PAGE).toMatch(/countFrom\(\s*["']tents["']\s*\)/);
  });
  it("issues a count query against diary_entries by grow_id", () => {
    expect(PAGE).toMatch(/countFrom\(\s*["']diary_entries["']\s*\)/);
  });
  it("issues a count query against action_queue (total) by grow_id", () => {
    expect(PAGE).toMatch(/countFrom\(\s*["']action_queue["']\s*\)/);
  });
  it("issues a count query against action_queue_events by grow_id", () => {
    expect(PAGE).toMatch(/countFrom\(\s*["']action_queue_events["']\s*\)/);
  });

  it("pending-actions count filters by status pending_approval", () => {
    expect(PAGE).toMatch(/countFrom\([\s\S]{0,80}["']action_queue["'][\s\S]{0,200}["']status["'][\s\S]{0,40}["']pending_approval["']/);
  });

  it("base count query is keyed on grow_id with head:true exact count", () => {
    expect(PAGE).toMatch(/\.select\(\s*["']id["']\s*,\s*\{\s*count:\s*["']exact["']\s*,\s*head:\s*true\s*\}\s*\)\s*\.eq\(\s*["']grow_id["']\s*,\s*growId/);
  });

  it("count failures degrade to 'unavailable' instead of crashing", () => {
    expect(PAGE).toMatch(/return\s+["']unavailable["']/);
    expect(PAGE).toMatch(/try\s*\{[\s\S]*?\}\s*catch\s*\{[\s\S]*?return\s+["']unavailable["']/);
    expect(PAGE).toMatch(/c === "unavailable" \? "Unavailable" : String\(c\)/);
  });

  it("hub cards render the formatted counts with labels", () => {
    expect(PAGE).toMatch(/countLabel="plants"/);
    expect(PAGE).toMatch(/countLabel="tents"/);
    expect(PAGE).toMatch(/countLabel="diary entries"/);
    expect(PAGE).toMatch(/countLabel="actions"/);
    expect(PAGE).toMatch(/formatCount\(counts\.actionsPending\)/);
    expect(PAGE).toMatch(/formatCount\(counts\.auditEvents\)/);
  });

  it("remains read-only — no writes from this page", () => {
    expect(PAGE).not.toMatch(/\.insert\(/);
    expect(PAGE).not.toMatch(/\.update\(/);
    expect(PAGE).not.toMatch(/\.delete\(/);
    expect(PAGE).not.toMatch(/\.upsert\(/);
    expect(PAGE).not.toMatch(/\.rpc\(/);
  });

  it("introduces no device-control surface or service_role", () => {
    expect(PAGE).not.toMatch(/mqtt|home.?assistant|pi_bridge|webhook|relay|actuator/i);
    expect(PAGE).not.toMatch(/service_role/i);
  });
});
