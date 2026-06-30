import { describe, it, expect } from "vitest";
import type { ReactNode } from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MobileNav from "@/components/MobileNav";

function wrap(children: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("MobileNav Action Queue link", () => {
  it("renders Action Queue in the More sheet", async () => {
    render(wrap(<MobileNav />));

    // Primary tabs still render with cleaned-up labels
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Tents")).toBeInTheDocument();
    expect(screen.getByText("Plants")).toBeInTheDocument();
    expect(screen.getByText("Timeline")).toBeInTheDocument();
    expect(screen.getByText("Alerts")).toBeInTheDocument();
    expect(screen.getByText("More")).toBeInTheDocument();

    // Old labels must not appear anywhere in mobile nav
    expect(screen.queryByText("Logs")).toBeNull();

    // Open the More sheet
    const moreBtn = screen.getByText("More");
    await act(async () => {
      moreBtn.click();
    });

    // Action Queue link is present and points to /actions
    await waitFor(() => {
      const actionsLink = screen.getByText("Action Queue");
      expect(actionsLink).toBeInTheDocument();
      expect(actionsLink.closest("a")).toHaveAttribute("href", "/actions");
    });

    // Canonical More labels
    expect(screen.getByText("Quick Log")).toBeInTheDocument();
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.getByText("Sensors")).toBeInTheDocument();
    expect(screen.getByText("AI Doctor")).toBeInTheDocument();
    expect(screen.getByText("Harvest Archive")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();

    // Old labels gone from More sheet
    expect(screen.queryByText("Daily Grow Check")).toBeNull();
    expect(screen.queryByText("Sensor Data")).toBeNull();
    expect(screen.queryByText("AI Grow Doctor")).toBeNull();
    expect(screen.queryByText("Actions")).toBeNull();

    // Operator-only routes do not appear in normal mobile nav
    expect(screen.queryByText("Release Readiness")).toBeNull();
    expect(screen.queryByText("AI Doctor Results")).toBeNull();
  });

  it("does not expose automation or device-control language", () => {
    const { container } = render(wrap(<MobileNav />));
    const text = container.textContent || "";

    const banned = [
      "auto-execute",
      "auto-run",
      "blind automation",
      "device control",
      "execute action",
      "run now",
      "one-click run",
    ];
    for (const phrase of banned) {
      expect(text.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
  });
});
