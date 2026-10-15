/**
 * #2003 — Escape restores focus, a long no-match query wraps, and the
 * search hint follows the platform.
 */
import type { ReactNode } from "react";
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalStorageForTest } from "@/test/helpers/localStorageTestHelper";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "grower@example.com", email_confirmed_at: "2026-07-01" },
    loading: false,
    session: null,
    signOut: vi.fn(),
  }),
}));
vi.mock("@/hooks/useRequireAuth", () => ({
  useRequireAuth: () => ({ status: "authenticated" }),
}));
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    entitlement: { isActive: true, effectivePlanId: "pro_monthly" },
  }),
}));
vi.mock("@/hooks/useAlertsList", () => ({ useAlertsList: () => ({ alerts: [] }) }));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "Grow 1" }] }),
}));
vi.mock("@/hooks/useGlobalSearch", () => ({
  useGlobalSearch: () => ({
    results: [],
    isLoading: false,
    isError: false,
    retry: vi.fn(),
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  SidebarTrigger: () => null,
}));
vi.mock("@/components/AppSidebar", () => ({ default: () => null }));
vi.mock("@/components/MobileNav", () => ({ default: () => null }));
vi.mock("@/components/GlobalFastAddButton", () => ({ default: () => null }));
vi.mock("@/components/AuthStatusIndicator", () => ({ default: () => null }));
vi.mock("@/components/SignOutConfirmDialog", () => ({ default: () => null }));
vi.mock("@/components/VerificationPendingBanner", () => ({ default: () => null }));
vi.mock("@/components/SubscriptionPastDueBanner", () => ({
  SubscriptionPastDueBanner: () => null,
}));
vi.mock("@/components/LegalFooterLinks", () => ({ default: () => null }));
vi.mock("@/components/QuickLog", () => ({ default: () => null }));

import AppShell from "@/components/AppShell";
import GlobalSearchDialog from "@/components/GlobalSearchDialog";
import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import CultivarsIndex from "@/pages/CultivarsIndex";

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function withClient(node: ReactNode) {
  return <QueryClientProvider client={client()}>{node}</QueryClientProvider>;
}

function SearchHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid="open-search" onClick={() => setOpen(true)}>
        Search
      </button>
      <GlobalSearchDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function QuickLogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid="open-quick-log" onClick={() => setOpen(true)}>
        Quick Log
      </button>
      <QuickLogV2Sheet open={open} onOpenChange={setOpen} />
    </>
  );
}

function pressEscape() {
  const target =
    document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  fireEvent.keyDown(target, { key: "Escape", code: "Escape" });
  fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
}

function setPlatform(platform: string) {
  Object.defineProperty(navigator, "platform", { value: platform, configurable: true });
}

beforeEach(() => {
  rpcMock.mockReset();
  window.sessionStorage.clear();
  clearLocalStorageForTest();
});

afterEach(() => {
  cleanup();
  setPlatform("");
});

describe("#2003 focus restore", () => {
  it("returns focus to the search opener after Escape", async () => {
    render(
      withClient(
        <MemoryRouter>
          <SearchHarness />
        </MemoryRouter>,
      ),
    );
    const opener = screen.getByTestId("open-search");
    opener.focus();
    fireEvent.click(opener);
    expect(await screen.findByTestId("global-search-input")).toBeInTheDocument();
    pressEscape();
    await waitFor(() => {
      expect(screen.queryByTestId("global-search-input")).not.toBeInTheDocument();
    });
    expect(document.activeElement).toBe(opener);
  });

  it("returns focus to the Quick Log opener after Escape", async () => {
    render(
      withClient(
        <MemoryRouter>
          <QuickLogHarness />
        </MemoryRouter>,
      ),
    );
    const opener = screen.getByTestId("open-quick-log");
    opener.focus();
    fireEvent.click(opener);
    expect(await screen.findByTestId("qlv2-context-empty")).toBeInTheDocument();
    pressEscape();
    await waitFor(() => {
      expect(
        screen.queryByText("Capture what changed. Add detail only if it helps."),
      ).not.toBeInTheDocument();
    });
    expect(document.activeElement).toBe(opener);
  });
});

describe("#2003 no-match overflow", () => {
  it("wraps a long unbroken no-match query", async () => {
    render(
      withClient(
        <MemoryRouter>
          <SearchHarness />
        </MemoryRouter>,
      ),
    );
    fireEvent.click(screen.getByTestId("open-search"));
    const input = await screen.findByTestId("global-search-input");
    fireEvent.change(input, { target: { value: "x".repeat(300) } });
    const empty = await screen.findByTestId("global-search-empty");
    const heading = empty.querySelector("p");
    expect(heading?.textContent).toContain("x".repeat(300));
    expect(heading?.className).toContain("break-words");
    expect(heading?.className).toContain("[overflow-wrap:anywhere]");
  });
});

describe("#2003 shortcut hint", () => {
  it("shows Ctrl K on Linux in the header and cultivar search", async () => {
    setPlatform("Linux x86_64");
    render(
      withClient(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route path="*" element={<AppShell />} />
          </Routes>
        </MemoryRouter>,
      ),
    );
    await waitFor(() => {
      expect(screen.getByTestId("global-search-trigger").querySelector("kbd")?.textContent).toBe(
        "Ctrl K",
      );
    });
    cleanup();
    setPlatform("Linux x86_64");
    render(
      withClient(
        <MemoryRouter initialEntries={["/cultivars"]}>
          <CultivarsIndex />
        </MemoryRouter>,
      ),
    );
    await waitFor(() => {
      expect(
        screen.getByTestId("cultivars-index-open-search").querySelector("kbd")?.textContent,
      ).toBe("Ctrl K");
    });
  });

  it("shows ⌘K on Mac", () => {
    setPlatform("MacIntel");
    render(
      withClient(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route path="*" element={<AppShell />} />
          </Routes>
        </MemoryRouter>,
      ),
    );
    expect(screen.getByTestId("global-search-trigger").querySelector("kbd")?.textContent).toBe(
      "⌘K",
    );
  });
});
