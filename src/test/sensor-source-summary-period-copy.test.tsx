import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import SensorSourceSummaryWidget from "@/components/SensorSourceSummaryWidget";

describe("SensorSourceSummaryWidget period copy (#2129)", () => {
  it("names the window as a period, not a target band", () => {
    render(
      <MemoryRouter>
        <SensorSourceSummaryWidget
          readings={[
            { source: "manual", captured_at: "2026-10-15T12:00:00Z" },
            { source: "manual", captured_at: "2026-10-15T11:00:00Z" },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("2 readings in this period")).toBeInTheDocument();
    expect(screen.queryByText(/in range/)).not.toBeInTheDocument();
  });
});
