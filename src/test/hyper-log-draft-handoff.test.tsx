/**
 * Static + behavior safety guards for the HyperLog → Quick Log handoff.
 *
 * Asserts:
 *  - hyperLogDraftRules has no Supabase / write / AI / Action Queue imports
 *  - GlobalFastAddButton dispatches the existing `verdant:open-quicklog`
 *    event from HyperLogModal's onCommit (no new write path)
 *  - HyperLogModal still labels demo data clearly (DEMO SNAPSHOT / DEMO ONLY)
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GlobalFastAddButton from "@/components/GlobalFastAddButton";

if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === "undefined") {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const RULES = read("src/lib/hyperLogDraftRules.ts");
const MODAL = read("src/components/HyperLogModal.tsx");
const FAST_ADD = read("src/components/GlobalFastAddButton.tsx");

const FORBIDDEN = [
  "@/integrations/supabase",
  "supabase-js",
  ".rpc(",
  ".from(\"diary_entries\"",
  ".from('diary_entries'",
  ".from(\"sensor_readings\"",
  "ai-doctor",
  "ActionQueue",
  "action-queue",
  "alerts/",
  "deviceControl",
  "device-control",
];

describe("HyperLog draft → Quick Log handoff — static safety", () => {
  it("hyperLogDraftRules has no I/O or forbidden imports", () => {
    for (const needle of FORBIDDEN) {
      expect(RULES, `rules contain forbidden ${needle}`).not.toContain(needle);
    }
    expect(RULES).not.toMatch(/\bfetch\s*\(/);
  });

  it("HyperLogModal still labels demo data", () => {
    expect(MODAL).toContain("DEMO SNAPSHOT");
    expect(MODAL).toContain("DEMO ONLY");
    // Never asserts live-ness.
    expect(MODAL).not.toMatch(/\bLIVE\s+SNAPSHOT\b/);
  });

  it("GlobalFastAddButton uses the existing PLANT_QUICKLOG_PREFILL_EVENT name", () => {
    expect(FAST_ADD).toContain("HYPERLOG_QUICKLOG_EVENT_NAME");
    expect(FAST_ADD).toContain("buildHyperLogQuickLogPrefill");
    expect(FAST_ADD).not.toMatch(/\.from\(\s*["']diary_entries["']/);
    expect(FAST_ADD).not.toMatch(/supabase\.rpc/);
  });
});

describe("GlobalFastAddButton HyperLog handoff", () => {
  it("dispatches verdant:open-quicklog with mapped prefill when HyperLog commits", () => {
    const onDispatchEvent = vi.fn();
    render(
      <MemoryRouter initialEntries={["/plants/p-99"]}>
        <GlobalFastAddButton onDispatchEvent={onDispatchEvent} />
      </MemoryRouter>,
    );

    // Open the Quick Log menu
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    // Launch HyperLog demo with "water" preselected
    fireEvent.click(
      screen.getByTestId("global-fast-add-hyperlog-water") ??
        screen.getByRole("button", { name: /water/i }),
    );

    // Click the commit CTA inside HyperLogModal
    const commit = screen.getByTestId("hyperlog-commit");
    fireEvent.click(commit);

    // The existing wired event name must be used — no new write path.
    expect(onDispatchEvent).toHaveBeenCalled();
    const [eventName, detail] = onDispatchEvent.mock.calls[0];
    expect(eventName).toBe("verdant:open-quicklog");
    expect(detail).toMatchObject({ eventType: "watering" });
    // No demo sensor values leaked
    const json = JSON.stringify(detail);
    expect(json).not.toMatch(/24\.6/);
    expect(json).not.toMatch(/1\.12/);
  });
});
