// The Tent Detail header Quick Log opens the existing Quick Log on the tent,
// with no plant selected (Cheek, 2026-11-28). The sheet mounts only once
// the button is used.
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/QuickLogV2Sheet", () => ({
  default: ({
    open,
    onOpenChange,
    defaultTargetKey,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    defaultTargetKey?: string | null;
  }) => (
    <div data-testid="stub-sheet" data-open={String(open)} data-target={defaultTargetKey ?? ""}>
      <button type="button" onClick={() => onOpenChange(false)}>
        Close
      </button>
    </div>
  ),
}));

import TentDetailQuickLogButton, {
  tentHeaderQuickLogTargetKey,
} from "@/components/TentDetailQuickLogButton";

afterEach(() => cleanup());

describe("TentDetailQuickLogButton", () => {
  it("targets the tent, never a plant", () => {
    expect(tentHeaderQuickLogTargetKey("tent-1")).toBe("tent:tent-1");
  });

  it("mounts the sheet only when used, aimed at the tent", async () => {
    const user = userEvent.setup();
    render(<TentDetailQuickLogButton tentId="tent-1" />);
    expect(screen.queryByTestId("stub-sheet")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Quick Log" }));
    const sheet = screen.getByTestId("stub-sheet");
    expect(sheet).toHaveAttribute("data-open", "true");
    expect(sheet).toHaveAttribute("data-target", "tent:tent-1");
  });

  it("closes and reopens on the same tent from the keyboard", async () => {
    const user = userEvent.setup();
    render(<TentDetailQuickLogButton tentId="tent-1" />);
    const button = screen.getByTestId("tent-detail-header-quick-log");
    button.focus();
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByTestId("stub-sheet")).toHaveAttribute("data-open", "false");
    button.focus();
    await user.keyboard(" ");
    expect(screen.getByTestId("stub-sheet")).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("stub-sheet")).toHaveAttribute("data-target", "tent:tent-1");
  });
});
