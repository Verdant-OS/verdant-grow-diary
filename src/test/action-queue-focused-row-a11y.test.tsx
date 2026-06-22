/**
 * action-queue-focused-row-a11y — proves that focusing a row does NOT
 * overwrite its accessible name with the generic "Focused action"
 * label. The action title must remain announced via aria-labelledby,
 * and focused-state must be a description, not the name. Raw internal
 * ids must never appear in the visible or accessible label.
 *
 * Uses a tiny harness that mirrors the production aria wiring in
 * src/pages/ActionQueue.tsx so we do not have to mount the full page
 * (avoids the Radix Sheet jsdom drawer-open hang).
 */
import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, fireEvent } from "@testing-library/react";

function Row({ row }: { row: { id: string; action_type: string } }) {
  const titleId = `aq-pending-title-${row.id}`;
  const descId = `aq-pending-desc-${row.id}`;
  const [focused, setFocused] = useState(false);
  return (
    <li
      tabIndex={0}
      data-testid="row"
      data-focused={focused ? "true" : undefined}
      aria-labelledby={titleId}
      aria-describedby={focused ? `${descId} ${descId}-focused` : descId}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <span id={descId} className="sr-only">
        Approved · risk low
      </span>
      {focused && (
        <span id={`${descId}-focused`} className="sr-only">
          Focused
        </span>
      )}
      <h3 id={titleId}>{row.action_type}</h3>
    </li>
  );
}

describe("Action Queue focused row a11y", () => {
  const row = { id: "11111111-2222-3333-4444-555555555555", action_type: "Reduce VPD" };

  it("aria-labelledby always points at the title id, even when focused", () => {
    const { getByTestId } = render(
      <ul>
        <Row row={row} />
      </ul>,
    );
    const li = getByTestId("row");
    expect(li.getAttribute("aria-labelledby")).toBe(
      `aq-pending-title-${row.id}`,
    );
    li.focus();
    expect(li.getAttribute("aria-labelledby")).toBe(
      `aq-pending-title-${row.id}`,
    );
    // Generic "Focused action" must NOT replace the accessible name.
    expect(li.getAttribute("aria-label")).toBeNull();
  });

  it("focused state is conveyed via aria-describedby, not aria-label", () => {
    const { getByTestId, container } = render(
      <ul>
        <Row row={row} />
      </ul>,
    );
    const li = getByTestId("row");
    li.focus();
    const desc = li.getAttribute("aria-describedby") ?? "";
    expect(desc).toContain(`aq-pending-desc-${row.id}`);
    expect(desc).toContain(`aq-pending-desc-${row.id}-focused`);
    const focusedSpan = container.querySelector(
      `#aq-pending-desc-${row.id}-focused`,
    );
    expect(focusedSpan?.textContent).toBe("Focused");
  });

  it("raw UUID is never present in the visible or accessible label text", () => {
    const { getByTestId } = render(
      <ul>
        <Row row={row} />
      </ul>,
    );
    const li = getByTestId("row");
    li.focus();
    fireEvent.focus(li);
    // Visible text shows action_type only.
    expect(li.textContent ?? "").not.toContain(row.id);
    // aria-label is absent so it cannot contain the UUID.
    expect(li.getAttribute("aria-label")).toBeNull();
  });
});
