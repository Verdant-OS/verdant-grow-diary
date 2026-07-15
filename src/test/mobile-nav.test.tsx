import { describe, it, expect } from "vitest";
import type { ReactNode } from "react";
import { render, screen, act, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MobileNav, { moreGroups, more } from "@/components/MobileNav";

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

describe("MobileNav primary tabs", () => {
  it("renders the canonical primary tabs", () => {
    render(wrap(<MobileNav />));
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Tents")).toBeInTheDocument();
    expect(screen.getByText("Plants")).toBeInTheDocument();
    expect(screen.getByText("Timeline")).toBeInTheDocument();
    expect(screen.getByText("Alerts")).toBeInTheDocument();
    expect(screen.getByText("More")).toBeInTheDocument();
    expect(screen.queryByText("Logs")).toBeNull();
  });
});

describe("MobileNav More sheet — Slice 4 grouping", () => {
  it("renders groups in order: Daily → Insight → Advanced → Account with canonical labels and routes", async () => {
    render(wrap(<MobileNav />));

    await act(async () => {
      screen.getByText("More").click();
    });

    await waitFor(() => {
      expect(screen.getByText("Quick Log")).toBeInTheDocument();
    });

    // Group order
    const groupHeadings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(groupHeadings).toEqual(["Daily", "Insight", "Advanced", "Account"]);

    // Each group contains the expected labels + route targets
    const expectations: Record<string, Array<[string, string]>> = {
      Daily: [
        ["Quick Log", "/daily-check"],
        ["Action Queue", "/actions"],
        ["Tasks", "/tasks"],
      ],
      Insight: [
        ["Sensors", "/sensors"],
        ["AI Doctor", "/doctor"],
      ],
      Advanced: [
        ["Reports", "/reports"],
        ["My Grows", "/grows"],
      ],
      Account: [["Settings", "/settings"]],
    };

    for (const [heading, items] of Object.entries(expectations)) {
      const section = screen.getByTestId(`mobile-more-group-${heading.toLowerCase()}`);
      for (const [label, href] of items) {
        const link = within(section).getByText(label).closest("a");
        expect(link).toHaveAttribute("href", href);
      }
    }
  });

  it("does not expose old labels in the More sheet", async () => {
    render(wrap(<MobileNav />));
    await act(async () => {
      screen.getByText("More").click();
    });
    await waitFor(() => expect(screen.getByText("Quick Log")).toBeInTheDocument());

    for (const banned of [
      "Logs",
      "Daily Grow Check",
      "Sensor Data",
      "AI Grow Doctor",
      "Actions",
      "Grow Learning Hub",
    ]) {
      expect(screen.queryByText(banned)).toBeNull();
    }
  });

  it("does not expose operator/internal/demo/release/proof/diagnostic routes in normal mobile nav", () => {
    const banned = ["/operator/", "/internal/", "/demo/", "/release", "/proof", "/diagnostic"];
    for (const item of more) {
      for (const prefix of banned) {
        expect(item.to.startsWith(prefix)).toBe(false);
      }
    }
    for (const banned of [
      "Release Readiness",
      "Demo Preview",
      "AI Doctor Results",
      "Diagnostics",
    ]) {
      // operator-mode link is role-gated and renders nothing here; these labels must not leak.
      const { container } = render(wrap(<MobileNav />));
      expect(container.textContent || "").not.toContain(banned);
    }
  });

  it("uses /timeline (not /logs) for Timeline", () => {
    const timelineHrefs = more.map((m) => m.to).filter((t) => t === "/logs");
    expect(timelineHrefs.length).toBe(0);
  });

  it("flat `more` export matches the grouped source of truth", () => {
    const flatFromGroups = moreGroups.flatMap((g) => g.items.map((i) => i.to));
    expect(more.map((m) => m.to)).toEqual(flatFromGroups);
  });
});

describe("MobileNav safety language", () => {
  it("does not expose automation or device-control language", () => {
    const { container } = render(wrap(<MobileNav />));
    const text = (container.textContent || "").toLowerCase();
    for (const phrase of [
      "auto-execute",
      "auto-run",
      "blind automation",
      "device control",
      "execute action",
      "run now",
      "one-click run",
    ]) {
      expect(text).not.toContain(phrase);
    }
  });
});
