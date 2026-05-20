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

  it("complete branch builds patch with status completed + completed_at via shared helper", () => {
    expect(src).toMatch(/buildTransitionPatch\(kind\)/);
    expect(src).toMatch(/from "@\/lib\/actionQueueTransitions"/);
  });

  it("cancel transition uses shared eventTypeFor/nextStatusFor", () => {
    expect(src).toMatch(/eventTypeFor\(kind\)/);
    expect(src).toMatch(/nextStatusFor\(kind\)/);
  });

  it("Mark Complete is gated via shared canComplete", () => {
    expect(src).toMatch(/import \{[\s\S]*?canComplete[\s\S]*?\} from "@\/lib\/actionQueueTransitions"/);
    expect(src).toMatch(/canComplete\(row\.status\) && \(/);
    expect(src).toMatch(/Mark Complete/);
  });

  it("Cancel is gated via shared canCancel", () => {
    expect(src).toMatch(/import \{[\s\S]*?canCancel[\s\S]*?\} from "@\/lib\/actionQueueTransitions"/);
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

  it("inserts audit events via existing logEvent path (no service_role)", () => {
    expect(src).not.toMatch(/service_role/i);
  });

  it("introduces no device-control surface", () => {
    expect(src).not.toMatch(/mqtt|home.?assistant|pi_bridge|webhook|relay|actuator/i);
  });
});
