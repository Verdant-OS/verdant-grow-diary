/**
 * CustomerModeCannabisCareFaq — render + safety tests.
 *
 * Covers:
 *   - Page renders at /customer/:shareId/cannabis-care.
 *   - The 5 cannabis plant care FAQ questions render in an accordion.
 *   - Expanding an answer reveals the answer text.
 *   - The shareId path param is NEVER echoed into the visible DOM.
 *   - The back link points to the main customer guide for the same shareId.
 *   - No forbidden device-control/autopilot language appears.
 *   - Operator Mode Quick Log / Fast Add trigger is NOT rendered.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CustomerModeCannabisCareFaq from "@/pages/CustomerModeCannabisCareFaq";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/customer/:shareId/cannabis-care"
          element={<CustomerModeCannabisCareFaq />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

const FORBIDDEN_DEVICE_PHRASES = [
  "autopilot",
  "fully automated grow control",
  "AI controls your equipment",
  "automatic device control",
  "autonomous device control",
  "hands-free grow control",
  "set-and-forget automation",
  "controls your lights",
  "controls your fans",
  "controls irrigation",
  "controls humidifiers",
  "controls your equipment",
];

describe("CustomerModeCannabisCareFaq", () => {
  it("renders the Customer Mode cannabis care FAQ page shell", () => {
    renderAt("/customer/share-abc/cannabis-care");
    expect(
      screen.getByTestId("customer-mode-cannabis-care-faq-page"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("customer-mode-shell-disclaimer"),
    ).toHaveTextContent(/share-token publishing backend not yet available/i);
  });

  it("renders all 5 cannabis plant care FAQ questions", () => {
    renderAt("/customer/share-abc/cannabis-care");
    const questions = screen.getAllByTestId("customer-mode-cannabis-care-faq-item");
    expect(questions.length).toBe(5);
    expect(
      screen.getByText("How often should I water a cannabis plant?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("What nutrients should I give my cannabis plant?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Why are my cannabis leaves turning yellow?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "What temperature and humidity should a cannabis grow room have?",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("How do I know when to harvest cannabis?"),
    ).toBeInTheDocument();
  });

  it("accordion expands to reveal the answer text", () => {
    renderAt("/customer/share-abc/cannabis-care");
    const question = screen.getByText("How do I know when to harvest cannabis?");
    expect(
      screen.queryByText(/milky trichomes are peak/i),
    ).not.toBeInTheDocument();
    fireEvent.click(question);
    expect(
      screen.getByText(/milky trichomes are peak/i),
    ).toBeInTheDocument();
  });

  it("back link points to the main customer guide for the same shareId", () => {
    renderAt("/customer/share-abc/cannabis-care");
    const backLink = screen.getByTestId("customer-mode-cannabis-care-link-anchor");
    expect(backLink).toHaveAttribute("href", "/customer/share-abc");
  });

  it("never echoes the :shareId into the visible DOM", () => {
    const shareId = "share-abc-12345-PRIVATE";
    renderAt(`/customer/${shareId}/cannabis-care`);
    const page = screen.getByTestId("customer-mode-cannabis-care-faq-page");
    expect(page.textContent ?? "").not.toContain(shareId);
  });

  it("does NOT render the Operator Mode Quick Log / Fast Add trigger", () => {
    renderAt("/customer/share-abc/cannabis-care");
    expect(screen.queryByTestId("global-fast-add")).toBeNull();
    expect(screen.queryByTestId("global-fast-add-trigger")).toBeNull();
  });

  it("contains no forbidden device-control or autopilot positioning", () => {
    renderAt("/customer/share-abc/cannabis-care");
    const description =
      document.head.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
    const haystack =
      `${document.body.textContent ?? ""}\n${document.title}\n${description}`.toLowerCase();
    for (const phrase of FORBIDDEN_DEVICE_PHRASES) {
      expect(
        haystack.includes(phrase.toLowerCase()),
        `contains forbidden phrase: ${phrase}`,
      ).toBe(false);
    }
  });
});
