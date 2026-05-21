/**
 * Tests for the public Hardware Integrations page.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..", "..");
const readSrc = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const APP = readSrc("App.tsx");
const PAGE = readSrc("pages/HardwareIntegrations.tsx");
const LANDING = readSrc("pages/Landing.tsx");
const FORM = readSrc("components/LeadCaptureForm.tsx");
const SITEMAP = read("public/sitemap.xml");

const PRIVATE_TABLES = [
  "grows",
  "plants",
  "tents",
  "sensor_readings",
  "alerts",
  "alert_events",
  "action_queue",
  "action_queue_events",
  "diary_entries",
  "grow_events",
  "harvests",
  "leads",
];

describe("/hardware-integrations route", () => {
  it("is registered as a public route", () => {
    expect(APP).toMatch(/import\s+HardwareIntegrations\s+from\s+"\.\/pages\/HardwareIntegrations"/);
    expect(APP).toMatch(/path="\/hardware-integrations"\s+element=\{<HardwareIntegrations\s*\/>\}/);
  });
});

describe("Hardware Integrations page copy", () => {
  it("describes Verdant as a hardware-neutral Grow OS", () => {
    expect(PAGE).toMatch(/hardware-neutral/i);
    expect(PAGE).toMatch(/Grow OS/);
  });

  it("states that read-only integrations are valuable", () => {
    expect(PAGE).toMatch(/read-only integrations are valuable/i);
  });

  it("states no blind automation and grower stays in control", () => {
    expect(PAGE).toMatch(/No blind automation/);
    expect(PAGE).toMatch(/grower stays in control/i);
  });

  it("mentions logs, photos, environmental readings, alerts, and AI-assisted insights", () => {
    expect(PAGE).toMatch(/grow logs/i);
    expect(PAGE).toMatch(/photos/i);
    expect(PAGE).toMatch(/environmental readings|environment/i);
    expect(PAGE).toMatch(/alerts/i);
    expect(PAGE).toMatch(/AI-assisted/i);
  });

  it("includes required sections", () => {
    expect(PAGE).toMatch(/Why hardware integrations matter/);
    expect(PAGE).toMatch(/Ideal integration data/);
    expect(PAGE).toMatch(/What Verdant adds/);
    expect(PAGE).toMatch(/Safe integration philosophy/);
    expect(PAGE).toMatch(/Integration paths/);
    expect(PAGE).toMatch(/Partner value/);
  });

  it("mentions every safe integration path", () => {
    for (const p of [
      "Open API",
      "Webhooks",
      "CSV",
      "MQTT",
      "Home Assistant",
      "Raspberry Pi bridge",
      "Manual fallback",
    ]) {
      expect(PAGE).toContain(p);
    }
  });

  it("includes the Hardware partner CTA", () => {
    expect(PAGE).toMatch(/Hardware partner\? Contact Verdant/);
  });
});

describe("Lead capture wiring", () => {
  it("uses LeadCaptureForm with defaultLeadType=hardware_partner", () => {
    expect(PAGE).toMatch(/import\s+LeadCaptureForm/);
    expect(PAGE).toMatch(/<LeadCaptureForm[^>]*defaultLeadType=["']hardware_partner["']/);
  });

  it("LeadCaptureForm supports a defaultLeadType prop including hardware_partner", () => {
    expect(FORM).toMatch(/defaultLeadType/);
    expect(FORM).toMatch(/hardware_partner/);
  });
});

describe("Safety: no private data on public page", () => {
  it("does not query private tables", () => {
    for (const t of PRIVATE_TABLES) {
      expect(PAGE).not.toMatch(new RegExp(`\\.from\\(["']${t}["']`));
    }
  });

  it("does not import supabase client, hooks, or non-auth stores", () => {
    expect(PAGE).not.toMatch(/@\/integrations\/supabase\/client/);
    expect(PAGE).not.toMatch(/@\/hooks\//);
    const storeImports = PAGE.match(/from\s+["']@\/store\/[^"']+["']/g) ?? [];
    for (const imp of storeImports) {
      expect(imp).toMatch(/@\/store\/auth/);
    }
  });

  it("introduces no service_role, external-control, or ai-coach call", () => {
    expect(PAGE).not.toMatch(/service_role/);
    expect(PAGE).not.toMatch(/external[-_ ]control/i);
    expect(PAGE).not.toMatch(/device[-_ ]command/i);
    expect(PAGE).not.toMatch(/functions\.invoke\(["']ai-coach/);
  });

  it("contains no fake live metrics", () => {
    expect(PAGE).not.toMatch(/>\s*\d+\s*%/);
    expect(PAGE).not.toMatch(/\d+\s*°[CF]/);
  });
});

describe("Landing links to /hardware-integrations", () => {
  it("Landing page links to the public hardware integrations route", () => {
    expect(LANDING).toMatch(/to="\/hardware-integrations"/);
  });
});

describe("sitemap", () => {
  it("includes /hardware-integrations", () => {
    expect(SITEMAP).toContain("https://verdantgrowdiary.com/hardware-integrations");
  });

  it("includes /welcome and apex", () => {
    expect(SITEMAP).toContain("https://verdantgrowdiary.com/");
    expect(SITEMAP).toContain("https://verdantgrowdiary.com/welcome");
  });

  it("excludes private/authenticated routes", () => {
    for (const r of [
      "/grows",
      "/plants",
      "/tents",
      "/sensors",
      "/alerts",
      "/actions",
      "/timeline",
      "/logs",
      "/doctor",
      "/settings",
      "/diagnostics",
      "/cameras",
      "/leads",
      "/auth",
    ]) {
      expect(SITEMAP).not.toContain(`https://verdantgrowdiary.com${r}`);
    }
  });
});
