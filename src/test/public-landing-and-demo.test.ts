/**
 * Demo-surface removal regression.
 *
 * Verdant no longer ships a user-facing /demo route or "Explore Demo" CTAs.
 * The app is positioned around real grow data, manual fallback, and
 * Ecowitt-first hardware as the primary sensor source. This test locks
 * that contract in.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSrc = (p: string) =>
  readFileSync(resolve(__dirname, "..", p), "utf8");

const APP = readSrc("App.tsx");
const LANDING = readSrc("pages/Landing.tsx");
const SHELL = readSrc("components/AppShell.tsx");

describe("Demo page + route removal", () => {
  it("pages/Demo.tsx is removed from the codebase", () => {
    expect(existsSync(resolve(__dirname, "..", "pages/Demo.tsx"))).toBe(false);
  });
  it("App.tsx does not import a Demo page component", () => {
    expect(APP).not.toMatch(/from\s+["']\.\/pages\/Demo["']/);
  });
  it("/demo route does not render a Demo component", () => {
    expect(APP).not.toMatch(/element=\{<Demo\s*\/>\}/);
  });
  it("/demo redirects to the public landing (no broken bookmark)", () => {
    expect(APP).toMatch(
      /path="\/demo"\s+element=\{<Navigate\s+to="\/welcome"\s+replace\s*\/>\}/,
    );
  });
});

describe("Landing has no demo CTAs", () => {
  it("does not show 'Explore Demo' anywhere", () => {
    expect(LANDING).not.toMatch(/Explore Demo/i);
  });
  it("does not link to /demo", () => {
    expect(LANDING).not.toMatch(/to="\/demo"/);
  });
  it("does not render a 'Demo data' teaser badge", () => {
    expect(LANDING).not.toMatch(/Demo data/);
  });
  it("retains real-grow CTAs (Create Free Account, Sign in)", () => {
    expect(LANDING).toMatch(/Create Free Account/);
    expect(LANDING).toMatch(/Sign in/);
  });
  it("retains the trust line", () => {
    expect(LANDING).toMatch(/No blind automation/);
    expect(LANDING).toMatch(/No fake live data/);
    expect(LANDING).toMatch(/grower stays in control/i);
  });
});

describe("AppShell still protects real-data routes", () => {
  it("redirects unauthenticated users to /welcome", () => {
    expect(SHELL).toMatch(/nav\("\/welcome"/);
  });
  it("AppShell still reads useAuth (auth gate intact)", () => {
    expect(SHELL).toMatch(/useAuth\(\)/);
  });
});

describe("Landing contains no forbidden marketing claims", () => {
  for (const re of [/autopilot/i, /AI grows for you/i, /guaranteed yield/i]) {
    it(`Landing does not contain ${re}`, () => {
      expect(LANDING).not.toMatch(re);
    });
  }
});
