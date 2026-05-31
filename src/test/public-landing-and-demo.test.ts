/**
 * Public landing + demo experience tests.
 *
 * Verifies:
 *   - /demo is registered as a public route outside AppShell.
 *   - Landing page exposes Explore Demo / Create Free Account / Sign in CTAs.
 *   - Landing page links to /demo (the public preview).
 *   - Demo page is safe: no Supabase client, no hook imports, no edge calls,
 *     no private-table queries, no service_role, no device-control surface.
 *   - Demo page visibly labels itself as "Demo data" / "Demo mode".
 *   - Demo page provides write-action prompts that point to account creation
 *     instead of persisting anything.
 *   - AppShell still gates real-data routes (redirects unauthenticated users
 *     to /welcome, not to a private dashboard).
 *   - Forbidden marketing claims are not present.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSrc = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

const APP = readSrc("App.tsx");
const LANDING = readSrc("pages/Landing.tsx");
const DEMO = readSrc("pages/Demo.tsx");
const SHELL = readSrc("components/AppShell.tsx");

describe("public /demo route registration", () => {
  it("App imports Demo", () => {
    expect(APP).toMatch(/import\s+Demo\s+from\s+"\.\/pages\/Demo"/);
  });
  it("App registers /demo as a public route (outside AppShell)", () => {
    expect(APP).toMatch(/path="\/demo"\s+element=\{<Demo\s*\/>\}/);
  });
});

describe("Landing CTAs for approachable entry", () => {
  it("exposes Explore Demo, Create Free Account and Sign in CTAs", () => {
    expect(LANDING).toMatch(/Explore Demo/);
    expect(LANDING).toMatch(/Create Free Account/);
    expect(LANDING).toMatch(/Sign in/);
  });
  it("links to /demo from the landing page", () => {
    expect(LANDING).toMatch(/to="\/demo"/);
  });
  it("includes the trust line", () => {
    expect(LANDING).toMatch(/No blind automation/);
    expect(LANDING).toMatch(/No fake live data/);
    expect(LANDING).toMatch(/grower stays in control/i);
  });
});

describe("Demo page safety", () => {
  it("does not import the Supabase client or invoke edge functions", () => {
    expect(DEMO).not.toMatch(/@\/integrations\/supabase\/client/);
    expect(DEMO).not.toMatch(/functions\.invoke/);
    expect(DEMO).not.toMatch(/service_role/);
  });
  it("does not import any data hook", () => {
    expect(DEMO).not.toMatch(/from\s+["']@\/hooks\//);
  });
  it("does not query private tables", () => {
    for (const t of [
      "grows",
      "plants",
      "tents",
      "sensor_readings",
      "alerts",
      "alert_events",
      "action_queue",
      "action_queue_events",
      "diary_entries",
    ]) {
      expect(DEMO).not.toMatch(new RegExp(`\\.from\\(["']${t}["']`));
    }
  });
  it("introduces no device/automation control surface", () => {
    expect(DEMO).not.toMatch(/device[-_ ]command/i);
    expect(DEMO).not.toMatch(/external[-_ ]control/i);
    expect(DEMO).not.toMatch(/\bautopilot\b/i);
  });
});

describe("Demo page labels demo data and gates writes", () => {
  it("visibly marks the page as Demo mode / Demo data", () => {
    expect(DEMO).toMatch(/Demo mode/);
    expect(DEMO).toMatch(/Demo data/);
  });
  it("labels demo grow / tent / plant explicitly", () => {
    expect(DEMO).toMatch(/Demo grow/);
    expect(DEMO).toMatch(/Demo tent/);
    expect(DEMO).toMatch(/Demo plant/);
  });
  it("write actions prompt account creation instead of persisting", () => {
    expect(DEMO).toMatch(/askCreateAccount\("Add log"\)/);
    expect(DEMO).toMatch(/askCreateAccount\("Run AI Doctor"\)/);
    expect(DEMO).toMatch(/askCreateAccount\("Add to Action Queue"\)/);
    expect(DEMO).toMatch(/Create a free account to use this with your real grow/);
  });
});

describe("AppShell still protects real-data routes", () => {
  it("redirects unauthenticated users to /welcome (not directly into the app)", () => {
    expect(SHELL).toMatch(/nav\("\/welcome"/);
    expect(SHELL).not.toMatch(/if\s*\(!user\)\s*\{\s*nav\("\/"/);
  });
  it("AppShell still reads useAuth (auth gate intact)", () => {
    expect(SHELL).toMatch(/useAuth\(\)/);
  });
});

describe("Landing + Demo contain no forbidden marketing claims", () => {
  const FORBIDDEN = [/autopilot/i, /AI grows for you/i, /guaranteed yield/i];
  for (const re of FORBIDDEN) {
    it(`Landing does not contain ${re}`, () => {
      expect(LANDING).not.toMatch(re);
    });
    it(`Demo does not contain ${re}`, () => {
      expect(DEMO).not.toMatch(re);
    });
  }
});
