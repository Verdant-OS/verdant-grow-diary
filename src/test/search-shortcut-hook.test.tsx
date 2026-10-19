/**
 * One search-shortcut contract for the authenticated shell and /cultivars.
 */
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useSearchShortcut } from "@/hooks/useSearchShortcut";

function Harness() {
  const [open, setOpen] = useState(false);
  useSearchShortcut(setOpen);
  return open ? <div data-testid="search-palette" /> : <button type="button">Search</button>;
}

afterEach(cleanup);

describe("useSearchShortcut", () => {
  it("toggles the palette on Ctrl+K from a non-typing target", () => {
    render(<Harness />);
    expect(screen.queryByTestId("search-palette")).toBeNull();
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
    expect(screen.getByTestId("search-palette")).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
    expect(screen.queryByTestId("search-palette")).toBeNull();
  });

  it("does not toggle while typing in an input", () => {
    render(<Harness />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "k", metaKey: true });
    expect(screen.queryByTestId("search-palette")).toBeNull();
    input.remove();
  });
});
