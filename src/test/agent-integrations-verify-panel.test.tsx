/**
 * Agent Integrations — Verify-tool-access panel rendering.
 *
 * BrowserConnectPanel owns production OAuth verification. The optional
 * local harness panel is rendered only when a usable adapter is injected
 * by a test or development host.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AgentIntegrations from "@/pages/AgentIntegrations";
import type { HarnessAdapter } from "@/lib/mcp/verifyMcpToolAccess";

function renderPage(harness?: HarnessAdapter) {
  return render(
    <MemoryRouter>
      <AgentIntegrations {...(harness ? { verifyHarness: harness } : {})} />
    </MemoryRouter>,
  );
}

describe("AgentIntegrations verify panel", () => {
  it("does not render the optional harness panel with the production default adapter", () => {
    renderPage();
    expect(screen.getByTestId("browser-connect-panel")).toBeTruthy();
    expect(screen.queryByTestId("verify-tool-access")).toBeNull();
    expect(screen.queryByText(/Unavailable in this build/i)).toBeNull();
  });

  it("keeps the interactive verify flow when a usable harness is injected", async () => {
    const adapter: HarnessAdapter = {
      available: true,
      probe: async () => ({ ok: true, growCount: 3 }),
    };
    renderPage(adapter);
    const panel = screen.getByTestId("verify-tool-access-result");
    expect(panel.getAttribute("data-status")).toBe("not_checked");
    fireEvent.click(screen.getByTestId("verify-tool-access-button"));
    await waitFor(() => expect(panel.getAttribute("data-status")).toBe("authorized"));
    expect(screen.getByTestId("verify-grow-count").textContent).toContain("3 grow(s)");
  });

  it("treats an available adapter without a probe as unusable", () => {
    renderPage({ available: true });
    expect(screen.queryByTestId("verify-tool-access-button")).toBeNull();
    expect(screen.queryByTestId("verify-tool-access-result")).toBeNull();
    expect(screen.queryByText(/Unavailable in this build/i)).toBeNull();
  });
});
