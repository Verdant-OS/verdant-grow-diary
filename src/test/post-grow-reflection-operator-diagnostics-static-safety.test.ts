import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getRoutesByAccess } from "@/lib/appRouteManifest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const ROUTE = "/operator/post-grow-reflection-dry-run";
const APP = read("src/App.tsx");
const MANIFEST = read("src/lib/appRouteManifest.ts");
const PAGE = read("src/pages/OperatorPostGrowReflectionDryRun.tsx");
const VIEW_MODEL = read("src/lib/ai/postGrowReflectionOperatorDiagnosticsViewModel.ts");
const DOCS = read("docs/post-grow-reflection-phase2e.md");

describe("Post-Grow Reflection operator diagnostics static safety", () => {
  it("registers only the operator route and manifest entry", () => {
    expect(APP).toContain(`path="${ROUTE}"`);
    expect(MANIFEST).toContain(`path: "${ROUTE}", access: "operator"`);
    expect(getRoutesByAccess("operator").some((route) => route.path === ROUTE)).toBe(true);
    expect(getRoutesByAccess("auth").some((route) => route.path === ROUTE)).toBe(false);
    expect(getRoutesByAccess("public").some((route) => route.path === ROUTE)).toBe(false);
  });

  it("does not expose the diagnostics route in grower-facing navigation", () => {
    const sidebar = read("src/components/AppSidebar.tsx");
    const mobileNav = read("src/components/MobileNav.tsx");

    expect(sidebar).not.toContain(ROUTE);
    expect(mobileNav).not.toContain(ROUTE);
    expect(sidebar).not.toMatch(/Post-Grow Reflection Dry-Run/i);
    expect(mobileNav).not.toMatch(/Post-Grow Reflection Dry-Run/i);
  });

  it("does not add runtime provider, persistence, schema, or device-control surfaces", () => {
    const all = [PAGE, VIEW_MODEL, DOCS].join("\n");

    expect(all).not.toMatch(/supabase|functions\.invoke|openai|anthropic|gemini/i);
    expect(all).not.toMatch(/create table|alter table|enable row level security/i);
    expect(all).not.toMatch(/from\("action_queue"\)|insert\(|update\(|delete\(/i);
    expect(all).not.toMatch(/target_device|raw_payload|service_role|bridge_token/i);
    expect(all).not.toMatch(/fetch\(|axios|XMLHttpRequest|EventSource|WebSocket/i);
  });

  it("documents the operator-only and read-only boundary", () => {
    expect(DOCS).toContain(ROUTE);
    expect(DOCS).toMatch(/operator-only diagnostics page/i);
    expect(DOCS).toMatch(/must not be added to normal grower navigation/i);
    expect(VIEW_MODEL).toMatch(/Do not call a model or provider/i);
  });
});
