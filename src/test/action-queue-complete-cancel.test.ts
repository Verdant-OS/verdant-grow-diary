import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const src = readFileSync(resolve(__dirname, "../pages/ActionQueue.tsx"), "utf8");

describe("Action Queue complete/cancel transitions", () => {
  it("defines complete and cancel dialog kinds", () => {
    expect(src).toMatch(/"approve" \| "reject" \| "simulate" \| "complete" \| "cancel"/);
  });

  it("blocks transitions on terminal statuses", () => {
    expect(src).toMatch(/row\.status === "completed" \|\| row\.status === "rejected" \|\| row\.status === "cancelled"/);
  });

  it("complete branch sets status completed + completed_at and writes audit", () => {
    expect(src).toMatch(/status: "completed", completed_at:/);
    expect(src).toMatch(/"completed",\s*"completed",\s*note/);
  });

  it("cancel branch sets status cancelled and writes audit", () => {
    expect(src).toMatch(/\{ status: "cancelled" \}/);
    expect(src).toMatch(/"cancelled",\s*"cancelled",\s*note/);
  });

  it("Mark Complete is gated to approved/simulated rows", () => {
    expect(src).toMatch(/canComplete = \(s: Status\) => s === "approved" \|\| s === "simulated"/);
    expect(src).toMatch(/canComplete\(row\.status\) && \(/);
    expect(src).toMatch(/Mark Complete/);
  });

  it("Cancel is gated to pending/simulated/approved rows", () => {
    expect(src).toMatch(/canCancel = \(s: Status\) =>[\s\S]*?"pending_approval"[\s\S]*?"approved"[\s\S]*?"simulated"/);
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
