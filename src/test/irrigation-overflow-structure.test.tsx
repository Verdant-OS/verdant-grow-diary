/**
 * Structural overflow-safety + 44px proof (jsdom) for the isolated irrigation
 * surfaces. jsdom does not compute layout, so this asserts the overflow-safe
 * primitives are present (min-w-0 containers; truncate/break-words on text; no
 * fixed-px inline widths) and that primary controls are >= 44px (min-h-11). The
 * real scrollWidth<=clientWidth proof at 5 widths is the Playwright fixture spec
 * (e2e/irrigation-overflow.spec.ts), CI-run.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { StructuredWateringEntry } from "@/components/irrigation/StructuredWateringEntry";
import { TentIrrigationHistoryPanel } from "@/components/irrigation/TentIrrigationHistoryPanel";
import { useTentIrrigationLedger } from "@/hooks/useTentIrrigationLedger";
import type { IrrigationLedgerRow } from "@/lib/irrigation/irrigationLedgerRules";

vi.mock("@/hooks/useTentIrrigationLedger", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useTentIrrigationLedger: vi.fn() };
});

const LONG = "Absurdly-long-product-and-note-designation-that-must-never-force-horizontal-overflow-on-a-narrow-glove-friendly-phone-screen";

const longRow: IrrigationLedgerRow = {
  id: "w-1",
  kind: "feeding",
  occurredAt: "2026-07-20T10:00:00Z",
  plantId: null,
  tentId: "t",
  source: "manual",
  sourceLabel: "Manual log",
  note: LONG,
  volumeMl: 1234,
  ph: 6.1,
  ecMsCm: 1.8,
  outputEcMsCm: 2.2,
  runoffMl: 300,
  runoffPh: 6.4,
  runoffEcMsCm: 2.4,
  waterTempC: 20,
  products: [{ name: LONG, amount: 5, unit: "ml" }],
  unmeasured: false,
};

beforeEach(() =>
  vi.mocked(useTentIrrigationLedger).mockReturnValue({
    rows: [longRow],
    isLoading: false,
    isError: false,
    isOlderError: false,
    isFetchingNextPage: false,
    hasNextPage: true,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }),
);

function assertOverflowSafe(container: HTMLElement) {
  // No element pins a fixed pixel width inline (would force overflow).
  for (const el of Array.from(container.querySelectorAll<HTMLElement>("*"))) {
    const w = el.style.width;
    expect(w === "" || w === "100%" || w === "auto" || w.endsWith("%")).toBe(true);
  }
  // Primary controls are >= 44px tap targets.
  const controls = container.querySelectorAll<HTMLElement>("button, input:not([type='hidden'])");
  expect(controls.length).toBeGreaterThan(0);
  for (const c of Array.from(controls)) {
    expect(c.className, `${c.tagName} must be >=44px (min-h-11)`).toContain("min-h-11");
  }
}

describe("irrigation surfaces are overflow-safe (structural)", () => {
  it("StructuredWateringEntry: min-w-0 root, 44px controls, no fixed inline widths", () => {
    const { container, getByTestId } = render(
      <StructuredWateringEntry growId="g" tentId="t" writer={vi.fn() as never} />,
    );
    expect(getByTestId("structured-watering-entry").className).toContain("min-w-0");
    assertOverflowSafe(container);
  });

  it("TentIrrigationHistoryPanel: min-w-0, wraps long content, 44px controls", () => {
    const { container, getByTestId } = render(<TentIrrigationHistoryPanel tentId="t" />);
    expect(getByTestId("tent-irrigation-history").className).toContain("min-w-0");
    // The long note uses break-words so it can never force a horizontal scroll.
    const note = Array.from(container.querySelectorAll("p")).find((p) => p.textContent === LONG);
    expect(note?.className).toContain("break-words");
    assertOverflowSafe(container);
  });
});
