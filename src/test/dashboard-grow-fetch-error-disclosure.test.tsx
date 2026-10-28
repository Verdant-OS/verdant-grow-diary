/**
 * A failed tent or plant read must not be described as "add a tent".
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DashboardDataSourceDisclosure from "@/components/DashboardDataSourceDisclosure";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "owner-1" } }),
}));

describe("Dashboard disclosure fetch-error", () => {
  it("shows an unavailable read instead of add-a-tent when any section failed", () => {
    render(
      <DashboardDataSourceDisclosure
        hasAnyData={false}
        hasGrow
        metas={[
          { isDemoData: false, dataSource: "unavailable", sourceReason: "no-rows" },
          { isDemoData: false, dataSource: "unavailable", sourceReason: "fetch-error" },
        ]}
      />,
    );
    expect(screen.queryByText(/Add a tent/i)).toBeNull();
    expect(screen.queryByText(/No real grow/i)).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(/unavailable/i);
  });
});
