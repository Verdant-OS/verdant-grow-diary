/**
 * Agent Integrations — Verify-tool-access panel rendering.
 *
 * The production route mounts the page with no harness prop, and the
 * default browser harness is never usable (the browser has no safe way
 * to probe MCP without exposing tokens). The page must therefore render
 * a static "harness unavailable" status — not an interactive Verify
 * button whose only possible answer is "unavailable". With an injected
 * usable adapter (tests / future safe harness) the interactive flow
 * stays intact.
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
  it("renders a static unavailable status (no button) with the production default harness", () => {
    renderPage();
    expect(screen.queryByTestId("verify-tool-access-button")).toBeNull();
    expect(screen.getByTestId("verify-harness-unavailable-badge")).toBeTruthy();
    const panel = screen.getByTestId("verify-tool-access-result");
    expect(panel.getAttribute("data-status")).toBe("harness_unavailable");
    expect(screen.getByTestId("verify-label").textContent).toMatch(/harness unavailable/i);
  });

  it("keeps the interactive verify flow when a usable harness is injected", async () => {
    const adapter: HarnessAdapter = {
      available: true,
      probe: async () => ({ ok: true, growCount: 3 }),
    };
    renderPage(adapter);
    expect(screen.queryByTestId("verify-harness-unavailable-badge")).toBeNull();
    const panel = screen.getByTestId("verify-tool-access-result");
    expect(panel.getAttribute("data-status")).toBe("not_checked");
    fireEvent.click(screen.getByTestId("verify-tool-access-button"));
    await waitFor(() => expect(panel.getAttribute("data-status")).toBe("authorized"));
    expect(screen.getByTestId("verify-grow-count").textContent).toContain("3 grow(s)");
  });

  it("treats an available adapter without a probe as unusable", () => {
    renderPage({ available: true });
    expect(screen.queryByTestId("verify-tool-access-button")).toBeNull();
    expect(screen.getByTestId("verify-tool-access-result").getAttribute("data-status")).toBe(
      "harness_unavailable",
    );
  });
});
