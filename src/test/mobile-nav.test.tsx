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
  it("renders Actions in the More sheet", async () => {
    render(wrap(<MobileNav />));

    // Primary tabs still render
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Tents")).toBeInTheDocument();
    expect(screen.getByText("Plants")).toBeInTheDocument();
    expect(screen.getByText("Logs")).toBeInTheDocument();
    expect(screen.getByText("Alerts")).toBeInTheDocument();
    expect(screen.getByText("More")).toBeInTheDocument();

    // Open the More sheet
    const moreBtn = screen.getByText("More");
    await act(async () => {
      moreBtn.click();
    });

    // Actions link is present and points to /actions
    await waitFor(() => {
      const actionsLink = screen.getByText("Actions");
      expect(actionsLink).toBeInTheDocument();
      expect(actionsLink.closest("a")).toHaveAttribute("href", "/actions");
    });

    // Other More items still present
    expect(screen.getByText("Daily Grow Check")).toBeInTheDocument();
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.getByText("Sensor Data")).toBeInTheDocument();
    expect(screen.getByText("AI Grow Doctor")).toBeInTheDocument();
    expect(screen.getByText("Harvest Archive")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
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
