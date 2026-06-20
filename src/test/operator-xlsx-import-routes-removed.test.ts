// Guard that confirms operator XLSX/CSV spreadsheet import surfaces have
// been removed from both the App router and the route manifest.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { APP_ROUTES } from "@/lib/appRouteManifest";

const APP = fs.readFileSync(path.resolve(__dirname, "../App.tsx"), "utf8");
const SIDEBAR = fs.readFileSync(
  path.resolve(__dirname, "../components/AppSidebar.tsx"),
  "utf8",
);

const REMOVED_ROUTES = [
  "/operator/genetics-import",
  "/imports/representative-csv",
  "/sensors/csv-preview",
  "/partners/csv-preview",
];

describe("Operator XLSX / spreadsheet import routes are gone", () => {
  for (const p of REMOVED_ROUTES) {
    it(`route ${p} is not declared in App.tsx`, () => {
      expect(APP).not.toContain(`path="${p}"`);
    });
    it(`route ${p} is not present in the route manifest`, () => {
      expect(APP_ROUTES.find((r) => r.path === p)).toBeUndefined();
    });
  }

  it("sidebar nav exposes no XLSX / Spreadsheet / Genetics Import entry", () => {
    expect(SIDEBAR).not.toMatch(/XLSX/i);
    expect(SIDEBAR).not.toMatch(/Spreadsheet/i);
    expect(SIDEBAR).not.toMatch(/Genetics\s+Import/i);
    expect(SIDEBAR).not.toContain("/operator/genetics-import");
  });
});
