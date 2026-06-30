/**
 * Grow Lineage Deep-Link Reachability v1.
 *
 * Route-level static integration test (browser E2E infra is not used here
 * — this is route/component-level reachability). Proves that direct visits
 * to /grow-lineage:
 *  - require authentication (mounted under AppShell, which calls
 *    useRequireAuth → redirects unauthenticated users to /auth),
 *  - DO NOT require the operator role (NOT mounted under
 *    <Route element={<RequireOperatorRole />}>),
 *  - land on the GrowLineageRepair page element (same path preserved),
 *  - render grower-facing repair copy ("Lineage Repair", "Action Queue
 *    targeting", or the all-assigned empty state),
 *  - do not render the operator-denied / "Access restricted" screen.
 *
 * Sidebar reachability: the Archive section exposes a static
 * <NavLink to="/grow-lineage"> labelled "Lineage Repair" that every
 * authenticated grower sees (covered by sidebar-access-parity.test.tsx).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { APP_ROUTES } from "@/lib/appRouteManifest";

const APP = fs.readFileSync(path.resolve(__dirname, "../App.tsx"), "utf8");
const PAGE = fs.readFileSync(
  path.resolve(__dirname, "../pages/GrowLineageRepair.tsx"),
  "utf8",
);
const SIDEBAR = fs.readFileSync(
  path.resolve(__dirname, "../components/AppSidebar.tsx"),
  "utf8",
);

// ---- App.tsx route-block walker (mirrors operator-route-auth-protection) ----
function tagOpenEnd(src: string, openIdx: number): number {
  let i = openIdx + 1;
  let braces = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "{") braces += 1;
    else if (ch === "}") braces -= 1;
    else if (ch === ">" && braces === 0) return i;
    i += 1;
  }
  return -1;
}
function sliceMatchingRouteBlock(src: string, openIdx: number): string {
  const startEnd = tagOpenEnd(src, openIdx);
  let depth = 1;
  let i = startEnd + 1;
  while (i < src.length && depth > 0) {
    const nextOpen = src.indexOf("<Route", i);
    const nextClose = src.indexOf("</Route>", i);
    if (nextClose === -1) return "";
    if (nextOpen !== -1 && nextOpen < nextClose) {
      const end = tagOpenEnd(src, nextOpen);
      if (end === -1) return "";
      if (src[end - 1] !== "/") depth += 1;
      i = end + 1;
    } else {
      depth -= 1;
      if (depth === 0) return src.slice(openIdx, nextClose);
      i = nextClose + "</Route>".length;
    }
  }
  return "";
}

const shellOpen = APP.indexOf("<Route element={<AppShell />}>");
const shellBlock = sliceMatchingRouteBlock(APP, shellOpen);
const opOpen = APP.indexOf("<Route element={<RequireOperatorRole />}>");
const opBlock = sliceMatchingRouteBlock(APP, opOpen);

function hasPath(block: string, p: string): boolean {
  return new RegExp(`path=["']${p.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}["']`).test(block);
}

describe("Grow Lineage Repair — deep-link reachability", () => {
  it("is mounted inside the AppShell-authenticated block", () => {
    expect(shellOpen).toBeGreaterThan(-1);
    expect(hasPath(shellBlock, "/grow-lineage")).toBe(true);
  });

  it("is NOT mounted inside the RequireOperatorRole block", () => {
    expect(opOpen).toBeGreaterThan(-1);
    expect(hasPath(opBlock, "/grow-lineage")).toBe(false);
  });

  it("renders the GrowLineageRepair page component (path preserved)", () => {
    expect(APP).toMatch(
      /<Route\s+path=["']\/grow-lineage["']\s+element=\{<GrowLineageRepair\s*\/>\}\s*\/>/,
    );
  });

  it("manifest classifies /grow-lineage as authenticated grower-facing", () => {
    const entry = APP_ROUTES.find((r) => r.path === "/grow-lineage");
    expect(entry?.access).toBe("auth");
  });

  it("page renders grower-facing repair copy, not operator-denied UI", () => {
    expect(PAGE).toMatch(/Lineage Repair|Action Queue targeting|All tents are assigned to grows/);
    expect(PAGE).not.toMatch(/require-operator-denied/);
    expect(PAGE).not.toMatch(/RequireOperatorRole/);
    expect(PAGE).not.toMatch(/Access restricted/i);
  });

  it("sidebar Archive section exposes the Lineage Repair deep link", () => {
    expect(SIDEBAR).toMatch(/to:\s*["']\/grow-lineage["']/);
    expect(SIDEBAR).toMatch(/Lineage Repair/);
    // The grow-lineage item must NOT be marked requiresOperator.
    expect(SIDEBAR).not.toMatch(
      /\{\s*to:\s*["']\/grow-lineage["'][^}]*requiresOperator\s*:\s*true/,
    );
  });
});
