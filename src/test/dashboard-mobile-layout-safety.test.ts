import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const APPSHELL = read("src/components/AppShell.tsx");
const PAGE_HEADER = read("src/components/PageHeader.tsx");
const DASHBOARD = read("src/pages/Dashboard.tsx");
const QUICKLOG_FAB = read("src/components/QuickLogV2Fab.tsx");
const DATA_SOURCE = read("src/components/DashboardDataSourceDisclosure.tsx");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");

describe("Dashboard mobile layout safety", () => {
  it("PageHeader stacks actions below the title on mobile", () => {
    expect(PAGE_HEADER).toContain("flex-col");
    expect(PAGE_HEADER).toContain("sm:flex-row");
    expect(PAGE_HEADER).toContain("w-full");
    expect(PAGE_HEADER).toContain("break-words");
    expect(PAGE_HEADER).toContain("leading-relaxed");
  });

  it("AppShell reserves mobile bottom space for nav plus floating Quick Log", () => {
    expect(APPSHELL).toContain("overflow-x-hidden");
    expect(APPSHELL).toContain("min-w-0");
    expect(APPSHELL).toContain("pb-[calc(10rem_+_env(safe-area-inset-bottom))]");
    expect(APPSHELL).toContain(
      "bottom-[calc(5.5rem_+_env(safe-area-inset-bottom))]",
    );
  });

  it("Dashboard action buttons can wrap without squeezing intro copy", () => {
    expect(DASHBOARD).toContain("flex w-full items-center gap-2 flex-wrap sm:w-auto");
    expect(DASHBOARD).toContain("flex-1 sm:flex-none");
  });

  it("Dashboard cards and grids opt into min-width containment", () => {
    expect(DASHBOARD).toContain('className="min-w-0"');
    expect(DASHBOARD).toContain("gap-3 mb-6 min-w-0");
    expect(DASHBOARD).toContain("gap-4 min-w-0");
    expect(DASHBOARD).toContain("min-w-0 overflow-hidden");
  });

  it("page-level QuickLogV2Fab is hidden on mobile so it does not crowd MobileNav", () => {
    expect(QUICKLOG_FAB).toContain("hidden md:inline-flex");
  });
});

describe("Dashboard source labels and Plant Detail copy", () => {
  it("saved account data is not labeled live", () => {
    expect(DATA_SOURCE).toContain("Saved");
    expect(DATA_SOURCE).toContain("Loaded from your Verdant account.");
    expect(DATA_SOURCE).not.toContain("LIVE DATA");
    expect(DATA_SOURCE).not.toContain("Live data from your grow backend.");
  });

  it("Plant Detail uses Last activity for record-backed activity copy", () => {
    expect(PLANT_DETAIL).toContain("Last activity");
    expect(PLANT_DETAIL).not.toContain("Last note");
  });
});
