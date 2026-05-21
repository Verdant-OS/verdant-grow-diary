/**
 * Tests for production SEO, social preview, and browser metadata.
 *
 * Verifies index.html title/description/canonical, Open Graph and Twitter
 * tags, robots, theme color, favicon, and the public site.webmanifest.
 * Also re-asserts that the public landing page never queries private tables
 * and that no service_role / external-control strings leaked in.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const HTML = read("index.html");
const MANIFEST_PATH = resolve(root, "public/site.webmanifest");
const MANIFEST = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const LANDING = read("src/pages/Landing.tsx");

const PROD = "https://verdantgrowdiary.com";
const DESC =
  "Grow logs, sensor-aware insights, environment alerts, and cautious AI coaching for serious cultivators.";

function meta(html: string, attr: "name" | "property", key: string): string | null {
  const re = new RegExp(
    `<meta\\s+${attr}="${key}"\\s+content="([^"]+)"\\s*/?>`,
    "i",
  );
  return html.match(re)?.[1] ?? null;
}

describe("index.html — primary SEO", () => {
  it("title is Verdant Grow Diary", () => {
    expect(HTML).toMatch(/<title>\s*Verdant Grow Diary\s*<\/title>/);
  });

  it("description matches the production copy", () => {
    expect(meta(HTML, "name", "description")).toBe(DESC);
  });

  it("canonical points at the production domain", () => {
    expect(HTML).toMatch(
      /<link\s+rel="canonical"\s+href="https:\/\/verdantgrowdiary\.com"/,
    );
  });

  it("robots is index, follow", () => {
    expect(meta(HTML, "name", "robots")).toMatch(/index/);
    expect(meta(HTML, "name", "robots")).toMatch(/follow/);
  });

  it("theme color is Verdant dark green", () => {
    expect(meta(HTML, "name", "theme-color")).toBe("#0d1a12");
  });
});

describe("index.html — Open Graph", () => {
  it("og:title / description / url / type / site_name / image are set", () => {
    expect(meta(HTML, "property", "og:title")).toBe("Verdant Grow Diary");
    expect(meta(HTML, "property", "og:description")).toBe(DESC);
    expect(meta(HTML, "property", "og:url")).toBe(PROD);
    expect(meta(HTML, "property", "og:type")).toBe("website");
    expect(meta(HTML, "property", "og:site_name")).toBe("Verdant Grow Diary");
    expect(meta(HTML, "property", "og:image")).toMatch(
      /\/brand\/verdant-logo\.png$/,
    );
  });
});

describe("index.html — Twitter card", () => {
  it("twitter card / title / description / image are set", () => {
    expect(meta(HTML, "name", "twitter:card")).toBe("summary_large_image");
    expect(meta(HTML, "name", "twitter:title")).toBe("Verdant Grow Diary");
    expect(meta(HTML, "name", "twitter:description")).toBe(DESC);
    expect(meta(HTML, "name", "twitter:image")).toMatch(
      /\/brand\/verdant-logo\.png$/,
    );
  });
});

describe("favicon and manifest", () => {
  it("favicon link points at the brand logo", () => {
    expect(HTML).toMatch(
      /<link\s+rel="icon"[^>]+href="\/brand\/verdant-logo\.png"/,
    );
  });

  it("apple-touch-icon points at the brand logo", () => {
    expect(HTML).toMatch(
      /<link\s+rel="apple-touch-icon"[^>]+href="\/brand\/verdant-logo\.png"/,
    );
  });

  it("links to /site.webmanifest", () => {
    expect(HTML).toMatch(
      /<link\s+rel="manifest"\s+href="\/site\.webmanifest"/,
    );
  });

  it("leaves a TODO for a simplified favicon", () => {
    expect(HTML).toMatch(/TODO\(favicon\)/);
  });

  it("legacy /favicon.ico is no longer shipped", () => {
    expect(existsSync(resolve(root, "public/favicon.ico"))).toBe(false);
  });

  it("site.webmanifest has the expected production fields", () => {
    expect(MANIFEST.name).toBe("Verdant Grow Diary");
    expect(MANIFEST.short_name).toBe("Verdant");
    expect(MANIFEST.start_url).toBe("/");
    expect(MANIFEST.display).toBe("standalone");
    expect(MANIFEST.background_color).toBe("#0d1a12");
    expect(MANIFEST.theme_color).toBe("#0d1a12");
    expect(Array.isArray(MANIFEST.icons)).toBe(true);
    expect(MANIFEST.icons.length).toBeGreaterThan(0);
    for (const icon of MANIFEST.icons) {
      expect(icon.src).toMatch(/^\/brand\//);
      const abs = resolve(root, "public", icon.src.replace(/^\//, ""));
      expect(existsSync(abs)).toBe(true);
    }
  });
});

describe("safety: SEO changes did not expose private data", () => {
  it("landing page still does not query private tables", () => {
    const privateTables = [
      "grows", "plants", "tents", "sensor_readings",
      "alerts", "alert_events", "action_queue", "action_queue_events",
      "diary_entries",
    ];
    for (const t of privateTables) {
      expect(LANDING).not.toMatch(new RegExp(`\\.from\\(["']${t}["']`));
    }
    expect(LANDING).not.toMatch(/@\/integrations\/supabase\/client/);
  });

  it("index.html introduces no service_role / external-control strings", () => {
    expect(HTML).not.toMatch(/service_role/);
    expect(HTML).not.toMatch(/external[-_ ]control/i);
    expect(HTML).not.toMatch(/device[-_ ]command/i);
  });
});
