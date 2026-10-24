import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "@/lib/react-router-compat";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));

import PublicVpdChart from "@/pages/PublicVpdChart";
import { PUBLIC_VPD_CALCULATOR_CROSS_LINK_PATH } from "@/lib/publicVpdChartRules";

function renderPage() {
  return render(
    <MemoryRouter>
      <PublicVpdChart />
    </MemoryRouter>,
  );
}

async function commitNumber(
  user: ReturnType<typeof userEvent.setup>,
  input: HTMLElement,
  digits: string,
) {
  await user.clear(input);
  await user.type(input, `${digits}{Enter}`);
}

describe("public VPD chart page", () => {
  it("keeps multi-digit temperatures until blur or Enter, then matches the pinned cases", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByText("1.06 kPa")).toBeInTheDocument();

    const air = () => screen.getByLabelText(/Air temperature/);
    const humidity = () => screen.getByLabelText(/Relative humidity/);
    const offset = () => screen.getByLabelText(/Leaf temperature offset/);

    await user.clear(air());
    await user.type(air(), "8");
    expect(air()).toHaveValue(8);
    await user.type(air(), "5{Enter}");
    expect(air()).toHaveValue(85);

    await user.click(screen.getByRole("button", { name: "°C" }));
    await commitNumber(user, air(), "25");
    expect(air()).toHaveValue(25);
    expect(screen.getByText("1.06 kPa")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "°F" }));
    await commitNumber(user, air(), "80");
    await commitNumber(user, humidity(), "55");
    await commitNumber(user, offset(), "-3");
    expect(air()).toHaveValue(80);
    expect(screen.getByText("1.24 kPa")).toBeInTheDocument();

    await commitNumber(user, air(), "72");
    await commitNumber(user, humidity(), "70");
    await commitNumber(user, offset(), "-2");
    expect(screen.getByText("0.63 kPa")).toBeInTheDocument();

    await user.clear(air());
    await user.tab();
    expect(air()).toHaveValue(72);
    expect(screen.getByText("0.63 kPa")).toBeInTheDocument();
  });

  it("clamps an out-of-range value on commit and commits on blur", async () => {
    const user = userEvent.setup();
    renderPage();
    const air = () => screen.getByLabelText(/Air temperature/);

    await user.clear(air());
    await user.type(air(), "120");
    await user.tab();
    expect(air()).toHaveValue(100);

    await user.clear(air());
    await user.type(air(), "90");
    expect(air()).toHaveValue(90);
    await user.tab();
    expect(air()).toHaveValue(90);
    expect(screen.queryByText("1.06 kPa")).not.toBeInTheDocument();
  });

  it("commits an open Fahrenheit draft when °C is clicked, then converts it", async () => {
    const user = userEvent.setup();
    renderPage();
    const air = () => screen.getByLabelText(/Air temperature/);

    await user.clear(air());
    await user.type(air(), "85");
    expect(air()).toHaveValue(85);

    await user.click(screen.getByRole("button", { name: "°C" }));
    expect(air()).toHaveValue(29.4);
  });

  it("keeps Celsius values unchanged when tabbing through every field without typing", async () => {
    const user = userEvent.setup();
    renderPage();
    const air = () => screen.getByLabelText(/Air temperature/);
    const humidity = () => screen.getByLabelText(/Relative humidity/);
    const offset = () => screen.getByLabelText(/Leaf temperature offset/);
    const stage = () => screen.getByLabelText(/Growth stage target/);

    await user.click(screen.getByRole("button", { name: "°C" }));
    expect(air()).toHaveValue(25);
    expect(humidity()).toHaveValue(60);
    expect(offset()).toHaveValue(-1.1);
    expect(stage()).toHaveValue("veg");

    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();

    expect(air()).toHaveValue(25);
    expect(humidity()).toHaveValue(60);
    expect(offset()).toHaveValue(-1.1);
    expect(stage()).toHaveValue("veg");
    expect(screen.getByText("1.06 kPa")).toBeInTheDocument();
  });

  it("restores the last valid humidity and leaf offset when the field is emptied", async () => {
    const user = userEvent.setup();
    renderPage();
    const humidity = () => screen.getByLabelText(/Relative humidity/);
    const offset = () => screen.getByLabelText(/Leaf temperature offset/);

    await user.clear(humidity());
    await user.tab();
    expect(humidity()).toHaveValue(60);
    await user.clear(humidity());
    await user.type(humidity(), "-");
    await user.tab();
    expect(humidity()).toHaveValue(60);
    await user.clear(humidity());
    await user.type(humidity(), ".");
    await user.tab();
    expect(humidity()).toHaveValue(60);

    await user.clear(offset());
    await user.tab();
    expect(offset()).toHaveValue(-2);
    await user.clear(offset());
    await user.type(offset(), "-");
    await user.tab();
    expect(offset()).toHaveValue(-2);
    await user.clear(offset());
    await user.type(offset(), ".");
    await user.tab();
    expect(offset()).toHaveValue(-2);
    expect(screen.getByText("1.06 kPa")).toBeInTheDocument();
  });

  it("links to the stage-aware VPD calculator", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Stage-aware VPD calculator" })).toHaveAttribute(
      "href",
      PUBLIC_VPD_CALCULATOR_CROSS_LINK_PATH,
    );
  });
});
