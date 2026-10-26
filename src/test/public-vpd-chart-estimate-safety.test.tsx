import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));

import PublicVpdChart from "@/pages/PublicVpdChart";

function renderChart() {
  render(
    <MemoryRouter>
      <PublicVpdChart />
    </MemoryRouter>,
  );
  return screen.getByRole("region", { name: "Calculated VPD" });
}

function expectUnverifiedEstimate(result: HTMLElement) {
  expect(result).toHaveTextContent(/illustrative estimate/i);
  expect(result).toHaveTextContent(/assumed leaf.temperature offset/i);
  expect(result).toHaveTextContent(/no verified target status/i);
  expect(result).not.toHaveTextContent(/within your|below your|above your|mold risk|plant stress/i);
  expect(result).toHaveClass("bg-white");
}

describe("public VPD chart measurement safety", () => {
  it("keeps the default calculation as an estimate and links to the evidence-aware calculator", () => {
    const result = renderChart();
    expect(result).toHaveTextContent("1.06 kPa");
    expectUnverifiedEstimate(result);
    expect(
      within(result).getByRole("link", { name: /verify measurements for a stage comparison/i }),
    ).toHaveAttribute("href", "/tools/vpd-calculator");
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it.each(["0", "100"])(
    "cannot unlock target status with humidity %s or a different stage",
    (humidity) => {
      const result = renderChart();
      fireEvent.change(screen.getByLabelText(/Relative humidity/), { target: { value: humidity } });
      fireEvent.blur(screen.getByLabelText(/Relative humidity/));
      fireEvent.change(screen.getByLabelText(/Growth stage target/), {
        target: { value: "late_flower" },
      });
      expectUnverifiedEstimate(result);
    },
  );
});
