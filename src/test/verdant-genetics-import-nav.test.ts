/**
 * verdant-genetics-import-nav — STALE NAV GUARD (intentionally inverted).
 *
 * The /operator/genetics-import surface was explicitly removed (see
 * operator-xlsx-import-routes-removed.test.ts and sidebar-no-xlsx-import.test.tsx),
 * so the original discoverability assertions in this file are stale by design.
 *
 * Re-adding the genetics-import nav/route would break the "removed" guard
 * tests above. We keep this file as an inverted guard: it now confirms the
 * route stays absent from Diagnostics, App.tsx, and AppSidebar so accidental
 * re-introduction is caught here too.
 *
 * No production code is being changed by this file — it is a tests-only
 * reconciliation of two contradicting source-level guards. The "removed"
 * tests are authoritative; this file follows them.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const diagnosticsSource = readFileSync(resolve(process.cwd(), "src/pages/Diagnostics.tsx"), "utf8");
const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const sidebarSource = readFileSync(resolve(process.cwd(), "src/components/AppSidebar.tsx"), "utf8");

describe("operator nav: Genetics XLSX Import (removed)", () => {
  it("Diagnostics does not advertise the removed genetics-import route", () => {
    expect(diagnosticsSource).not.toContain("/operator/genetics-import");
    expect(diagnosticsSource).not.toContain("operator-nav-genetics-import");
  });

  it("app router does not register OperatorGeneticsImportPage", () => {
    expect(appSource).not.toContain("OperatorGeneticsImportPage");
    expect(appSource).not.toMatch(/path=["']\/operator\/genetics-import["']/);
  });

  it("AppSidebar does not expose the removed Genetics XLSX Import entry", () => {
    expect(sidebarSource).not.toContain("/operator/genetics-import");
    expect(sidebarSource).not.toContain("Genetics XLSX Import");
  });
});
