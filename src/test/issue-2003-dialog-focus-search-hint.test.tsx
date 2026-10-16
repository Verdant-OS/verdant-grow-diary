/**
 * #2003 — Escape returns focus to the opener, a long no-match query wraps,
 * and the shortcut hint matches the platform.
 */
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const globalSearchMock = vi.hoisted(() => ({
  results: [] as unknown[],
  isLoading: false,
  isError: false,
  retry: vi.fn(),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    loading: false,
    user: { id: "user-1" },
    session: null,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/hooks/useGlobalSearch", () => ({
  useGlobalSearch: () => globalSearchMock,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
    from: () => ({ insert: vi.fn(), select: vi.fn(), update: vi.fn() }),
  },
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }] }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "Grow 1" }] }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

import GlobalSearchDialog from "@/components/GlobalSearchDialog";
import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import CultivarsIndex from "@/pages/CultivarsIndex";
import { clearGlobalSearchPrivateState } from "@/lib/globalSearchSession";

function setPlatform(platform: string) {
  Object.defineProperty(window.navigator, "platform", {
    value: platform,
    configurable: true,
  });
}

function SearchHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid="search-opener" onClick={() => setOpen(true)}>
        Open search
      </button>
      <GlobalSearchDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function QuickLogHarness() {
  const [open, setOpen] = useState(false);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={client}>
      <button type="button" data-testid="quick-log-opener" onClick={() => setOpen(true)}>
        Quick Log
      </button>
      <QuickLogV2Sheet open={open} onOpenChange={setOpen} defaultTargetKey="plant:plant-1" />
    </QueryClientProvider>
  );
}

describe("issue 2003 — search dialog focus, wrap, and shortcut", () => {
  beforeEach(() => {
    clearGlobalSearchPrivateState();
    globalSearchMock.results = [];
    globalSearchMock.isLoading = false;
    globalSearchMock.isError = false;
    setPlatform("Linux x86_64");
  });

  afterEach(() => {
    clearGlobalSearchPrivateState();
  });

  it("returns focus to the control that opened search after Escape", async () => {
    render(
      <MemoryRouter>
        <SearchHarness />
      </MemoryRouter>,
    );
    const opener = screen.getByTestId("search-opener");
    opener.focus();
    fireEvent.click(opener);
    await screen.findByTestId("global-search-input");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(document.activeElement).toBe(opener);
    });
  });

  it("returns focus to the control that opened Quick Log after Escape", async () => {
    render(<QuickLogHarness />);
    const opener = screen.getByTestId("quick-log-opener");
    opener.focus();
    fireEvent.click(opener);
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(document.activeElement).toBe(opener);
    });
  });

  it("wraps a long no-match query instead of overflowing", async () => {
    render(
      <MemoryRouter>
        <GlobalSearchDialog open onOpenChange={() => {}} />
      </MemoryRouter>,
    );
    const input = await screen.findByTestId("global-search-input");
    fireEvent.change(input, { target: { value: "x".repeat(300) } });
    const heading = await screen.findByText(/No matches for/i);
    expect(heading.className).toMatch(/break-words/);
    expect(heading.className).toMatch(/overflow-wrap:\s*anywhere|\[overflow-wrap:anywhere\]/);
  });

  it("shows Ctrl K on Linux and ⌘K on Apple platforms", async () => {
    setPlatform("Linux x86_64");
    const linux = render(
      <MemoryRouter>
        <CultivarsIndex />
      </MemoryRouter>,
    );
    const linuxButton = screen.getByTestId("cultivars-index-open-search");
    await waitFor(() => {
      expect(linuxButton).toHaveTextContent("Ctrl K");
    });
    expect(linuxButton).not.toHaveTextContent("⌘K");
    linux.unmount();

    setPlatform("MacIntel");
    render(
      <MemoryRouter>
        <CultivarsIndex />
      </MemoryRouter>,
    );
    const macButton = screen.getByTestId("cultivars-index-open-search");
    await waitFor(() => {
      expect(macButton).toHaveTextContent("⌘K");
    });
  });
});
