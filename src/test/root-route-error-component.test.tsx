import { QueryClient } from "@tanstack/react-query";
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GROW_HELP_TOOLKIT_PATH } from "@/lib/growHelpToolkitState";
import { Route as ProductionRootRoute } from "@/routes/__root";

const reportLovableError = vi.fn();
const reportErrorWhenReady = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/lovable-error-reporting", () => ({
  reportLovableError: (...args: unknown[]) => reportLovableError(...args),
}));

vi.mock("@/lib/errorReporter", () => ({
  initErrorReporter: vi.fn(),
  reportErrorWhenReady: (...args: unknown[]) => reportErrorWhenReady(...args),
}));

vi.mock("@/lib/error-page", () => ({
  renderErrorPage: () => '<div data-testid="branded-error">error</div>',
}));

const rootErrorComponentOption = ProductionRootRoute.options.errorComponent;
if (typeof rootErrorComponentOption !== "function") {
  throw new Error("Production root route must declare errorComponent");
}
const RootErrorComponent = rootErrorComponentOption;

function renderRootError(pathname: string, error: unknown, reset = vi.fn()) {
  const rootRoute = createRootRoute({
    component: () => null,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: [pathname] }),
    context: { queryClient: new QueryClient() },
  });
  return render(
    <RouterContextProvider router={router}>
      <RootErrorComponent error={error} reset={reset} />
    </RouterContextProvider>,
  );
}

afterEach(() => {
  reportLovableError.mockClear();
  reportErrorWhenReady.mockClear();
});

describe("root route errorComponent", () => {
  it("reports normalized Error instances for non-Error throw values", async () => {
    renderRootError("/plants/demo", "boom from loader");

    expect(reportLovableError).toHaveBeenCalledTimes(1);
    const reported = reportLovableError.mock.calls[0]?.[0];
    expect(reported).toBeInstanceOf(Error);
    expect((reported as Error).message).toBe("boom from loader");

    await waitFor(() => {
      expect(reportErrorWhenReady).toHaveBeenCalled();
    });
    const readyArgs = reportErrorWhenReady.mock.calls[0];
    expect(readyArgs?.[0]).toBeInstanceOf(Error);
    expect((readyArgs?.[0] as Error).message).toBe("boom from loader");
    expect(readyArgs?.[1]).toMatchObject({
      source: "route_error_component",
      route: "/plants/demo",
      handled: false,
    });
  });

  it("skips Lovable and Sentry reporting on the grow-help toolkit route", async () => {
    renderRootError(GROW_HELP_TOOLKIT_PATH, new Error("toolkit-only"));

    await waitFor(() => {
      expect(reportErrorWhenReady).not.toHaveBeenCalled();
    });
    expect(reportLovableError).not.toHaveBeenCalled();
  });
});
