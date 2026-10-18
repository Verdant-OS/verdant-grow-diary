import { render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const reportLovableErrorMock = vi.fn<(...args: unknown[]) => void>();
const reportErrorWhenReadyMock = vi.fn<(...args: unknown[]) => Promise<void>>(() =>
  Promise.resolve(),
);

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    HeadContent: () => null,
    Scripts: () => null,
    useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
      select({
        location: { pathname: "/plants/1", searchStr: "", hash: "" },
        resolvedLocation: { pathname: "/plants/1", searchStr: "", hash: "" },
      }),
  };
});

vi.mock("@/lib/lovable-error-reporting", () => ({
  reportLovableError: (...args: unknown[]) => reportLovableErrorMock(...args),
}));

vi.mock("@/lib/errorReporter", () => ({
  initErrorReporter: () => Promise.resolve(),
  reportErrorWhenReady: (...args: unknown[]) => reportErrorWhenReadyMock(...args),
}));

import { Route as RootRoute } from "@/routes/__root";

afterEach(() => {
  reportLovableErrorMock.mockClear();
  reportErrorWhenReadyMock.mockClear();
});

describe("RootErrorComponent safe error handling", () => {
  const ErrorComp = RootRoute.options.errorComponent as React.ComponentType<{
    error: unknown;
  }>;

  it("renders the fallback and reports without throwing when error is Object.create(null)", () => {
    const nullProtoError = Object.create(null);
    nullProtoError.code = "NULL_PROTO";

    expect(() => {
      render(createElement(ErrorComp, { error: nullProtoError }));
    }).not.toThrow();

    expect(reportLovableErrorMock).toHaveBeenCalledTimes(1);
    const reportedLovable = reportLovableErrorMock.mock.calls[0]?.[0];
    expect(reportedLovable).toBeInstanceOf(Error);

    expect(reportErrorWhenReadyMock).toHaveBeenCalledTimes(1);
    const [reportedSentry, context] = reportErrorWhenReadyMock.mock.calls[0] ?? [];
    expect(reportedSentry).toBeInstanceOf(Error);
    expect(context).toEqual({
      source: "route_error_component",
      route: "/plants/1",
      handled: false,
    });
  });

  it("passes a thrown Response through unchanged so reporters keep its status and URL", () => {
    const response = new Response(null, { status: 503 });
    Object.defineProperty(response, "url", { value: "https://verdantgrowdiary.com/api/plants" });
    render(createElement(ErrorComp, { error: response }));

    expect(reportLovableErrorMock).toHaveBeenCalledTimes(1);
    const reportedLovable = reportLovableErrorMock.mock.calls[0]?.[0];
    expect(reportedLovable).toBe(response);
    expect((reportedLovable as Response).status).toBe(503);
    expect((reportedLovable as Response).url).toBe("https://verdantgrowdiary.com/api/plants");

    expect(reportErrorWhenReadyMock).toHaveBeenCalledWith(response, {
      source: "route_error_component",
      route: "/plants/1",
      handled: false,
    });
  });

  it("passes an Error instance through unchanged", () => {
    const err = new Error("boom");
    render(createElement(ErrorComp, { error: err }));

    expect(reportLovableErrorMock).toHaveBeenCalledWith(err);
    expect(reportErrorWhenReadyMock).toHaveBeenCalledWith(err, {
      source: "route_error_component",
      route: "/plants/1",
      handled: false,
    });
  });
});
