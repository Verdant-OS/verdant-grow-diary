/**
 * End-to-end-ish user-flow tests for each HyperLog tile.
 *
 * Mounts GlobalFastAddButton + a stub Quick Log listener and verifies
 * that clicking each HyperLog tile + Commit fires the existing
 * `verdant:open-quicklog` event with the correct prefill shape.
 *
 * Hard assertions:
 *  - existing event name used (no new write path)
 *  - eventType mapping is correct per tile
 *  - HyperLog demo snapshot values (24.6 / 58 / 1.12) never appear
 *  - HyperLog photos stay local: no file refs in dispatched detail
 *  - source = "hyperlog"; never labeled live
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GlobalFastAddButton from "@/components/GlobalFastAddButton";
import type { QuickLogPrefill } from "@/components/QuickLog";

if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === "undefined") {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

type Dispatched = { name: string; detail: QuickLogPrefill };
const captured: Dispatched[] = [];
const handler = (e: Event) => {
  const ce = e as CustomEvent<QuickLogPrefill>;
  captured.push({ name: e.type, detail: ce.detail });
};

beforeEach(() => {
  captured.length = 0;
  window.addEventListener("verdant:open-quicklog", handler as EventListener);
});
afterEach(() => {
  window.removeEventListener("verdant:open-quicklog", handler as EventListener);
});

function openTileAndCommit(tile: string) {
  render(
    <MemoryRouter initialEntries={["/plants/p-77"]}>
      <GlobalFastAddButton />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
  fireEvent.click(screen.getByTestId(`global-fast-add-hyperlog-${tile}`));
  act(() => {
    fireEvent.click(screen.getByTestId("hyperlog-commit"));
  });
}

describe("HyperLog tile → Quick Log handoff e2e", () => {
  it("water tile maps to eventType=watering and uses the existing event", () => {
    openTileAndCommit("water");
    expect(captured).toHaveLength(1);
    expect(captured[0].name).toBe("verdant:open-quicklog");
    expect(captured[0].detail.eventType).toBe("watering");
    expect(captured[0].detail.source).toBe("hyperlog");
  });

  it("feed tile maps to eventType=feeding", () => {
    openTileAndCommit("feed");
    expect(captured[0].detail.eventType).toBe("feeding");
  });

  it("defoliate tile maps to eventType=training", () => {
    openTileAndCommit("defoliate");
    expect(captured[0].detail.eventType).toBe("training");
  });

  it("note tile maps to eventType=observation", () => {
    openTileAndCommit("note");
    expect(captured[0].detail.eventType).toBe("observation");
  });

  it("environment tile maps to eventType=environment", () => {
    openTileAndCommit("environment");
    expect(captured[0].detail.eventType).toBe("environment");
  });

  it("never carries HyperLog demo snapshot values (24.6 / 58 / 1.12) and never labels live", () => {
    openTileAndCommit("water");
    const json = JSON.stringify(captured[0].detail);
    expect(json).not.toMatch(/24\.6/);
    expect(json).not.toMatch(/1\.12/);
    expect(json).not.toMatch(/"58"/);
    expect(json).not.toMatch(/\blive\b/i);
  });

  it("never exposes File refs / object URLs in the dispatched detail", () => {
    openTileAndCommit("note");
    const json = JSON.stringify(captured[0].detail);
    expect(json).not.toMatch(/blob:/);
    expect(json).not.toMatch(/File\(/);
    // photoCount is the only photo info that may travel — never URLs/files.
    expect(typeof captured[0].detail.photoCount === "number" || captured[0].detail.photoCount == null).toBe(true);
  });

  it("does not call any new persistence function from HyperLogModal/GlobalFastAdd commit", () => {
    // Spy-style assertion: a no-op handler captured the event, but nothing
    // else fired. Re-validate by counting events on the wire.
    const spy = vi.fn();
    window.addEventListener("verdant:entry-created", spy as EventListener);
    openTileAndCommit("environment");
    window.removeEventListener("verdant:entry-created", spy as EventListener);
    expect(spy).not.toHaveBeenCalled();
  });
});
