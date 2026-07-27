/**
 * Agent Integrations — production browser OAuth/probe composition.
 *
 * The BrowserConnectPanel is the production verification surface. A successful
 * OAuth-backed list_grows probe must not be contradicted by the optional local
 * harness UI, while a browser without OAuth remains clearly labeled.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AgentIntegrations from "@/pages/AgentIntegrations";

vi.mock("@/hooks/usePageSeo", () => ({
  usePageSeo: () => undefined,
}));

const TOKEN_STORAGE_KEY = "verdant.mcp.oauth.token.v1";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/settings/agent-integrations"]}>
      <AgentIntegrations />
    </MemoryRouter>,
  );
}

function jsonRpcResponse(result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("AgentIntegrations production browser verification", () => {
  it("does not accompany a successful browser list_grows probe with an unavailable build claim", async () => {
    window.sessionStorage.setItem(
      TOKEN_STORAGE_KEY,
      JSON.stringify({
        access_token: "TEST_ONLY_BROWSER_TOKEN",
        obtained_at: Date.now(),
        expires_in: 3_600,
      }),
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRpcResponse({ protocolVersion: "2025-06-18" }))
      .mockResolvedValueOnce(
        jsonRpcResponse({
          tools: [
            { name: "list_grows" },
            { name: "list_recent_diary_entries" },
            { name: "get_latest_sensor_snapshot" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonRpcResponse({
          structuredContent: { grows: [{ id: "grow-1" }] },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    fireEvent.click(await screen.findByTestId("browser-connect-probe"));

    await waitFor(() => {
      expect(screen.getByTestId("browser-connect-result")).toHaveAttribute(
        "data-status",
        "connected",
      );
    });
    expect(screen.getByTestId("browser-connect-result")).toHaveTextContent(
      "Live probe: authorized",
    );
    expect(screen.getByTestId("browser-connect-result")).toHaveTextContent(
      "list_grows returned 1 grow(s)",
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.queryByText(/Unavailable in this build/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("verify-tool-access")).not.toBeInTheDocument();
  });

  it("honestly labels browser OAuth as unavailable before sign-in or connection", () => {
    renderPage();

    expect(screen.getByTestId("browser-oauth-status")).toHaveTextContent("Not connected");
    expect(screen.getByTestId("browser-connect-signin-warning")).toHaveTextContent(
      "Sign in to Verdant first",
    );
    expect(screen.getByTestId("browser-connect-start")).toBeDisabled();
    expect(screen.getByTestId("browser-connect-result")).toHaveAttribute(
      "data-status",
      "idle_disconnected",
    );
    expect(screen.queryByText(/Unavailable in this build/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("verify-tool-access")).not.toBeInTheDocument();
  });
});
