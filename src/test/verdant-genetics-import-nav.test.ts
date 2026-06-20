/**
 * verdant-genetics-import-nav — operator navigation discoverability.
 *
 * Static source-level checks (no Supabase, no rendering of heavy pages)
 * that the Diagnostics "Operator tools" section advertises the Genetics
 * XLSX Import route with preview-only labelling, and that the route is
 * wired in the app router.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const diagnosticsSource = readFileSync(resolve(process.cwd(), "src/pages/Diagnostics.tsx"), "utf8");
const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const sidebarSource = readFileSync(resolve(process.cwd(), "src/components/AppSidebar.tsx"), "utf8");

describe("operator nav: Genetics XLSX Import", () => {
  it("Diagnostics renders a card linking to /operator/genetics-import", () => {
    expect(diagnosticsSource).toContain("Genetics XLSX Import");
    expect(diagnosticsSource).toMatch(/to=["']\/operator\/genetics-import["']/);
    expect(diagnosticsSource).toContain("operator-nav-genetics-import");
  });

  it("Diagnostics card carries preview-only / no-data-saved labels", () => {
    expect(diagnosticsSource).toContain("Preview-only");
    expect(diagnosticsSource).toContain("No data saved until confirmed");
  });

  it("app router registers /operator/genetics-import via OperatorGeneticsImportPage", () => {
    expect(appSource).toContain("OperatorGeneticsImportPage");
    expect(appSource).toMatch(
      /path=["']\/operator\/genetics-import["']\s+element=\{<OperatorGeneticsImportPage/,
    );
  });

  it("AppSidebar exposes Genetics XLSX Import (Preview-only)", () => {
    expect(sidebarSource).toContain("/operator/genetics-import");
    expect(sidebarSource).toContain("Genetics XLSX Import");
    expect(sidebarSource).toContain("Preview-only");
  });

  it("AppSidebar still includes Diagnostics-style Operator group label", () => {
    expect(sidebarSource).toMatch(/label:\s*["']Operator["']/);
  });
});
