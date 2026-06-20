import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getRoutesByAccess } from "@/lib/appRouteManifest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const ROUTE = "/operator/post-grow-reflection-dry-run";
const RULES = read("src/lib/ai/postGrowReflectionCandidatePasteValidator.ts");
const COMPONENT = read("src/components/PostGrowReflectionCandidatePasteValidator.tsx");
const PAGE = read("src/pages/OperatorPostGrowReflectionDryRun.tsx");
const DOCS = read("docs/post-grow-reflection-phase2g.md");
const SIDEBAR = read("src/components/AppSidebar.tsx");
const MOBILE_NAV = read("src/components/MobileNav.tsx");

describe("Post-Grow Reflection candidate paste validator static safety", () => {
  it("does not introduce provider, DB, schema, network, or device-control surfaces", () => {
    const all = [RULES, COMPONENT, PAGE, DOCS].join("\n");

    expect(all).not.toMatch(/supabase|functions\.invoke|openai|anthropic|gemini/i);
    expect(all).not.toMatch(/create table|alter table|enable row level security/i);
    expect(all).not.toMatch(/from\("action_queue"\)|\.insert\(|\.update\(|\.delete\(/i);
    expect(all).not.toMatch(/target_device|raw_payload|service_role|bridge_token/i);
    expect(all).not.toMatch(/fetch\(|axios|XMLHttpRequest|EventSource|WebSocket/i);
  });

  it("does not surface blocked action affordances", () => {
    const interactive = [RULES, COMPONENT, PAGE].join("\n");
    expect(interactive).not.toMatch(/\bGenerate\b/);
    expect(interactive).not.toMatch(/\bSave\b/);
    expect(interactive).not.toMatch(/\bApply\b/);
    expect(interactive).not.toMatch(/\bSend\b/);
    expect(interactive).not.toMatch(/Create Action/i);
  });

  it("keeps the validator on the operator route and out of grower navigation", () => {
    expect(getRoutesByAccess("operator").some((route) => route.path === ROUTE)).toBe(true);
    expect(getRoutesByAccess("auth").some((route) => route.path === ROUTE)).toBe(false);
    expect(getRoutesByAccess("public").some((route) => route.path === ROUTE)).toBe(false);

    expect(SIDEBAR).not.toContain(ROUTE);
    expect(MOBILE_NAV).not.toContain(ROUTE);
    expect(SIDEBAR).not.toMatch(/Candidate Paste Validator/i);
    expect(MOBILE_NAV).not.toMatch(/Candidate Paste Validator/i);
  });

  it("documents the manual, local, read-only boundary", () => {
    expect(DOCS).toContain(ROUTE);
    expect(DOCS).toMatch(/manual paste/i);
    expect(DOCS).toMatch(/operator-only/i);
    expect(DOCS).toMatch(/not saved/i);
    expect(DOCS).toMatch(/no live ai call/i);
  });
});
