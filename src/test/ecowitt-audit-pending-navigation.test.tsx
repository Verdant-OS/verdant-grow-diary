import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

const routerState = vi.hoisted(() => ({
  pathname: "/sensors",
  search: "operator=1",
  setSearchParams: vi.fn(),
}));

const queryState = vi.hoisted(() => ({
  data: [],
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
}));

vi.mock("@/lib/react-router-compat", () => ({
  useLocation: () => ({
    pathname: routerState.pathname,
    search: routerState.search ? `?${routerState.search}` : "",
    hash: "",
    state: null,
    key: `${routerState.pathname}?${routerState.search}`,
  }),
  useSearchParams: () => [
    new URLSearchParams(routerState.search),
    (next: unknown, options?: unknown) => routerState.setSearchParams(next, options),
  ],
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => queryState,
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-a", name: "Tent A", grow_id: "grow-a" }],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({ save: vi.fn(), saving: false }),
}));

vi.mock("@/components/EcowittIngestValidationPanel", () => ({
  EcowittIngestValidationPanel: () => null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

import EcowittIngestAudit from "@/pages/EcowittIngestAudit";

describe("EcowittIngestAudit pending-route URL sync", () => {
  beforeEach(() => {
    routerState.pathname = "/sensors";
    routerState.search = "operator=1";
    routerState.setSearchParams.mockClear();
    queryState.refetch.mockClear();
  });

  it("does not rewrite the committed Sensors URL while the audit target is pending", () => {
    render(<EcowittIngestAudit />);

    expect(routerState.setSearchParams).not.toHaveBeenCalled();
  });

  it("syncs the default tent after the audit pathname commits", async () => {
    routerState.pathname = "/sensors/ecowitt-audit";
    render(<EcowittIngestAudit />);

    await waitFor(() => expect(routerState.setSearchParams).toHaveBeenCalledTimes(1));
    const [update, options] = routerState.setSearchParams.mock.calls[0];
    expect(update(new URLSearchParams("operator=1")).toString()).toBe("operator=1&tentId=tent-a");
    expect(options).toEqual({ replace: true });
  });

  it("issues the default-tent sync only once while its navigation is pending", async () => {
    routerState.pathname = "/sensors/ecowitt-audit";
    const view = render(<EcowittIngestAudit />);
    await waitFor(() => expect(routerState.setSearchParams).toHaveBeenCalledTimes(1));

    view.rerender(<EcowittIngestAudit />);

    expect(routerState.setSearchParams).toHaveBeenCalledTimes(1);
  });
});
