import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResourceHealthPanel } from "@/components/ResourceHealthPanel";
import { APP_VERSION } from "@/generated/buildInfo";

function successfulResourceResponse(path: string): Response {
  const body =
    path === "/version.json"
      ? JSON.stringify({ version: APP_VERSION, buildTime: "2026-07-30T00:00:00.000Z" })
      : path === "/sitemap.xml"
        ? "<urlset />"
        : path === "/site.webmanifest"
          ? "{}"
          : "ok";
  return {
    ok: true,
    status: 200,
    text: async () => body,
  } as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ResourceHealthPanel", () => {
  it("fails open to an Off auto-scan interval when browser storage is unavailable", async () => {
    const getItem = vi.fn(() => {
      throw new Error("storage blocked");
    });
    const setItem = vi.fn(() => {
      throw new Error("storage blocked");
    });
    const blockedStorage = { getItem, setItem } as Pick<Storage, "getItem" | "setItem">;
    vi.stubGlobal("localStorage", blockedStorage);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      successfulResourceResponse(String(input)),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ResourceHealthPanel />);

    expect(screen.getByRole("combobox", { name: "Auto-scan interval" })).toHaveTextContent("Off");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    await waitFor(() => expect(screen.getByText("5 / 5 passing")).toBeInTheDocument());

    expect(getItem).toHaveBeenCalled();
    expect(setItem).toHaveBeenCalledWith("verdant.diagnostics.healthCheck.intervalMs", "0");
    expect(screen.queryByText("Auto", { exact: true })).not.toBeInTheDocument();
  });
});
