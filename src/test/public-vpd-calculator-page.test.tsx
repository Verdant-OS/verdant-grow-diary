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
  it("shows a manual air estimate without claiming the stage target", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getAllByText(/Nothing is uploaded or saved/)).toHaveLength(2);
    expect(
      screen.getByText(/Air estimate first · verified leaf VPD for target status/),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Air temperature"), "77");
    await user.type(screen.getByLabelText("Relative humidity (current room reading)"), "65");
    await user.selectOptions(screen.getByLabelText("Plant stage"), "veg");
    await user.click(screen.getByRole("button", { name: /Calculate VPD/ }));

    expect(screen.getByTestId("public-vpd-calculator-result")).toHaveTextContent("1.11 kPa");
    expect(screen.getByTestId("public-vpd-classification")).toHaveTextContent(
      "Air VPD estimate — no target claim",
    );
    expect(screen.getByTestId("public-vpd-confidence")).toHaveTextContent("unverified");
    expect(screen.getByRole("link", { name: "Start a free grow memory" })).toHaveAttribute(
      "href",
      "/auth?mode=signup&utm_source=vpd_calculator&utm_medium=owned&utm_campaign=vpd_calculator",
    );
    expect(screen.getByRole("link", { name: "Compare Free and Pro" })).toHaveAttribute(
      "href",
      "/pricing?utm_source=vpd_calculator&utm_medium=owned&utm_campaign=vpd_calculator",
    );
    expect(mocks.track).toHaveBeenCalledWith("vpd_calculator_completed", {
      item: "air_estimate",
      source: "veg",
    });
  });

  it("makes normal flower-room RH explicit while keeping evidence optional", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(
      screen.getByText(/Normal flower-room readings around 40–55% are valid here/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Leave blank for an air estimate/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Air temperature"), "77");
    await user.type(screen.getByLabelText("Relative humidity (current room reading)"), "45");
    await user.selectOptions(screen.getByLabelText("Plant stage"), "flower");
    await user.click(screen.getByRole("button", { name: /Calculate VPD/ }));

    expect(screen.getByTestId("public-vpd-calculator-result")).toHaveTextContent(
      "Air VPD estimate — no target claim",
    );
    expect(screen.getByTestId("public-vpd-confidence")).toHaveTextContent("unverified");
  });

  it("unlocks target status after the full VPD evidence checklist", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Air temperature"), "77");
    await user.type(screen.getByLabelText("Relative humidity (current room reading)"), "60");
    await user.type(screen.getByLabelText("Measured leaf temperature"), "77");
    await user.selectOptions(screen.getByLabelText("Temperature/RH sensor placement"), "canopy");
    await user.type(screen.getByLabelText("Temperature reference"), "Traceable reference");
    await user.type(screen.getByLabelText("Temperature verified date"), "2026-06-01");
    await user.type(screen.getByLabelText("Calibration RH reference (optional)"), "75");
    await user.type(screen.getByLabelText("Humidity verified date"), "2026-06-01");
    await user.click(
      screen.getByLabelText(/Temperature was checked against that reference at normal room/i),
    );
    await user.click(
      screen.getByLabelText(/Leaf temperature was measured now in the same canopy/i),
    );
    await user.selectOptions(screen.getByLabelText("Plant stage"), "flower");
    await user.click(screen.getByRole("button", { name: /Calculate VPD/ }));

    expect(screen.getByTestId("public-vpd-confidence")).toHaveTextContent("verified");
    expect(screen.getByTestId("public-vpd-classification")).toHaveTextContent(
      "In Flower VPD range",
    );
    expect(mocks.track).toHaveBeenCalledWith("vpd_calculator_completed", {
      item: "in_target",
      source: "flower",
    });
  });

  it("fails closed for missing inputs and does not expose conversion actions", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Calculate VPD/ }));

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
    await user.type(screen.getByLabelText("Relative humidity (current room reading)"), "65");
    await user.selectOptions(screen.getByLabelText("Plant stage"), "veg");
    await user.click(screen.getByRole("button", { name: /Calculate VPD/ }));
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
