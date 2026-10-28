/**
 * #2126: a 500-character note with no spaces must wrap inside its Recent
 * Quick Logs card instead of overflowing the page.
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { RecentQuickLogActivityPanel } from "@/components/QuickLogHistoryPanels";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const LONG_NOTE = `QA seed${"x".repeat(493)}`;

describe("Recent Quick Logs long unbroken note (#2126)", () => {
  it("lets the note break anywhere so it wraps inside the card", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <RecentQuickLogActivityPanel
            rawEntries={[
              {
                id: "d1",
                entry_type: "note",
                entry_at: "2026-10-19T08:00:00.000Z",
                note: LONG_NOTE,
                details: { event_type: "note" },
              },
            ]}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const note = screen.getByText(LONG_NOTE);
    expect(LONG_NOTE).toHaveLength(500);
    expect(note).toHaveClass("[overflow-wrap:anywhere]");
    expect(note).toHaveClass("whitespace-pre-wrap");
  });
});
