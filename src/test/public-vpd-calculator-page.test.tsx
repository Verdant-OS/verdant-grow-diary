import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
  vi.restoreAllMocks();
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

  it("previews the Pro Blueprint stage targets once a stage is selected", async () => {
    const user = userEvent.setup();
    renderPage();

    // No stage picked → no Blueprint teaser (avoids the 'set a stage' prompt).
    expect(screen.queryByTestId("public-vpd-blueprint-teaser")).toBeNull();

    await user.selectOptions(screen.getByLabelText("Plant stage"), "veg");
    expect(screen.getByTestId("public-vpd-blueprint-teaser")).toBeInTheDocument();
    // Real per-stage SOP bands (the same BlueprintTeaser shipped in-app).
    expect(screen.getByTestId("pro-blueprint-teaser-row-tempC").textContent).toMatch(/°C/);

    await user.click(screen.getByRole("link", { name: "See Craft & the Pro Blueprint" }));
    expect(mocks.track).toHaveBeenCalledWith("vpd_calculator_pricing_clicked", {
      item: "blueprint_teaser",
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

  it("converts both temperature fields exactly and does not drift over repeated toggles", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Air temperature"), "78");
    await user.type(screen.getByLabelText("Measured leaf temperature"), "73.4");
    const unit = screen.getByLabelText("Temperature unit");

    await user.selectOptions(unit, "C");
    expect(screen.getByLabelText("Air temperature")).toHaveValue(25.6);
    expect(screen.getByLabelText("Measured leaf temperature")).toHaveValue(23);

    await user.selectOptions(unit, "F");
    expect(screen.getByLabelText("Air temperature")).toHaveValue(78);
    expect(screen.getByLabelText("Measured leaf temperature")).toHaveValue(73.4);

    for (let index = 0; index < 20; index += 1) {
      await user.selectOptions(unit, index % 2 === 0 ? "C" : "F");
    }
    expect(unit).toHaveValue("F");
    expect(screen.getByLabelText("Air temperature")).toHaveValue(78);
    expect(screen.getByLabelText("Measured leaf temperature")).toHaveValue(73.4);
  });

  it("keeps blank temperatures blank and clears canonical field state on reset", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Air temperature"), "78");
    await user.selectOptions(screen.getByLabelText("Temperature unit"), "C");
    expect(screen.getByLabelText("Measured leaf temperature")).toHaveValue(null);

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByLabelText("Temperature unit")).toHaveValue("F");
    expect(screen.getByLabelText("Air temperature")).toHaveValue(null);
    expect(screen.getByLabelText("Measured leaf temperature")).toHaveValue(null);
  });

  it("invalidates the result and share state when the unit changes", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderPage();

    await user.type(screen.getByLabelText("Air temperature"), "78");
    await user.type(screen.getByLabelText(/^Relative humidity/), "60");
    await user.click(screen.getByRole("button", { name: /Calculate VPD/ }));
    const initialResult = screen.getByTestId("public-vpd-calculator-result").textContent;
    await user.click(screen.getByRole("button", { name: /Share calculator/ }));
    expect(await screen.findByText(/link copied/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Temperature unit"), { target: { value: "C" } });
    expect(screen.queryByTestId("public-vpd-calculator-result")).toBeNull();
    expect(screen.queryByText(/link copied/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: /Calculate VPD/ }));
    expect(screen.getByTestId("public-vpd-calculator-result").textContent).toBe(initialResult);
    expect(screen.queryByText(/link copied/i)).toBeNull();
  });

  it("keeps a converted out-of-range air temperature invalid", async () => {
    const user = userEvent.setup();
    renderPage();

    fireEvent.change(screen.getByLabelText("Air temperature"), { target: { value: "141" } });
    await user.type(screen.getByLabelText(/^Relative humidity/), "60");
    await user.selectOptions(screen.getByLabelText("Temperature unit"), "C");
    expect(screen.getByLabelText("Air temperature")).toHaveValue(60.6);

    const form = screen.getByRole("button", { name: /Calculate VPD/ }).closest("form");
    expect(form).toBeTruthy();
    fireEvent.submit(form!);
    expect(screen.getByTestId("public-vpd-calculator-result")).toHaveTextContent(
      "Temperature outside supported range",
    );
    expect(screen.queryByRole("link", { name: "Start a free grow memory" })).toBeNull();
  });
});
