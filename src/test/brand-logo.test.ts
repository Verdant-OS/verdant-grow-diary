/**
 * Tests for the Verdant brand logo integration.
 *
 * Verifies:
 *   - BrandLogo component exists and references /brand/verdant-logo.png
 *   - Logo asset exists in public/brand
 *   - BrandLogo exposes size variants, showText, className, and accessible alt
 *   - Landing, AppShell, AppSidebar, and Auth pages render BrandLogo
 *   - Landing page still does not query private tables
 *   - No service_role / external-control strings introduced
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const LOGO_PATH = "public/brand/verdant-logo.png";
const BRAND = read("src/components/BrandLogo.tsx");
const LANDING = read("src/pages/Landing.tsx");
const SHELL = read("src/components/AppShell.tsx");
const SIDEBAR = read("src/components/AppSidebar.tsx");
const AUTH = read("src/pages/Auth.tsx");

describe("Verdant logo asset", () => {
  it("public/brand/verdant-logo.png exists and is non-empty", () => {
    const abs = resolve(root, LOGO_PATH);
    expect(existsSync(abs)).toBe(true);
    expect(statSync(abs).size).toBeGreaterThan(1000);
  });
});

describe("BrandLogo component", () => {
  it("references the public logo path", () => {
    expect(BRAND).toMatch(/\/brand\/verdant-logo\.png/);
  });

  it("has accessible alt text", () => {
    expect(BRAND).toMatch(/Verdant Grow Diary logo/);
    expect(BRAND).toMatch(/alt=/);
  });

  it("supports size, showText, and className props", () => {
    expect(BRAND).toMatch(/size\?:\s*BrandLogoSize/);
    expect(BRAND).toMatch(/showText\?:\s*boolean/);
    expect(BRAND).toMatch(/className\?:\s*string/);
    expect(BRAND).toMatch(/"sm"\s*\|\s*"md"\s*\|\s*"lg"\s*\|\s*"hero"/);
  });

  it("sets explicit width/height to prevent layout shift", () => {
    expect(BRAND).toMatch(/width=\{px\}/);
    expect(BRAND).toMatch(/height=\{px\}/);
  });

  it("leaves a TODO for a simplified favicon variant", () => {
    expect(BRAND).toMatch(/TODO\(favicon\)/);
  });
});

describe("BrandLogo placement", () => {
  it("Landing page imports and renders BrandLogo (header + hero)", () => {
    expect(LANDING).toMatch(/from\s+["']@\/components\/BrandLogo["']/);
    expect(LANDING).toMatch(/<BrandLogo[^>]*size="hero"/);
    expect(LANDING).toMatch(/<BrandLogo[^>]*size="md"/);
  });

  it("AppShell uses BrandLogo in the mobile header", () => {
    expect(SHELL).toMatch(/from\s+["']\.\/BrandLogo["']/);
    expect(SHELL).toMatch(/<BrandLogo/);
  });

  it("AppSidebar uses BrandLogo in the header", () => {
    expect(SIDEBAR).toMatch(/from\s+["']@\/components\/BrandLogo["']/);
    expect(SIDEBAR).toMatch(/<BrandLogo/);
  });

  it("Auth page uses BrandLogo", () => {
    expect(AUTH).toMatch(/from\s+["']@\/components\/BrandLogo["']/);
    expect(AUTH).toMatch(/<BrandLogo/);
  });
});

describe("safety: landing page stays public-safe", () => {
  it("landing page does not query private tables or call edge functions", () => {
    const privateTables = [
      "grows", "plants", "tents", "sensor_readings",
      "alerts", "alert_events", "action_queue", "action_queue_events",
      "diary_entries",
    ];
    for (const t of privateTables) {
      expect(LANDING).not.toMatch(new RegExp(`\\.from\\(["']${t}["']`));
    }
    expect(LANDING).not.toMatch(/@\/integrations\/supabase\/client/);
    expect(LANDING).not.toMatch(/functions\.invoke/);
  });

  it("BrandLogo introduces no service_role / external-control / ai-coach call", () => {
    expect(BRAND).not.toMatch(/service_role/);
    expect(BRAND).not.toMatch(/external[-_ ]control/i);
    expect(BRAND).not.toMatch(/device[-_ ]command/i);
    expect(BRAND).not.toMatch(/functions\.invoke/);
  });
});
