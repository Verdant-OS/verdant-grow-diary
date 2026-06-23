import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DemoProofWalkthrough from "@/pages/DemoProofWalkthrough";
import { buildDemoProofWalkthroughViewModel } from "@/lib/demoProofWalkthroughViewModel";

function renderPage() {
  return render(
    <MemoryRouter>
      <DemoProofWalkthrough />
    </MemoryRouter>,
  );
}

describe("DemoProofWalkthrough page", () => {
  it("renders the page title and proof-window scope", () => {
    renderPage();
    expect(
      screen.getByText(/Verdant One-Tent Loop Proof Walkthrough/i),
    ).toBeTruthy();
    expect(
      screen.getByTestId("demo-proof-walkthrough-proof-window").textContent,
    ).toMatch(/current proof window/i);
  });

  it("renders every walkthrough step from the view model", () => {
    const vm = buildDemoProofWalkthroughViewModel();
    renderPage();
    for (const s of vm.steps) {
      expect(
        screen.getByTestId(`demo-proof-walkthrough-step-${s.id}`),
      ).toBeTruthy();
      expect(
        screen.getByTestId(`demo-proof-walkthrough-step-${s.id}-link`)
          .getAttribute("href"),
      ).toBe(s.href);
    }
  });

  it("operator-mode step link preserves ?operator=1", () => {
    renderPage();
    const href = screen
      .getByTestId(
        "demo-proof-walkthrough-step-sensor-data-operator-mode-link",
      )
      .getAttribute("href");
    expect(href).toContain("?operator=1");
  });

  it("does not link to /grows and starts at Dashboard / Command Center", () => {
    renderPage();
    const dashHref = screen
      .getByTestId("demo-proof-walkthrough-step-dashboard-link")
      .getAttribute("href");
    expect(dashHref).toBe("/");
    const links = screen.getAllByRole("link");
    for (const a of links) {
      expect(a.getAttribute("href") ?? "").not.toMatch(/^\/grows(\b|\/)/);
    }
  });

  it("renders safety summary with URL surface gate copy", () => {
    renderPage();
    const safety = screen.getByTestId("demo-proof-walkthrough-safety-summary")
      .textContent ?? "";
    expect(safety).toMatch(/URL surface gate/i);
    expect(safety).toMatch(/no device control or automation/i);
    expect(safety).toMatch(/growers approve/i);
  });

  it("renders 'What this proves' and 'What this does not prove' sections", () => {
    renderPage();
    expect(
      screen.getByTestId("demo-proof-walkthrough-what-this-proves"),
    ).toBeTruthy();
    expect(
      screen.getByTestId(
        "demo-proof-walkthrough-what-this-does-not-prove",
      ),
    ).toBeTruthy();
  });
});
