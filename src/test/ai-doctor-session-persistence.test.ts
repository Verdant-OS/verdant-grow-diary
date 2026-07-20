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

const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_SESSION_ID = "33333333-3333-4333-8333-333333333333";

function makeClient(insertImpl: (row: unknown) => unknown) {
  let insertedRow: unknown;
  const single = vi.fn(async () => insertImpl(insertedRow));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn((row: unknown) => {
    insertedRow = row;
    return { select };
  });
  const from = vi.fn((_table: string) => ({ insert }));
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

  it("includes a supplied stable session id without generating one in the pure builder", () => {
    const row = buildAiDoctorSessionInsert({
      sessionId: SESSION_ID,
      growId: "g1",
      analysis: { summary: "s" },
      diagnosis: sanitized,
    });
    expect(row.id).toBe(SESSION_ID);
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
      return { data: { id: SESSION_ID }, error: null };
    });
    const res = await persistAiDoctorSession(client as never, {
      sessionId: SESSION_ID,
      growId: "g1",
      analysis: { summary: "s" },
      diagnosis: sanitized,
    });
    expect(res).toEqual({ ok: true, id: SESSION_ID });
    expect(client._calls.from).toHaveBeenCalledWith("ai_doctor_sessions");
    expect((captured as Record<string, unknown>).user_id).toBeUndefined();
  });

  it("canonicalizes an uppercase client UUID before insert and comparison", async () => {
    let captured: unknown = null;
    const client = makeClient((row) => {
      captured = row;
      return { data: { id: SESSION_ID }, error: null };
    });

    const res = await persistAiDoctorSession(client as never, {
      sessionId: SESSION_ID.toUpperCase(),
      growId: "g1",
      analysis: { summary: "s" },
      diagnosis: sanitized,
    });

    expect(res).toEqual({ ok: true, id: SESSION_ID });
    expect((captured as Record<string, unknown>).id).toBe(SESSION_ID);
  });

  it("never writes to action_queue (snapshot-only persistence)", async () => {
    const client = makeClient(() => ({ data: { id: SESSION_ID }, error: null }));
    await persistAiDoctorSession(client as never, {
      sessionId: SESSION_ID,
      growId: "g1",
      analysis: { summary: "s" },
      diagnosis: sanitized,
    });
    for (const call of client._calls.from.mock.calls) {
      const [tableName] = call as [string];
      expect(tableName).not.toBe("action_queue");
      expect(tableName).not.toBe("alerts");
    }
  });

  it("returns a structured error instead of throwing (non-blocking)", async () => {
    const client = makeClient(() => ({
      data: null,
      error: {
        code: "42501",
        message: "rls violated",
        details: "row 11111111-1111-4111-8111-111111111111",
        hint: "authenticate grower@example.com",
      },
    }));
    const res = await persistAiDoctorSession(client as never, {
      growId: "g1",
      analysis: { summary: "s" },
      diagnosis: sanitized,
    });
    expect(res).toMatchObject({
      ok: false,
      error: "AI Doctor history save was blocked by its ownership policy.",
      diagnostic: {
        stage: "insert",
        category: "rls",
        code: "42501",
        authResolution: "unavailable",
        scope: {
          hasGrowScope: true,
          hasTentScope: false,
          hasPlantScope: false,
        },
      },
    });
    if (res.ok === false) {
      expect(res.diagnostic.safeDetails).toBeNull();
      expect(res.diagnostic.safeHint).toBeNull();
      expect(JSON.stringify(res.diagnostic)).not.toContain("11111111-1111-4111-8111-111111111111");
      expect(JSON.stringify(res.diagnostic)).not.toContain("grower@example.com");
    }
  });

  it("refuses to persist when there is nothing to snapshot", async () => {
    const client = makeClient(() => ({ data: null, error: null }));
    const res = await persistAiDoctorSession(client as never, {
      growId: "g1",
      analysis: null,
      diagnosis: null,
    });
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.diagnostic.category).toBe("validation");
      expect(res.diagnostic.stage).toBe("validation");
    }
    expect(client._calls.insert).not.toHaveBeenCalled();
  });

  it("captures authenticated ownership lookup context without exposing the user id", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
    });
    const client = {
      ...makeClient(() => ({
        data: null,
        error: { code: "23503", message: "owned scope missing" },
      })),
      auth: { getUser },
    };

    const res = await persistAiDoctorSession(client as never, {
      growId: "g1",
      tentId: "t1",
      plantId: "p1",
      analysis: { summary: "s" },
      diagnosis: sanitized,
    });

    expect(getUser).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({
      ok: false,
      diagnostic: {
        category: "constraint",
        authResolution: "resolved",
        scope: {
          hasGrowScope: true,
          hasTentScope: true,
          hasPlantScope: true,
        },
      },
    });
    expect(JSON.stringify(res)).not.toContain("11111111-1111-4111-8111-111111111111");
  });

  it("treats a retry conflict as success only after owner-scoped id confirmation", async () => {
    const insertSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    const insert = vi.fn(() => ({ select: () => ({ single: insertSingle }) }));
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: SESSION_ID },
      error: null,
    });
    const from = vi
      .fn()
      .mockReturnValueOnce({ insert })
      .mockReturnValueOnce({
        select: () => ({ eq: () => ({ maybeSingle }) }),
      });

    const res = await persistAiDoctorSession({ from } as never, {
      sessionId: SESSION_ID,
      growId: "g1",
      analysis: { summary: "s" },
      diagnosis: sanitized,
    });

    expect(res).toEqual({ ok: true, id: SESSION_ID });
    expect(from).toHaveBeenCalledTimes(2);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("does not claim a duplicate conflict succeeded when owner-scoped confirmation fails", async () => {
    const insert = vi.fn(() => ({
      select: () => ({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "23505", message: "duplicate key" },
        }),
      }),
    }));
    const from = vi
      .fn()
      .mockReturnValueOnce({ insert })
      .mockReturnValueOnce({
        select: () => ({
          eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }),
        }),
      });

    const res = await persistAiDoctorSession({ from } as never, {
      sessionId: SESSION_ID,
      growId: "g1",
      analysis: { summary: "s" },
      diagnosis: sanitized,
    });

    expect(res).toMatchObject({
      ok: false,
      diagnostic: { category: "constraint", code: "23505" },
    });
  });

  it.each([
    ["missing", null],
    ["mismatched", OTHER_SESSION_ID],
  ] as const)("fails closed when the returned session id is %s", async (_label, returnedId) => {
    const client = makeClient(() => ({
      data: returnedId === null ? {} : { id: returnedId },
      error: null,
    }));
    const res = await persistAiDoctorSession(client as never, {
      sessionId: SESSION_ID,
      growId: "g1",
      analysis: { summary: "s" },
      diagnosis: sanitized,
    });

    expect(res).toMatchObject({
      ok: false,
      error: "AI Doctor history save failed at the database insert.",
      diagnostic: { stage: "insert", category: "insert" },
    });
  });

  it("records a returned auth lookup error as lookup_failed", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { message: "auth unavailable" },
    });
    const client = {
      ...makeClient(() => ({
        data: null,
        error: { code: "42501", message: "permission denied for table" },
      })),
      auth: { getUser },
    };

    const res = await persistAiDoctorSession(client as never, {
      sessionId: SESSION_ID,
      growId: "g1",
      analysis: { summary: "s" },
      diagnosis: sanitized,
    });

    expect(res).toMatchObject({
      ok: false,
      diagnostic: { category: "permission", authResolution: "lookup_failed" },
    });
  });
});

describe("static safety", () => {
  const src = readFileSync(resolve(__dirname, "../lib/aiDoctorSessionPersistence.ts"), "utf8");

  it("does not reference service_role", () => {
    expect(src.toLowerCase()).not.toContain("service_role");
  });

  it("does not write to action_queue or alerts", () => {
    expect(src).not.toMatch(/from\(["']action_queue["']\)/);
    expect(src).not.toMatch(/from\(["']alerts["']\)/);
  });

  it("contains no automation/device-control strings", () => {
    const banned = ["mqtt", "auto-execute", "actuate", "device.command", "relay.on", "relay.off"];
    for (const tok of banned) {
      expect(src.toLowerCase()).not.toContain(tok);
    }
  });
});
