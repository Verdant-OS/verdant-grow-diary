import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const src = readFileSync(resolve(__dirname, "../pages/ActionQueue.tsx"), "utf8");

describe("Action Queue complete/cancel transitions", () => {
  it("defines complete and cancel dialog kinds", () => {
    expect(src).toMatch(/"approve" \| "reject" \| "simulate" \| "complete" \| "cancel"/);
  });

  it("blocks transitions on terminal statuses via shared isTerminalStatus", () => {
    expect(src).toMatch(/isTerminalStatus\(row\.status\)/);
  });

  it("complete branch delegates status and completed_at derivation to the transactional RPC", () => {
    expect(src).toMatch(/transition:\s*kind/);
    expect(src).toMatch(/expectedStatus:\s*row\.status/);
    expect(src).toMatch(/from "@\/lib\/actionQueueTransitions"/);
  });

  it("cancel transition accepts only a validated canonical RPC result", () => {
    expect(src).toMatch(/parseActionQueueTransitionRpcResult\(data,\s*rpcArgs\)/);
    expect(src).toMatch(/result\.ok !== true/);
  });

  it("Mark Complete is gated via shared canComplete", () => {
    expect(src).toMatch(
      /import \{[\s\S]*?canComplete[\s\S]*?\} from "@\/lib\/actionQueueTransitions"/,
    );
    expect(src).toMatch(/canComplete\(row\.status\) && \(/);
    expect(src).toMatch(/Mark Complete/);
  });

  it("Cancel is gated via shared canCancel", () => {
    expect(src).toMatch(
      /import \{[\s\S]*?canCancel[\s\S]*?\} from "@\/lib\/actionQueueTransitions"/,
    );
    expect(src).toMatch(/canCancel\(row\.status\) && \(/);
  });

  it("status filter includes completed and cancelled", () => {
    expect(src).toMatch(/value="completed">Completed/);
    expect(src).toMatch(/value="cancelled">Cancelled/);
  });

  it("uses existing note dialog flow for complete and cancel", () => {
    expect(src).toMatch(/openNoteDialog\(row, "complete"\)/);
    expect(src).toMatch(/openNoteDialog\(row, "cancel"\)/);
    expect(src).toMatch(/complete: \{\s*title: "Mark Action Complete"/);
    expect(src).toMatch(/cancel: \{\s*title: "Cancel Action"/);
  });

  it("records status and audit through the canonical RPC (no privileged key)", () => {
    // Tolerates the current runtime-availability cast:
    //   (supabase.rpc as unknown as (...) => ...)("action_queue_transition", rpcArgs)
    // as well as a direct supabase.rpc("action_queue_transition", ...).
    expect(src).toMatch(/supabase\.rpc\b[\s\S]{0,200}?["']action_queue_transition["']/);
    expect(src).not.toMatch(/\.from\(\s*"action_queue_events"\s*\)\s*\.insert\(/);
    expect(src).not.toMatch(/service_role/i);
  });

  it("introduces no device-control surface", () => {
    expect(src).not.toMatch(/mqtt|home.?assistant|pi_bridge|webhook|relay|actuator/i);
  });
});
