/**
 * UiViewSwitch — presenter behaviour for Simple ⇄ Advanced.
 *
 * Toggle and cards layouts, honest save status copy, and account-unavailable
 * fallback when no save message is shown.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import UiViewSwitch from "@/components/UiViewSwitch";
import { UI_VIEW_COPY } from "@/lib/uiViewPreferenceRules";

describe("UiViewSwitch", () => {
  it("toggle layout offers one button to the other view", () => {
    const onChoose = vi.fn(async () => true);
    render(
      <UiViewSwitch current="simple" onChoose={onChoose} save={{ kind: "idle" }} layout="toggle" />,
    );
    expect(screen.getByTestId("ui-view-switch")).toHaveAttribute("data-current-view", "simple");
    expect(screen.getByTestId("ui-view-switch-to-advanced")).toHaveTextContent(
      UI_VIEW_COPY.switchToAdvanced,
    );
    expect(screen.queryByTestId("ui-view-choice-simple")).toBeNull();
  });

  it("cards layout marks the current view and calls onChoose when another is picked", async () => {
    const onChoose = vi.fn(async () => true);
    render(
      <UiViewSwitch current="simple" onChoose={onChoose} save={{ kind: "idle" }} layout="cards" />,
    );
    const advanced = screen.getByTestId("ui-view-choice-advanced");
    const simple = screen.getByTestId("ui-view-choice-simple");
    expect(simple).toHaveAttribute("aria-pressed", "true");
    expect(advanced).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(advanced);
    await waitFor(() => expect(onChoose).toHaveBeenCalledWith("advanced"));
  });

  it("shows saving, saved and failed status copy with the correct live region role", () => {
    const { rerender } = render(
      <UiViewSwitch
        current="advanced"
        onChoose={vi.fn()}
        save={{ kind: "saving", view: "advanced" }}
      />,
    );
    let status = screen.getByTestId("ui-view-switch-status");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveTextContent(UI_VIEW_COPY.saving);

    rerender(
      <UiViewSwitch
        current="advanced"
        onChoose={vi.fn()}
        save={{ kind: "saved", view: "advanced" }}
      />,
    );
    expect(screen.getByTestId("ui-view-switch-status")).toHaveTextContent(
      UI_VIEW_COPY.savedToAccount,
    );

    rerender(
      <UiViewSwitch
        current="advanced"
        onChoose={vi.fn()}
        save={{ kind: "failed", view: "advanced", message: "offline" }}
      />,
    );
    status = screen.getByTestId("ui-view-switch-status");
    expect(status).toHaveAttribute("role", "alert");
    expect(status).toHaveTextContent(UI_VIEW_COPY.saveFailed);
  });

  it("shows account-unavailable copy only when idle and the account read failed", () => {
    render(
      <UiViewSwitch
        current="simple"
        onChoose={vi.fn()}
        save={{ kind: "idle" }}
        accountUnavailable
      />,
    );
    expect(screen.getByTestId("ui-view-switch-account-unavailable")).toHaveTextContent(
      UI_VIEW_COPY.accountUnavailable,
    );
    expect(screen.queryByTestId("ui-view-switch-status")).toBeNull();
  });

  it("ignores rapid clicks while a choice is in flight", async () => {
    let release: () => void = () => {};
    const onChoose = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          release = () => resolve(true);
        }),
    );
    render(
      <UiViewSwitch current="simple" onChoose={onChoose} save={{ kind: "idle" }} layout="toggle" />,
    );
    const button = screen.getByTestId("ui-view-switch-to-advanced");
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onChoose).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
