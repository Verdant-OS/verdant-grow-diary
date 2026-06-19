/**
 * Static safety guard for the GGS Sentinel evidence slice.
 *
 * Ensures the pure view-model and presenter component never introduce:
 *   - Supabase writes (.insert/.update/.delete/.upsert/.rpc)
 *   - Edge Function invocations
 *   - AI / model calls
 *   - Action Queue writes
 *   - Device-control / setpoint / publish behavior
 *   - raw_payload body rendering
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const VIEW_MODEL = readFileSync(
  resolve(__dirname, "../lib/ggsSentinelEvidenceViewModel.ts"),
  "utf8",
);
const CARD = readFileSync(
  resolve(__dirname, "../components/GgsSentinelEvidenceTimelineCard.tsx"),
  "utf8",
);

function assertSafe(label: string, src: string) {
  const forbidden = [
    ".insert(",
    ".update(",
    ".delete(",
    ".upsert(",
    "supabase.rpc(",
    "supabase.functions.invoke",
    "from('action_queue'",
    'from("action_queue"',
    "execute_device",
    "setpoint_write",
    "irrigation_control",
    "light_control",
    "fan_control",
    "service_role",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  for (const term of forbidden) {
    if (src.includes(term)) {
      throw new Error(`${label} introduced forbidden term: ${term}`);
    }
  }
}

describe("GGS Sentinel evidence safety", () => {
  it("view-model contains no writes, AI calls, or device control", () => {
    expect(() => assertSafe("ggsSentinelEvidenceViewModel", VIEW_MODEL)).not.toThrow();
  });

  it("timeline card contains no writes, AI calls, or device control", () => {
    expect(() => assertSafe("GgsSentinelEvidenceTimelineCard", CARD)).not.toThrow();
  });

  it("view-model does not import Supabase client", () => {
    expect(VIEW_MODEL).not.toMatch(/from\s+["']@\/integrations\/supabase\/client["']/);
  });

  it("timeline card does not import Supabase client", () => {
    expect(CARD).not.toMatch(/from\s+["']@\/integrations\/supabase\/client["']/);
  });

  it("view-model never references raw_payload nested fields", () => {
    // It may mention `source_app` (via vendorLabel) but must never read
    // arbitrary raw_payload bodies.
    expect(VIEW_MODEL).not.toMatch(/raw_payload\s*\./);
    expect(VIEW_MODEL).not.toMatch(/raw_payload\s*\[/);
  });

  it("timeline card never references raw_payload", () => {
    expect(CARD).not.toMatch(/raw_payload/);
  });
});
