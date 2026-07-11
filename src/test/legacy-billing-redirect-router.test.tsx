/**
 * Slice F — router-level proof that `/billing/:plan` renders only the
 * `LegacyBillingRedirect` presenter and that navigation lands on the
 * canonical `/upgrade` URL with the correct `plan` preselect and a
 * sanitized `returnTo`.
 *
 * Complements the pure `legacy-checkout-redirect.test.ts` unit tests by
 * exercising the real React Router `<Navigate replace>` behavior instead
 * of only asserting the pure helper output.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import LegacyBillingRedirect from "@/pages/LegacyBillingRedirect";
import { APP_ROUTES } from "@/lib/appRouteManifest";

function LocationProbe() {
  const loc = useLocation();
  return (
    <div data-testid="probe">
      <span data-testid="probe-pathname">{loc.pathname}</span>
      <span data-testid="probe-search">{loc.search}</span>
    </div>
  );
}

function renderAt(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/billing/:plan" element={<LegacyBillingRedirect />} />
        <Route path="/upgrade" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LegacyBillingRedirect — router-level Slice F proof", () => {
  it("/billing/pro-monthly → /upgrade?plan=pro_monthly", () => {
    renderAt("/billing/pro-monthly");
    expect(screen.getByTestId("probe-pathname").textContent).toBe("/upgrade");
    expect(screen.getByTestId("probe-search").textContent).toBe("?plan=pro_monthly");
  });

  it("/billing/pro-annual → /upgrade?plan=pro_annual", () => {
    renderAt("/billing/pro-annual");
    expect(screen.getByTestId("probe-search").textContent).toBe("?plan=pro_annual");
  });

  it("/billing/founder-lifetime → /upgrade?plan=founder_lifetime", () => {
    renderAt("/billing/founder-lifetime");
    expect(screen.getByTestId("probe-search").textContent).toBe(
      "?plan=founder_lifetime",
    );
  });

  it("preserves a safe same-origin returnTo through the router redirect", () => {
    renderAt("/billing/pro-monthly?returnTo=/pheno-hunts/new");
    expect(screen.getByTestId("probe-search").textContent).toBe(
      "?plan=pro_monthly&returnTo=%2Fpheno-hunts%2Fnew",
    );
  });

  it("drops an unsafe external returnTo silently", () => {
    renderAt(
      "/billing/pro-monthly?returnTo=" + encodeURIComponent("https://evil.example/steal"),
    );
    expect(screen.getByTestId("probe-search").textContent).toBe("?plan=pro_monthly");
  });

  it("drops javascript: returnTo silently", () => {
    renderAt(
      "/billing/pro-monthly?returnTo=" + encodeURIComponent("javascript:alert(1)"),
    );
    expect(screen.getByTestId("probe-search").textContent).toBe("?plan=pro_monthly");
  });

  it("unknown plan slug lands on bare /upgrade (no plan param)", () => {
    renderAt("/billing/enterprise");
    expect(screen.getByTestId("probe-pathname").textContent).toBe("/upgrade");
    expect(screen.getByTestId("probe-search").textContent).toBe("");
  });

  it("Free plan slug lands on bare /upgrade (no plan param)", () => {
    renderAt("/billing/free");
    expect(screen.getByTestId("probe-search").textContent).toBe("");
  });
});

// -------- Static router-manifest guarantees for Slice F ----------------------

const APP_SRC = readFileSync(
  resolve(__dirname, "..", "App.tsx"),
  "utf8",
);

describe("Slice F — App.tsx and manifest convergence", () => {
  it("App.tsx has no BillingPlaceholder import or route element", () => {
    expect(APP_SRC).not.toMatch(/BillingPlaceholder/);
  });

  it("App.tsx mounts /billing/:plan only as LegacyBillingRedirect", () => {
    const matches = APP_SRC.match(/path="\/billing\/:plan"\s+element=\{<([A-Za-z0-9_]+)/g) ?? [];
    expect(matches.length).toBe(1);
    expect(matches[0]).toContain("LegacyBillingRedirect");
  });

  it("route manifest still marks /billing/:plan as a redirect", () => {
    const row = APP_ROUTES.find((r) => r.path === "/billing/:plan");
    expect(row).toBeDefined();
    expect(row?.access).toBe("redirect");
  });

  it("no runtime file under src/ imports the retired BillingPlaceholder module", async () => {
    // Fast static scan — runtime source only, tests are allowed to reference
    // the retired name in comments.
    const { readdirSync, statSync, readFileSync: rf } = await import("node:fs");
    const roots = ["src/pages", "src/components", "src/hooks", "src/lib", "src/store"];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = resolve(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else if (/\.(t|j)sx?$/.test(entry)) {
          const src = rf(full, "utf8");
          if (/from\s+["']@\/pages\/BillingPlaceholder["']/.test(src)) {
            offenders.push(full);
          }
        }
      }
    };
    for (const r of roots) {
      try { walk(resolve(__dirname, "..", "..", r)); } catch { /* dir missing ok */ }
    }
    expect(offenders).toEqual([]);
  });

  it("no runtime navigation surface links to /billing/*", async () => {
    const { readdirSync, statSync, readFileSync: rf } = await import("node:fs");
    const roots = ["src/pages", "src/components"];
    const offenders: { file: string; hit: string }[] = [];
    const linkRx = /(?:to|href)=["']\/billing\/[a-zA-Z0-9-]+/g;
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = resolve(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else if (/\.(t|j)sx?$/.test(entry) && !/\.test\./.test(entry)) {
          const src = rf(full, "utf8");
          const matches = src.match(linkRx);
          if (matches) offenders.push({ file: full, hit: matches.join(",") });
        }
      }
    };
    for (const r of roots) {
      try { walk(resolve(__dirname, "..", "..", r)); } catch { /* ok */ }
    }
    expect(offenders).toEqual([]);
  });

  it("no stale 'Start sandbox checkout' copy remains in src/", async () => {
    const { readdirSync, statSync, readFileSync: rf } = await import("node:fs");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = resolve(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else if (/\.(t|j)sx?$/.test(entry) && !/legacy-billing-redirect-router\.test\.tsx$/.test(entry)) {
          const src = rf(full, "utf8");
          if (/Start sandbox checkout/.test(src)) offenders.push(full);
        }
      }
    };
    walk(resolve(__dirname, "..", "..", "src"));
    expect(offenders).toEqual([]);
  });
});
