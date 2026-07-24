/**
 * Public Quick Log Starter — automated axe a11y checks (auth-axe pattern).
 * No auth provider, no network — the page is a pure public surface.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { axe } from "vitest-axe";
import QuickLogStarter from "@/pages/QuickLogStarter";
import { clearPublicQuickLogStarterDraft } from "@/lib/publicQuickLogStarterDraftStore";

function renderStarter() {
  return render(
    <MemoryRouter initialEntries={["/quick-log"]}>
      <QuickLogStarter />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  clearPublicQuickLogStarterDraft();
});

describe("QuickLogStarter a11y", () => {
  it("empty state has no axe violations", async () => {
    const { container } = renderStarter();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("error state keeps labeled fields and announces errors", async () => {
    const { container } = renderStarter();
    fireEvent.click(screen.getByTestId("starter-save-draft"));
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect((await axe(container)).violations).toEqual([]);
  });

  it("saved-draft state has no axe violations", async () => {
    const { container } = renderStarter();
    fireEvent.change(screen.getByTestId("starter-plant-nickname"), {
      target: { value: "Blue Dream #1" },
    });
    fireEvent.change(screen.getByTestId("starter-note"), {
      target: { value: "Healthy first leaves." },
    });
    fireEvent.click(screen.getByTestId("starter-save-draft"));
    expect(screen.getByTestId("starter-saved-draft")).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("exposes exactly one h1 and labeled form controls", () => {
    renderStarter();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByLabelText(/plant nickname/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/growth stage/i)).toBeInTheDocument();
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
  });
});
