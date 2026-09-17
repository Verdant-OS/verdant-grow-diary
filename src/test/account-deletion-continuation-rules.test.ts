import { describe, expect, it } from "vitest";
import { createAccountDeletionContinuation } from "@/lib/accountDeletionContinuationRules";

describe("account deletion continuation rules", () => {
  it("starts current and records cleanup admission while current", () => {
    const ticket = createAccountDeletionContinuation();
    expect(ticket.isCurrent()).toBe(true);
    expect(ticket.beginCleanup()).toBe(true);
    expect(ticket.isCurrent()).toBe(true);
  });

  it("permanently abandons a continuation after explicit invalidation", () => {
    const ticket = createAccountDeletionContinuation();
    ticket.invalidate();
    expect(ticket.isCurrent()).toBe(false);
    expect(ticket.beginCleanup()).toBe(false);
  });

  it("abandons an unstarted continuation when Settings unmounts", () => {
    const ticket = createAccountDeletionContinuation();
    ticket.unmount();
    expect(ticket.isCurrent()).toBe(false);
    expect(ticket.beginCleanup()).toBe(false);
  });

  it("keeps a cleanup-owning continuation current through the expected provider unmount", () => {
    const ticket = createAccountDeletionContinuation();
    expect(ticket.beginCleanup()).toBe(true);
    ticket.unmount();
    expect(ticket.isCurrent()).toBe(true);
  });

  it("does not revive an already invalidated continuation through unmount", () => {
    const ticket = createAccountDeletionContinuation();
    ticket.invalidate();
    ticket.unmount();
    expect(ticket.isCurrent()).toBe(false);
  });

  it("is deterministic for identical lifecycle sequences", () => {
    const run = () => {
      const ticket = createAccountDeletionContinuation();
      ticket.beginCleanup();
      ticket.unmount();
      return ticket.isCurrent();
    };
    expect(Array.from({ length: 10 }, run)).toEqual(Array(10).fill(true));
  });
});
