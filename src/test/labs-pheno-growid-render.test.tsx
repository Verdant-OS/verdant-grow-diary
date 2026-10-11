/**
 * GDP-LABS-PHENO-GROWID-001 — Labs Pheno Hunt render pins.
 *
 * Source scans in labs-pheno-growid.test.ts prove wiring exists but cannot
 * catch regressions where resolveLabsNavigationDestinations is called without
 * a growId. These tests assert resolved DOM hrefs under grow-scoped locations.
 */
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import AppSidebar from "@/components/AppSidebar";
import MobileNav from "@/components/MobileNav";
import { SidebarProvider } from "@/components/ui/sidebar";

const GROW = "4cad3cae-21e3-42f8-8372-2f6237205db3";

vi.mock("@/hooks/useHasRole", () => ({
  useHasRole: () => ({
    status: "denied" as const,
    granted: false,
    error: null,
  }),
}));

function wrapSidebar(children: ReactNode, initialEntry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SidebarProvider>{children}</SidebarProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function wrapMobile(initialEntry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <MobileNav />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function openMobileMoreSheet() {
  await act(async () => {
    screen.getByText("More").click();
  });
  return screen.getByTestId("mobile-more-group-labs");
}

async function openSidebarLabsMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open Labs" }));
}

function phenoHuntHref(container: HTMLElement): string | null {
  const link = within(container).getByText("Pheno Hunt").closest("a");
  return link?.getAttribute("href") ?? null;
}

describe("Labs Pheno Hunt grow-scoped render", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("MobileNav More → Labs", () => {
    it("carries growId on Pheno Hunt when location is /grows/:id", async () => {
      render(wrapMobile(`/grows/${GROW}`));
      const labs = await openMobileMoreSheet();

      expect(phenoHuntHref(labs)).toBe(`/pheno-hunts?growId=${GROW}`);
      expect(within(labs).getByText("Breeding Programs").closest("a")).toHaveAttribute(
        "href",
        `/breeding?growId=${GROW}`,
      );
    });

    it("carries growId on Pheno Hunt when ?growId= is on the current location", async () => {
      render(wrapMobile(`/plants?growId=${GROW}`));
      const labs = await openMobileMoreSheet();

      expect(phenoHuntHref(labs)).toBe(`/pheno-hunts?growId=${GROW}`);
    });

    it("keeps bare /pheno-hunts without grow context", async () => {
      render(wrapMobile("/dashboard"));
      const labs = await openMobileMoreSheet();

      expect(phenoHuntHref(labs)).toBe("/pheno-hunts");
    });
  });

  describe("AppSidebar More → Labs", () => {
    it("carries growId on Pheno Hunt when location is /grows/:id", async () => {
      render(wrapSidebar(<AppSidebar />, `/grows/${GROW}`));
      await openSidebarLabsMenu();

      expect(screen.getByText("Pheno Hunt").closest("a")).toHaveAttribute(
        "href",
        `/pheno-hunts?growId=${GROW}`,
      );
      expect(screen.getByText("Breeding Programs").closest("a")).toHaveAttribute(
        "href",
        `/breeding?growId=${GROW}`,
      );
    });

    it("carries growId on Pheno Hunt when ?growId= is on the current location", async () => {
      render(wrapSidebar(<AppSidebar />, `/timeline?growId=${GROW}`));
      await openSidebarLabsMenu();

      expect(screen.getByText("Pheno Hunt").closest("a")).toHaveAttribute(
        "href",
        `/pheno-hunts?growId=${GROW}`,
      );
    });

    it("keeps bare /pheno-hunts without grow context", async () => {
      render(wrapSidebar(<AppSidebar />, "/dashboard"));
      await openSidebarLabsMenu();

      expect(screen.getByText("Pheno Hunt").closest("a")).toHaveAttribute("href", "/pheno-hunts");
    });
  });
});
