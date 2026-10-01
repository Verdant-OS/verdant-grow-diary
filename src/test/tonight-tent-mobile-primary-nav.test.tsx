/**
 * One-Tent Home — mobile first-row navigation (slice `tonight-tent-nav-density`).
 *
 * The first row reads Tent / Log / Timeline / More. Log is the single
 * existing `/daily-check` route and keeps an explicit grow scope taken from
 * the URL only; it never invents one. Every destination that left the first
 * row stays reachable under More.
 */
import { describe, it, expect } from "vitest";
import type { ReactNode } from "react";
import { render, screen, act, within } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MobileNav, { primary, more } from "@/components/MobileNav";
import { isNavigationItemActive } from "@/lib/navigationActiveRules";
import { resolveMobilePrimaryHref } from "@/lib/growerNavigationRules";

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (children: ReactNode) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(wrap(<MobileNav />));
}

function firstRow() {
  const nav = screen.getByRole("navigation", { name: "Primary navigation" });
  return within(nav)
    .getAllByRole("link")
    .map((a) => ({ label: a.textContent, href: a.getAttribute("href") }));
}

describe("first row: Tent / Log / Timeline / More", () => {
  it("defines exactly three primary destinations in order", () => {
    expect(primary.map((p) => [p.label, p.to])).toEqual([
      ["Tent", "/"],
      ["Log", "/daily-check"],
      ["Timeline", "/timeline"],
    ]);
  });

  it("renders the three tabs plus More, with no other first-row tab", () => {
    renderAt("/");
    expect(firstRow()).toEqual([
      { label: "Tent", href: "/" },
      { label: "Log", href: "/daily-check" },
      { label: "Timeline", href: "/timeline" },
    ]);
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(nav).getByText("More")).toBeInTheDocument();
    for (const gone of ["Home", "Tents", "Plants", "Alerts"]) {
      expect(within(nav).queryByText(gone)).toBeNull();
    }
  });

  it("lays the row out as four equal columns", () => {
    renderAt("/");
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(nav.firstElementChild).toHaveClass("grid-cols-4");
  });
});

describe("active state", () => {
  const tent = primary.find((p) => p.label === "Tent")!;
  const log = primary.find((p) => p.label === "Log")!;

  it("Tent is active on the session-aware home and its /dashboard alias only", () => {
    expect(isNavigationItemActive("/", tent)).toBe(true);
    expect(isNavigationItemActive("/dashboard", tent)).toBe(true);
    expect(isNavigationItemActive("/tents", tent)).toBe(false);
    expect(isNavigationItemActive("/timeline", tent)).toBe(false);
  });

  it("Log is active on /daily-check", () => {
    expect(isNavigationItemActive("/daily-check", log)).toBe(true);
    expect(isNavigationItemActive("/", log)).toBe(false);
  });

  it("marks the current tab with aria-current", () => {
    renderAt("/daily-check");
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(nav).getByText("Log").closest("a")).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByText("Tent").closest("a")).not.toHaveAttribute("aria-current");
  });
});

describe("Log keeps an explicit grow scope and never invents one", () => {
  it("carries the grow from a /grows/:growId path", () => {
    renderAt("/grows/grow-1");
    expect(firstRow().find((t) => t.label === "Log")?.href).toBe("/daily-check?growId=grow-1");
  });

  it("carries the grow from a ?growId= query", () => {
    renderAt("/timeline?growId=grow-2");
    expect(firstRow().find((t) => t.label === "Log")?.href).toBe("/daily-check?growId=grow-2");
  });

  it("stays unscoped when the URL names no grow", () => {
    renderAt("/tents");
    expect(firstRow().find((t) => t.label === "Log")?.href).toBe("/daily-check");
  });

  it("leaves Tent and Timeline hrefs unchanged under a grow scope", () => {
    renderAt("/grows/grow-1");
    const row = firstRow();
    expect(row.find((t) => t.label === "Tent")?.href).toBe("/");
    expect(row.find((t) => t.label === "Timeline")?.href).toBe("/timeline");
  });
});

describe("resolveMobilePrimaryHref (pure)", () => {
  it("scopes only /daily-check", () => {
    expect(resolveMobilePrimaryHref("/daily-check", "g-1")).toBe("/daily-check?growId=g-1");
    expect(resolveMobilePrimaryHref("/", "g-1")).toBe("/");
    expect(resolveMobilePrimaryHref("/timeline", "g-1")).toBe("/timeline");
  });

  it("treats null, empty and whitespace grows as no grow", () => {
    for (const growId of [null, undefined, "", "   "]) {
      expect(resolveMobilePrimaryHref("/daily-check", growId)).toBe("/daily-check");
    }
  });

  it("trims and URL-encodes the grow", () => {
    expect(resolveMobilePrimaryHref("/daily-check", "  a b  ")).toBe("/daily-check?growId=a%20b");
  });

  it("is deterministic", () => {
    const a = resolveMobilePrimaryHref("/daily-check", "g-9");
    const b = resolveMobilePrimaryHref("/daily-check", "g-9");
    expect(a).toBe(b);
  });
});

describe("destinations that left the first row stay under More", () => {
  it("lists Tents, Plants and Alerts in More with their existing routes", () => {
    const routes = more.map((m) => [m.label, m.to]);
    expect(routes).toContainEqual(["Tents", "/tents"]);
    expect(routes).toContainEqual(["Plants", "/plants"]);
    expect(routes).toContainEqual(["Alerts", "/alerts"]);
  });

  it("renders them in the More sheet", async () => {
    renderAt("/");
    await act(async () => {
      screen.getByText("More").click();
    });
    const region = await screen.findByRole("region", { name: "More navigation destinations" });
    expect(within(region).getByText("Tents").closest("a")).toHaveAttribute("href", "/tents");
    expect(within(region).getByText("Plants").closest("a")).toHaveAttribute("href", "/plants");
    expect(within(region).getByText("Alerts").closest("a")).toHaveAttribute("href", "/alerts");
  });

  it("does not duplicate the Log control as a second /daily-check entry in More", () => {
    expect(more.filter((m) => m.to === "/daily-check")).toEqual([]);
  });
});
