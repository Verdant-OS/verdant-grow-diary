/**
 * GDP-LABS-PHENO-GROWID-001 — rendered Labs navigation
 *
 * Proves AppSidebar and MobileNav actually emit grow-scoped Pheno Hunt links
 * when the current location already carries an explicit growId.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MobileNav from "@/components/MobileNav";

const roleState: { status: "loading" | "granted" | "denied" | "unauthenticated" | "error" } = {
  status: "denied",
};

vi.mock("@/hooks/useHasRole", () => ({
  useHasRole: () => ({
    status: roleState.status,
    granted: roleState.status === "granted",
    error: null,
  }),
}));

import AppSidebar from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

const GROW = "4cad3cae-21e3-42f8-8372-2f6237205db3";

function wrapMobileNav(initialEntry = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <MobileNav />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function wrapSidebar(initialEntry = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function openMobileMoreSheet(): Promise<void> {
  await act(async () => {
    screen.getByText("More").click();
  });
  await screen.findByTestId("mobile-more-sheet");
}

async function openSidebarLabsMenu(): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open Labs" }));
}

describe("Labs Pheno Hunt growId — rendered navigation", () => {
  beforeEach(() => {
    roleState.status = "denied";
  });

  it("MobileNav retains growId on Pheno Hunt when opened from a grow hub", async () => {
    render(wrapMobileNav(`/grows/${GROW}`));
    await openMobileMoreSheet();

    const labs = screen.getByTestId("mobile-more-group-labs");
    const phenoLink = within(labs).getByText("Pheno Hunt").closest("a");
    expect(phenoLink).toHaveAttribute("href", `/pheno-hunts?growId=${GROW}`);
    expect(within(labs).getByText("Breeding Programs").closest("a")).toHaveAttribute(
      "href",
      "/breeding",
    );
  });

  it("MobileNav keeps bare /pheno-hunts without grow context", async () => {
    render(wrapMobileNav("/dashboard"));
    await openMobileMoreSheet();

    const labs = screen.getByTestId("mobile-more-group-labs");
    expect(within(labs).getByText("Pheno Hunt").closest("a")).toHaveAttribute(
      "href",
      "/pheno-hunts",
    );
  });

  it("MobileNav retains growId from ?growId= on non-grow routes", async () => {
    render(wrapMobileNav(`/plants?growId=${GROW}`));
    await openMobileMoreSheet();

    const labs = screen.getByTestId("mobile-more-group-labs");
    expect(within(labs).getByText("Pheno Hunt").closest("a")).toHaveAttribute(
      "href",
      `/pheno-hunts?growId=${GROW}`,
    );
  });

  it("AppSidebar retains growId on Pheno Hunt when opened from a grow hub", async () => {
    render(wrapSidebar(`/grows/${GROW}`));
    await openSidebarLabsMenu();

    const phenoLink = screen.getByRole("menuitem", { name: "Pheno Hunt" }).closest("a");
    expect(phenoLink).toHaveAttribute("href", `/pheno-hunts?growId=${GROW}`);
    expect(
      screen.getByRole("menuitem", { name: "Breeding Programs" }).closest("a"),
    ).toHaveAttribute("href", "/breeding");
  });

  it("AppSidebar keeps bare /pheno-hunts without grow context", async () => {
    render(wrapSidebar("/dashboard"));
    await openSidebarLabsMenu();

    const phenoLink = screen.getByRole("menuitem", { name: "Pheno Hunt" }).closest("a");
    expect(phenoLink).toHaveAttribute("href", "/pheno-hunts");
  });
});
