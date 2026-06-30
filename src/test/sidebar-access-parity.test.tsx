/**
 * Sidebar Access Parity v1 — sidebar/nav links must respect manifest access.
 *
 * Verifies:
 *  - Authenticated non-operator growers see grower-facing links
 *    (Lineage Repair, Harvest Archive, AI Grow Doctor, etc.).
 *  - Authenticated non-operator growers DO NOT see any link to an
 *    operator/internal/admin route — those entries must be gated behind
 *    the server-side `has_role('operator')` check.
 *  - Operator users additionally see the operator-gated "AI Doctor Results"
 *    deep link and the OperatorModeLink.
 *  - The static `groups` config never hard-codes an ungated link to a
 *    manifest path whose access is `operator` or `internal`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { APP_ROUTES } from "@/lib/appRouteManifest";

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

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SidebarProvider>{children}</SidebarProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function hrefSet(): Set<string> {
  return new Set(
    Array.from(document.querySelectorAll("a[href]"))
      .map((a) => a.getAttribute("href") || "")
      .filter(Boolean),
  );
}

const OPERATOR_OR_INTERNAL_PATHS = new Set(
  APP_ROUTES.filter((r) => r.access === "operator" || r.access === "internal").map(
    (r) => r.path,
  ),
);

describe("AppSidebar — non-operator authenticated grower", () => {
  beforeEach(() => {
    roleState.status = "denied";
  });

  it("renders the Lineage Repair link to /grow-lineage", () => {
    render(wrap(<AppSidebar />));
    const links = hrefSet();
    expect(links.has("/grow-lineage")).toBe(true);
    expect(screen.getByText("Lineage Repair")).toBeInTheDocument();
  });

  it("renders core grower-facing nav links", () => {
    render(wrap(<AppSidebar />));
    const links = hrefSet();
    for (const path of [
      "/",
      "/tents",
      "/plants",
      "/sensors",
      "/logs",
      "/tasks",
      "/alerts",
      "/actions",
      "/doctor",
      "/reports",
      "/grows",
      "/grow-lineage",
      "/settings",
    ]) {
      expect(links.has(path), `missing grower link ${path}`).toBe(true);
    }
  });

  it("renders NO operator/internal/admin links", () => {
    render(wrap(<AppSidebar />));
    const links = hrefSet();
    const forbidden = [
      "/operator/ai-doctor-phase1",
      "/operator/demo-preview",
      "/operator/ecowitt",
      "/operator/release-readiness",
      "/diagnostics",
      "/sensors/ecowitt-audit",
      "/sensors/ingest-normalizer",
      "/admin/leads",
      "/leads",
      "/pi-ingest-status",
      "/ingest-inspector",
      "/internal/ai-doctor-phase1-preview",
      "/internal/sensor-truth-audit",
      "/internal/ai-doctor-confidence-audit",
    ];
    for (const path of forbidden) {
      expect(links.has(path), `non-operator must not see ${path}`).toBe(false);
    }
  });

  it("renders no anchor pointing to any operator/internal manifest path", () => {
    render(wrap(<AppSidebar />));
    const links = hrefSet();
    const leaked = [...links].filter((href) => OPERATOR_OR_INTERNAL_PATHS.has(href));
    expect(leaked, `leaked operator/internal links: ${leaked.join(", ")}`).toEqual([]);
  });
});

describe("AppSidebar — operator user", () => {
  beforeEach(() => {
    roleState.status = "granted";
  });

  it("additionally exposes the operator-only AI Doctor Results deep link", () => {
    render(wrap(<AppSidebar />));
    expect(hrefSet().has("/operator/ai-doctor-phase1")).toBe(true);
  });

  it("renders the Operator Mode link (server role-gated)", () => {
    render(wrap(<AppSidebar />));
    expect(screen.getByTestId("operator-mode-link-sidebar")).toBeInTheDocument();
  });

  it("still renders /grow-lineage (operator role does not hide grower tools)", () => {
    render(wrap(<AppSidebar />));
    expect(hrefSet().has("/grow-lineage")).toBe(true);
  });

  it("exposes the operator-only Release Readiness deep link", () => {
    render(wrap(<AppSidebar />));
    expect(hrefSet().has("/operator/release-readiness")).toBe(true);
    expect(screen.getByText("Release Readiness")).toBeInTheDocument();
  });
});

describe("Mobile More sheet — manifest access parity", () => {
  it("primary tabs and More entries only point at manifest 'auth' paths", async () => {
    const { primary, more } = await import("@/components/MobileNav");
    const allowedAuthOrRedirect = new Set(
      APP_ROUTES.filter((r) => r.access === "auth" || r.access === "redirect").map(
        (r) => r.path,
      ),
    );
    for (const item of [...primary, ...more]) {
      expect(
        allowedAuthOrRedirect.has(item.to),
        `MobileNav link ${item.to} is not a grower-facing auth route in the manifest`,
      ).toBe(true);
      expect(OPERATOR_OR_INTERNAL_PATHS.has(item.to)).toBe(false);
    }
  });
});
