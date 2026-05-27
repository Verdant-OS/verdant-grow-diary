/**
 * Tests for aiDoctorSessionPersistence — read-only AI Doctor snapshot writer.
 *
 * Verifies:
 *   - Insert payload never carries a user_id (RLS default auth.uid()).
 *   - Sanitized diagnosis persists; unsanitized payloads are dropped.
 *   - Suggested actions persist as a snapshot only (no action_queue writes).
 *   - Persistence is non-blocking and returns a structured result.
 *   - Manual Add-to-Action-Queue path is untouched (no action_queue table is
 *     ever referenced by this helper).
 *   - Static safety: no service_role, no automation/device-control strings.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildAiDoctorSessionInsert,
  persistAiDoctorSession,
} from "@/lib/aiDoctorSessionPersistence";
import { validateAndSanitizeDiagnosis } from "@/lib/aiDoctorDiagnosisRules";

const sanitized = validateAndSanitizeDiagnosis({
  summary: "Possible mild heat stress.",
  likelyIssue: "Heat stress",
  confidence: 0.7,
  evidence: ["Tip curl"],
  missingInformation: [],
  possibleCauses: ["Light too close"],
  immediateAction: "Raise the light by 10cm.",
  whatNotToDo: ["Do not defoliate"],
  followUp24h: { summary: "Re-check", checklist: ["Log photo"] },
  recoveryPlan3d: { summary: "Stabilize", checklist: ["Daily photo"] },
  riskLevel: "medium",
  suggestedActions: [
    {
      type: "task",
      title: "Raise light",
      detail: "Raise the light by 10cm",
      priority: "medium",
      reason: "Reduce canopy heat",
      approvalRequired: true,
    },
  ],
}).diagnosis!;

function makeClient(insertImpl: (row: unknown) => unknown) {
  const single = vi.fn(async () => insertImpl(undefined));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn((row: unknown) => {
    insertImpl(row);
    return { select };
  });
  const from = vi.fn(() => ({ insert }));
  return { from, _calls: { from, insert, select, single } };
}

describe("buildAiDoctorSessionInsert", () => {
  it("never includes user_id (RLS default auth.uid() owns ownership)", () => {
    const row = buildAiDoctorSessionInsert({
      growId: "g1",
      analysis: { summary: "s" },
      diagnosis: sanitized,
    });
    expect(Object.keys(row)).not.toContain("user_id");
  });

  it("persists the sanitized diagnosis and snapshot suggested actions", () => {
    const row = buildAiDoctorSessionInsert({
      growId: "g1",
      analysis: { summary: "s" },
      diagnosis: sanitized,
      rawConfidence: 0.9,
      displayedConfidence: 0.6,
      contextConfidenceCeiling: "medium",
      contextSufficiency: { confidenceCeiling: "medium" },
    });
    expect(row.diagnosis).toBe(sanitized);
    expect(row.suggested_actions).toHaveLength(1);
    expect(row.suggested_actions[0]).toMatchObject({
      title: "Raise light",
      approvalRequired: true,
    });
    expect(row.raw_confidence).toBe(0.9);
    expect(row.displayed_confidence).toBe(0.6);
    expect(row.context_confidence_ceiling).toBe("medium");
  });

  it("drops unsanitized diagnosis payloads (missing approvalRequired marker)", () => {
    const row = buildAiDoctorSessionInsert({
      growId: "g1",
      analysis: { summary: "s" },
      // Pretend the raw model output leaked through without sanitization.
      diagnosis: {
        summary: "raw",
        confidence: 0.9,
        suggestedActions: [{ type: "task", title: "x", detail: "y" }],
      } as never,
    });
    expect(row.diagnosis).toBeNull();
    expect(row.suggested_actions).toEqual([]);
  });

  it("trims question and treats whitespace as null", () => {
    const row = buildAiDoctorSessionInsert({
      growId: "g1",
      analysis: { summary: "s" },
      diagnosis: sanitized,
      question: "   ",
    });
    expect(row.question).toBeNull();
  });

  it("normalizes optional ids to null", () => {
    const row = buildAiDoctorSessionInsert({
      growId: null,
      analysis: { summary: "s" },
      diagnosis: sanitized,
    });
    expect(row.grow_id).toBeNull();
    expect(row.tent_id).toBeNull();
    expect(row.plant_id).toBeNull();
  });
});

describe("persistAiDoctorSession", () => {
  it("inserts into ai_doctor_sessions and returns the new id", async () => {
    let captured: unknown = null;
    const client = makeClient((row) => {
      if (row !== undefined) captured = row;
      return { data: { id: "row-1" }, error: null };
    });
    const res = await persistAiDoctorSession(client as never, {
      growId: "g1",
      analysis: { summary: "s" },
      diagnosis: sanitized,
    });
    expect(res).toEqual({ ok: true, id: "row-1" });
    expect(client._calls.from).toHaveBeenCalledWith("ai_doctor_sessions");
    expect((captured as Record<string, unknown>).user_id).toBeUndefined();
  });

  it("never writes to action_queue (snapshot-only persistence)", async () => {
    const client = makeClient(() => ({ data: { id: "row-2" }, error: null }));
    await persistAiDoctorSession(client as never, {
      growId: "g1",
      analysis: { summary: "s" },
      diagnosis: sanitized,
    });
    for (const call of client._calls.from.mock.calls) {
      expect(call[0]).not.toBe("action_queue");
      expect(call[0]).not.toBe("alerts");
    }
  });

  it("returns a structured error instead of throwing (non-blocking)", async () => {
    const client = makeClient(() => ({
      data: null,
      error: { message: "rls violated" },
    }));
    const res = await persistAiDoctorSession(client as never, {
      growId: "g1",
      analysis: { summary: "s" },
      diagnosis: sanitized,
    });
    expect(res).toEqual({ ok: false, error: "rls violated" });
  });

  it("refuses to persist when there is nothing to snapshot", async () => {
    const client = makeClient(() => ({ data: null, error: null }));
    const res = await persistAiDoctorSession(client as never, {
      growId: "g1",
      analysis: null,
      diagnosis: null,
    });
    expect(res.ok).toBe(false);
    expect(client._calls.insert).not.toHaveBeenCalled();
  });
});

describe("static safety", () => {
  const src = readFileSync(
    resolve(__dirname, "../lib/aiDoctorSessionPersistence.ts"),
    "utf8",
  );

  it("does not reference service_role", () => {
    expect(src.toLowerCase()).not.toContain("service_role");
  });

  it("does not write to action_queue or alerts", () => {
    expect(src).not.toMatch(/from\(["']action_queue["']\)/);
    expect(src).not.toMatch(/from\(["']alerts["']\)/);
  });

  it("contains no automation/device-control strings", () => {
    const banned = [
      "mqtt",
      "auto-execute",
      "actuate",
      "device.command",
      "relay.on",
      "relay.off",
    ];
    for (const tok of banned) {
      expect(src.toLowerCase()).not.toContain(tok);
    }
  });
});
