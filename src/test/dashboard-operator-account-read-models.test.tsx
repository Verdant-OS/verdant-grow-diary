import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasRole: vi.fn(),
  readModels: vi.fn(),
}));

vi.mock("@/hooks/useHasRole", () => ({
  useHasRole: () => mocks.hasRole(),
}));

vi.mock("@/hooks/useOperatorAccountReadModels", () => ({
  useOperatorAccountReadModels: (options: unknown) => mocks.readModels(options),
}));

vi.mock("@/components/OperatorAccountReadModelsPanel", () => ({
  default: ({ model }: { model: { status: string } }) => (
    <div data-testid="operator-account-read-models">{model.status}</div>
  ),
}));

import DashboardOperatorAccountReadModels from "@/components/DashboardOperatorAccountReadModels";

describe("DashboardOperatorAccountReadModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readModels.mockReturnValue({ status: "no_grow" });
  });

  for (const status of ["loading", "denied", "unauthenticated", "error"] as const) {
    it(`does not mount owner read models while the operator role is ${status}`, () => {
      mocks.hasRole.mockReturnValue({
        status,
        granted: false,
        error: status === "error" ? "role check failed" : null,
      });

      render(<DashboardOperatorAccountReadModels growId="grow-1" />);

      expect(screen.queryByTestId("operator-account-read-models")).toBeNull();
      expect(mocks.readModels).not.toHaveBeenCalled();
    });
  }

  it("mounts the read-only panel for a server-verified operator and forwards grow scope", () => {
    mocks.hasRole.mockReturnValue({
      status: "granted",
      granted: true,
      error: null,
    });

    render(<DashboardOperatorAccountReadModels growId="grow-1" />);

    expect(screen.getByTestId("operator-account-read-models")).toHaveTextContent("no_grow");
    expect(mocks.readModels).toHaveBeenCalledWith({
      growId: "grow-1",
      selectedTentId: null,
    });
  });
});
