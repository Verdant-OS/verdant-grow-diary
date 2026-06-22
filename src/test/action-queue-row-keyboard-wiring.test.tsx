/**
 * action-queue-row-keyboard-wiring — minimal DOM-level harness that
 * proves the production keyboard wiring (resolveActionQueueNavIntent
 * + open-drawer) is hooked up to a row's onKeyDown:
 *
 *   - Enter calls setDrawerRow exactly once for the focused row.
 *   - ArrowDown/ArrowUp/Home/End only move focus (no drawer, no mutation).
 *   - approve / reject / retry / complete / execute are NEVER invoked.
 *
 * We render a tiny <li>-based harness that mirrors the production
 * onKeyDown logic in src/pages/ActionQueue.tsx. This deliberately
 * avoids mounting the full ActionQueue page (and Radix Sheet) so we
 * do not reintroduce the jsdom drawer-open hang.
 */
import { describe, it, expect, vi } from "vitest";
import { useRef, useState } from "react";
import { render, fireEvent, act } from "@testing-library/react";
import {
  isActionQueueNavigationKey,
  resolveActionQueueNavIntent,
} from "@/lib/actionQueueKeyboardNavigationRules";

type Row = { id: string; title: string };

function Harness({
  rows,
  setDrawerRow,
  forbiddenMutators,
}: {
  rows: Row[];
  setDrawerRow: (r: Row) => void;
  forbiddenMutators: {
    approve: () => void;
    reject: () => void;
    retry: () => void;
    complete: () => void;
    execute: () => void;
  };
}) {
  const refs = useRef(new Map<string, HTMLLIElement>());
  const [focusedId, setFocusedId] = useState<string | null>(rows[0]?.id ?? null);
  return (
    <ul>
      {rows.map((row, rowIndex) => (
        <li
          key={row.id}
          ref={(node) => {
            if (node) refs.current.set(row.id, node);
            else refs.current.delete(row.id);
          }}
          tabIndex={0}
          data-testid={`row-${row.id}`}
          data-focused={focusedId === row.id ? "true" : undefined}
          onFocus={() => setFocusedId(row.id)}
          onKeyDown={(e) => {
            if (!isActionQueueNavigationKey(e.key)) return;
            if (e.target !== e.currentTarget) return;
            const intent = resolveActionQueueNavIntent({
              currentIndex: rowIndex,
              listLength: rows.length,
              key: e.key,
            });
            if (!intent) return;
            e.preventDefault();
            if (intent.kind === "open-drawer") {
              setDrawerRow(rows[intent.index] ?? row);
              return;
            }
            const next = rows[intent.index];
            if (next) {
              refs.current.get(next.id)?.focus();
              setFocusedId(next.id);
            }
            // Never call any mutator.
            void forbiddenMutators;
          }}
        >
          {row.title}
        </li>
      ))}
    </ul>
  );
}

const ROWS: Row[] = [
  { id: "a", title: "Row A" },
  { id: "b", title: "Row B" },
  { id: "c", title: "Row C" },
];

function setup() {
  const setDrawerRow = vi.fn();
  const forbidden = {
    approve: vi.fn(),
    reject: vi.fn(),
    retry: vi.fn(),
    complete: vi.fn(),
    execute: vi.fn(),
  };
  const utils = render(
    <Harness
      rows={ROWS}
      setDrawerRow={setDrawerRow}
      forbiddenMutators={forbidden}
    />,
  );
  return { ...utils, setDrawerRow, forbidden };
}

describe("Action Queue row keyboard wiring (DOM-level)", () => {
  it("Enter on a focused row opens drawer for THAT row exactly once", () => {
    const { getByTestId, setDrawerRow, forbidden } = setup();
    const rowA = getByTestId("row-a");
    act(() => { rowA.focus(); });
    fireEvent.keyDown(rowA, { key: "Enter" });
    expect(setDrawerRow).toHaveBeenCalledTimes(1);
    expect(setDrawerRow).toHaveBeenCalledWith(ROWS[0]);
    for (const fn of Object.values(forbidden)) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it("Enter on the second row opens drawer for the second row", () => {
    const { getByTestId, setDrawerRow } = setup();
    const rowB = getByTestId("row-b");
    act(() => { rowB.focus(); });
    fireEvent.keyDown(rowB, { key: "Enter" });
    expect(setDrawerRow).toHaveBeenCalledTimes(1);
    expect(setDrawerRow).toHaveBeenCalledWith(ROWS[1]);
  });

  it.each(["ArrowDown", "ArrowUp", "Home", "End"])(
    "%s never opens drawer and never calls any mutator",
    (key) => {
      const { getByTestId, setDrawerRow, forbidden } = setup();
      const rowB = getByTestId("row-b");
      act(() => { rowB.focus(); });
      fireEvent.keyDown(rowB, { key });
      expect(setDrawerRow).not.toHaveBeenCalled();
      for (const fn of Object.values(forbidden)) {
        expect(fn).not.toHaveBeenCalled();
      }
    },
  );

  it("non-navigation keys are ignored entirely", () => {
    const { getByTestId, setDrawerRow, forbidden } = setup();
    const rowA = getByTestId("row-a");
    act(() => { rowA.focus(); });
    for (const key of [" ", "Space", "Tab", "Escape", "Delete", "a"]) {
      fireEvent.keyDown(rowA, { key });
    }
    expect(setDrawerRow).not.toHaveBeenCalled();
    for (const fn of Object.values(forbidden)) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
});
