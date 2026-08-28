/**
 * pheno-herm-cull-action-queue-safety
 *
 * The herm → cull suggestion is the ONLY pheno write path into the Action
 * Queue, and its one effective write is the sanctioned atomic
 * `action_queue_create` RPC wrapper (#586), createActionQueueItem — status
 * pinned server-side to pending_approval, queue row + 'created' audit event
 * committed together.
 *
 * Two layers, per AGENTS.md "resolved values, not source text":
 *  1. RESOLVED-VALUE: mock the sanctioned wrapper and assert what
 *     queueHermCullSuggestion actually calls it with — never a user_id,
 *     never a client-set status, never a target_device, always the
 *     observation-scoped dedupe key.
 *  2. SOURCE FENCES (the sanctioned use of a source scan — proving a
 *     forbidden construct is ABSENT): the pheno service and hook never touch
 *     Supabase directly (no .from(/.rpc(/client import), so the wrapper
 *     mocked in (1) is the only path, and neither file introduces
 *     device-control or auto-execute vocabulary.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  queueHermCullSuggestion,
  buildPhenoHermCullDedupeKey,
} from "@/lib/phenoActionQueueService";

const { createItem } = vi.hoisted(() => ({ createItem: vi.fn() }));
vi.mock("@/lib/actionQueueCreateService", () => ({ createActionQueueItem: createItem }));

const OK = {
  ok: true,
  action_queue_id: "aq-1",
  grow_id: "grow-1",
  status: "pending_approval",
  event_id: "ev-1",
  reused: false,
} as const;

describe("queueHermCullSuggestion — resolved write path", () => {
  beforeEach(() => {
    createItem.mockReset();
    createItem.mockResolvedValue(OK);
  });

  it("creates exactly one row through the sanctioned atomic wrapper", async () => {
    const res = await queueHermCullSuggestion({
      observationId: "obs-1",
      candidateLabel: "Candidate #4",
      growId: "grow-1",
      plantId: "plant-1",
      tentId: "tent-1",
    });
    expect(res).toEqual({ ok: true, id: "aq-1" });
    expect(createItem).toHaveBeenCalledTimes(1);

    const draft = createItem.mock.calls[0][0] as Record<string, unknown>;
    expect(draft.grow_id).toBe("grow-1");
    expect(draft.plant_id).toBe("plant-1");
    expect(draft.tent_id).toBe("tent-1");
    expect(draft.dedupe_key).toBe(buildPhenoHermCullDedupeKey("obs-1"));
    expect(typeof draft.reason).toBe("string");
    expect(draft.reason).toContain("obs-1");
    expect(typeof draft.risk_level).toBe("string");
    const change = JSON.parse(draft.suggested_change as string) as Record<string, unknown>;
    expect(change.decision).toBe("cull");
    expect(change.candidate_label).toBe("Candidate #4");
  });

  it("never sends user_id, a client-set status, or a target_device", async () => {
    await queueHermCullSuggestion({
      observationId: "obs-1",
      candidateLabel: "Candidate #4",
      growId: "grow-1",
      plantId: "plant-1",
    });
    const draft = createItem.mock.calls[0][0] as Record<string, unknown>;
    // The server derives auth.uid() and pins status=pending_approval; the
    // client asserting either would be the exact defect this file fences.
    expect("user_id" in draft).toBe(false);
    expect("status" in draft).toBe(false);
    expect("target_device" in draft).toBe(false);
    // Omitted tent maps to null, not undefined-key surprises downstream.
    expect(draft.tent_id).toBeNull();
  });

  it("scopes the dedupe key to the observation", () => {
    expect(buildPhenoHermCullDedupeKey("obs-9")).toBe("pheno_herm_cull:obs-9");
    expect(buildPhenoHermCullDedupeKey("  ")).toBeNull();
    expect(buildPhenoHermCullDedupeKey(undefined)).toBeNull();
  });

  it("maps wrapper failure to a calm error and a blank grow never reaches the wrapper", async () => {
    createItem.mockResolvedValue({ ok: false, reason: "forbidden" });
    const failed = await queueHermCullSuggestion({
      observationId: "obs-1",
      candidateLabel: "Candidate #4",
      growId: "grow-1",
      plantId: "plant-1",
    });
    expect(failed).toEqual({ ok: false, error: "Could not queue the removal for approval." });

    createItem.mockClear();
    const blankGrow = await queueHermCullSuggestion({
      observationId: "obs-1",
      candidateLabel: "Candidate #4",
      growId: "  ",
      plantId: "plant-1",
    });
    expect(blankGrow.ok).toBe(false);
    expect(createItem).not.toHaveBeenCalled();
  });
});

const FILES = ["src/lib/phenoActionQueueService.ts", "src/hooks/usePhenoHermCullSuggestion.ts"];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const sources = Object.fromEntries(
  FILES.map((f) => [f, stripComments(readFileSync(resolve(process.cwd(), f), "utf8"))]),
) as Record<string, string>;

describe("pheno herm→cull action queue — source fences", () => {
  const svc = sources["src/lib/phenoActionQueueService.ts"];

  it("never touches Supabase directly — the sanctioned wrapper is the only I/O", () => {
    for (const [path, src] of Object.entries(sources)) {
      expect(src, path).not.toMatch(/\.from\(/);
      expect(src, path).not.toMatch(/\.rpc\(/);
      expect(src, path).not.toMatch(/@\/integrations\/supabase/);
    }
    expect(svc).toMatch(/@\/lib\/actionQueueCreateService/);
  });

  it("never writes user_id, target_device, or a status on the queued row", () => {
    expect(svc).not.toMatch(/user_id\s*:/);
    expect(svc).not.toMatch(/target_device/);
    expect(svc).not.toMatch(/\bstatus\s*:/);
  });

  it("builds the payload only via the pure pending_approval builder", () => {
    expect(svc).toMatch(/buildPhenoKeeperActionQueuePayloads/);
  });

  it("carries no device-control / auto-execute vocabulary", () => {
    for (const [path, src] of Object.entries(sources)) {
      const lower = src.toLowerCase();
      expect(lower, path).not.toMatch(
        /device[_-]?control|device_command|autopilot|target_device|actuator|\bmqtt\b|dispatch_command/,
      );
      expect(lower, path).not.toMatch(/\bauto[-_ ]?execute\b|\bauto[-_ ]?approve\b/);
      expect(lower, path).not.toMatch(/service[_-]?role/);
    }
  });
});
