import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/pricingAnalytics", () => ({
  trackPricingEvent: (...args: unknown[]) => mocks.track(...args),
}));

import { buildPublicVpdShareData } from "@/lib/publicVpdCalculatorRules";
import PublicVpdCalculator from "@/pages/PublicVpdCalculator";

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const originalShare = Object.getOwnPropertyDescriptor(navigator, "share");

function renderPage() {
  return render(
    <MemoryRouter>
      <PublicVpdCalculator />
    </MemoryRouter>,
  );
}

beforeEach(() => mocks.track.mockReset());

afterEach(() => {
  document
    .querySelectorAll('[data-page-ldjson="public-vpd-calculator-faq"]')
    .forEach((node) => node.remove());
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else delete (navigator as Navigator & { clipboard?: Clipboard }).clipboard;
  if (originalShare) Object.defineProperty(navigator, "share", originalShare);
  else delete (navigator as Navigator & { share?: Navigator["share"] }).share;
});

describe("public VPD calculator page", () => {
  it("derives a manual air VPD and exposes attributed next steps", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getAllByText(/Nothing is uploaded or saved/)).toHaveLength(2);
    expect(screen.getByText(/Air VPD only—not leaf VPD/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Air temperature"), "77");
    await user.type(screen.getByLabelText("Relative humidity"), "65");
    await user.selectOptions(screen.getByLabelText("Plant stage"), "veg");
    await user.click(screen.getByRole("button", { name: /Calculate air VPD/ }));

    expect(screen.getByTestId("public-vpd-calculator-result")).toHaveTextContent("1.11 kPa");
    expect(screen.getByTestId("public-vpd-classification")).toHaveTextContent("In Veg VPD range");
    expect(screen.getByRole("link", { name: "Start a free grow memory" })).toHaveAttribute(
      "href",
      "/auth?mode=signup&utm_source=vpd_calculator&utm_medium=owned&utm_campaign=vpd_calculator",
    );
    expect(screen.getByRole("link", { name: "Compare Free and Pro" })).toHaveAttribute(
      "href",
      "/pricing?utm_source=vpd_calculator&utm_medium=owned&utm_campaign=vpd_calculator",
    );
    expect(mocks.track).toHaveBeenCalledWith("vpd_calculator_completed", {
      item: "in_target",
      source: "veg",
    });
  });

  it("fails closed for missing inputs and does not expose conversion actions", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Calculate air VPD/ }));

    expect(screen.getByTestId("public-vpd-calculator-result")).toHaveTextContent(
      "Temperature and humidity required",
    );
    expect(screen.queryByRole("link", { name: "Start a free grow memory" })).toBeNull();
    expect(mocks.track).toHaveBeenCalledWith("vpd_calculator_completed", {
      item: "needs_inputs",
      source: "unknown",
    });
  });

  it("shares only a blank fixed URL and resets deterministically", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderPage();

    await user.type(screen.getByLabelText("Air temperature"), "77");
    await user.type(screen.getByLabelText("Relative humidity"), "65");
    await user.selectOptions(screen.getByLabelText("Plant stage"), "veg");
    await user.click(screen.getByRole("button", { name: /Calculate air VPD/ }));
    await user.click(screen.getByRole("button", { name: /Share calculator/ }));

    expect(writeText).toHaveBeenCalledWith(buildPublicVpdShareData().url);
    expect(
      await screen.findByText(/temperature, humidity, and stage were not included/),
    ).toBeInTheDocument();
    expect(JSON.stringify(mocks.track.mock.calls)).not.toMatch(/77|65|email|user_?id|token/i);

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.queryByTestId("public-vpd-calculator-result")).toBeNull();
    expect(screen.getByLabelText("Air temperature")).toHaveValue(null);
    expect(mocks.track).toHaveBeenCalledWith("vpd_calculator_reset");
  });
});
