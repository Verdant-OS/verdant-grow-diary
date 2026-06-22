import { describe, it, expect } from "vitest";
import {
  buildRetryTraceViewModel,
  RETRY_TRACE_EXPLAIN_PRIMARY,
  RETRY_TRACE_EXPLAIN_SECONDARY,
  RETRY_TRACE_BUTTON_LABEL_IDLE,
  RETRY_TRACE_BUTTON_LABEL_RETRYING,
} from "@/lib/actionQueueRetryTraceViewModel";

describe("buildRetryTraceViewModel", () => {
  it("idle when no trace failure", () => {
    const vm = buildRetryTraceViewModel({ traceFailed: false, retrying: false });
    expect(vm.state).toBe("idle");
    expect(vm.buttonHidden).toBe(true);
    expect(vm.buttonLabel).toBeNull();
    expect(vm.showFailureRegion).toBe(false);
    expect(vm.explanationLines).toEqual([]);
  });

  it("idle even when retrying flag is set but no failure (defensive)", () => {
    const vm = buildRetryTraceViewModel({ traceFailed: false, retrying: true });
    expect(vm.state).toBe("idle");
    expect(vm.buttonHidden).toBe(true);
  });

  it("failed: shows both diary-trace-specific lines and enabled retry button", () => {
    const vm = buildRetryTraceViewModel({ traceFailed: true, retrying: false });
    expect(vm.state).toBe("failed");
    expect(vm.explanationLines).toEqual([
      RETRY_TRACE_EXPLAIN_PRIMARY,
      RETRY_TRACE_EXPLAIN_SECONDARY,
    ]);
    expect(vm.buttonLabel).toBe(RETRY_TRACE_BUTTON_LABEL_IDLE);
    expect(vm.buttonDisabled).toBe(false);
    expect(vm.buttonHidden).toBe(false);
    expect(vm.showFailureRegion).toBe(true);
  });

  it("retrying: explanation persists, button disabled with retrying label", () => {
    const vm = buildRetryTraceViewModel({ traceFailed: true, retrying: true });
    expect(vm.state).toBe("retrying");
    expect(vm.buttonLabel).toBe(RETRY_TRACE_BUTTON_LABEL_RETRYING);
    expect(vm.buttonDisabled).toBe(true);
    expect(vm.buttonHidden).toBe(false);
  });

  it("guidance is trace-specific (not generic), and never implies device or auto-approve", () => {
    const blob = [
      RETRY_TRACE_EXPLAIN_PRIMARY,
      RETRY_TRACE_EXPLAIN_SECONDARY,
      RETRY_TRACE_BUTTON_LABEL_IDLE,
      RETRY_TRACE_BUTTON_LABEL_RETRYING,
    ]
      .join(" ")
      .toLowerCase();
    expect(blob.includes("diary trace")).toBe(true);
    expect(blob.includes("something went wrong")).toBe(false);
    for (const banned of [
      "device",
      "equipment",
      "execute",
      "autopilot",
      "auto-approve",
      "safe",
      "healthy",
    ]) {
      expect(blob.includes(banned)).toBe(false);
    }
    expect(blob.includes("approve/reject again")).toBe(true);
  });
});
