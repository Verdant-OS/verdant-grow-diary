/**
 * GDP-LABS-BREEDING-GROWID-001 — Labs presenter render pins.
 *
 * Pure route/helper tests can pass while AppSidebar and MobileNav still emit
 * bare `/breeding` when the location already carries an explicit growId.
 */
import type { ReactNode } from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

import AppSidebar from "@/components/AppSidebar";
import MobileNav from "@/components/MobileNav";
import { SidebarProvider } from "@/components/ui/sidebar";

const GROW = "4cad3cae-21e3-42f8-8372-2f6237205db3";

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

function wrap(children: ReactNode, initialEntry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SidebarProvider>{children}</SidebarProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function wrapMobile(children: ReactNode, initialEntry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

async function openSidebarLabsMenu(): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open Labs" }));
}

async function openMobileMoreSheet(): Promise<void> {
  await act(async () => {
    screen.getByRole("button", { name: "More" }).click();
  });
  await screen.findByRole("region", { name: "More navigation destinations" });
}

describe("Labs Breeding Programs growId — rendered navigation", () => {
  beforeEach(() => {
    roleState.status = "denied";
  });

  it.each([
    ["grow detail path", `/grows/${GROW}`],
    ["breeding query carry", `/breeding?growId=${GROW}`],
  ])("AppSidebar Labs links retain growId from %s", async (_case, initialEntry) => {
    render(wrap(<AppSidebar />, initialEntry));
    await openSidebarLabsMenu();

    const breeding = screen.getByText("Breeding Programs").closest("a");
    const pheno = screen.getByText("Pheno Hunt").closest("a");

    expect(breeding).toHaveAttribute("href", `/breeding?growId=${GROW}`);
    expect(pheno).toHaveAttribute("href", `/pheno-hunts?growId=${GROW}`);
  });

  it.each([
    ["grow detail path", `/grows/${GROW}`],
    ["breeding query carry", `/breeding?growId=${GROW}`],
  ])("MobileNav Labs links retain growId from %s", async (_case, initialEntry) => {
    render(wrapMobile(<MobileNav />, initialEntry));
    await openMobileMoreSheet();

    const labs = screen.getByTestId("mobile-more-group-labs");
    const breeding = within(labs).getByText("Breeding Programs").closest("a");
    const pheno = within(labs).getByText("Pheno Hunt").closest("a");

    expect(breeding).toHaveAttribute("href", `/breeding?growId=${GROW}`);
    expect(pheno).toHaveAttribute("href", `/pheno-hunts?growId=${GROW}`);
  });

  it("fail-closed AppSidebar without grow context keeps static /breeding", async () => {
    render(wrap(<AppSidebar />, "/dashboard"));
    await openSidebarLabsMenu();
    expect(screen.getByText("Breeding Programs").closest("a")).toHaveAttribute("href", "/breeding");
  });

  it("fail-closed MobileNav without grow context keeps static /breeding", async () => {
    render(wrapMobile(<MobileNav />, "/dashboard"));
    await openMobileMoreSheet();
    const labs = screen.getByTestId("mobile-more-group-labs");
    expect(within(labs).getByText("Breeding Programs").closest("a")).toHaveAttribute(
      "href",
      "/breeding",
    );
  });
});
