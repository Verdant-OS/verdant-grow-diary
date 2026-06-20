import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getRoutesByAccess } from "@/lib/appRouteManifest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const ROUTE = "/operator/post-grow-reflection-dry-run";
const VIEW_MODEL = read("src/lib/ai/postGrowReflectionPreviewViewModel.ts");
const CARD = read("src/components/PostGrowReflectionPreviewCard.tsx");
const PAGE = read("src/pages/OperatorPostGrowReflectionDryRun.tsx");
const DOCS = read("docs/post-grow-reflection-phase2f.md");
const SIDEBAR = read("src/components/AppSidebar.tsx");
const MOBILE_NAV = read("src/components/MobileNav.tsx");

describe("Post-Grow Reflection preview static safety", () => {
  it("does not introduce runtime provider, DB, schema, or device-control surfaces", () => {
    const all = [VIEW_MODEL, CARD, PAGE, DOCS].join("\n");

    expect(all).not.toMatch(/supabase|functions\.invoke|openai|anthropic|gemini/i);
    expect(all).not.toMatch(/create table|alter table|enable row level security/i);
    expect(all).not.toMatch(/from\("action_queue"\)|\.insert\(|\.update\(|\.delete\(/i);
    expect(all).not.toMatch(/target_device|raw_payload|service_role|bridge_token/i);
    expect(all).not.toMatch(/fetch\(|axios|XMLHttpRequest|EventSource|WebSocket/i);
  });

  it("does not surface a Generate/Save/Apply/Send/Create Action affordance", () => {
    const all = [VIEW_MODEL, CARD, PAGE].join("\n");
    expect(all).not.toMatch(/\bGenerate\b/);
    expect(all).not.toMatch(/\bSave\b/);
    expect(all).not.toMatch(/\bApply\b/);
    expect(all).not.toMatch(/\bSend\b/);
    expect(all).not.toMatch(/Create Action/i);
  });

  it("keeps the preview route operator-only and out of grower navigation", () => {
    expect(getRoutesByAccess("operator").some((route) => route.path === ROUTE)).toBe(true);
    expect(getRoutesByAccess("auth").some((route) => route.path === ROUTE)).toBe(false);
    expect(getRoutesByAccess("public").some((route) => route.path === ROUTE)).toBe(false);

    expect(SIDEBAR).not.toContain(ROUTE);
    expect(MOBILE_NAV).not.toContain(ROUTE);
    expect(SIDEBAR).not.toMatch(/Post-Grow Reflection Preview/i);
    expect(MOBILE_NAV).not.toMatch(/Post-Grow Reflection Preview/i);
  });

  it("documents the fixture-only, read-only operator boundary", () => {
    expect(DOCS).toContain(ROUTE);
    expect(DOCS).toMatch(/operator-only/i);
    expect(DOCS).toMatch(/fixture/i);
    expect(DOCS).toMatch(/not saved/i);
    expect(DOCS).toMatch(/no live ai call/i);
  });
});
