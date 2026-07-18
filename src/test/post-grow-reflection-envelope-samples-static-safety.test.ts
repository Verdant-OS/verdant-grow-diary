import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getRoutesByAccess } from "@/lib/appRouteManifest";
import {
  readDesktopGrowerNavigationSource,
  readMobileGrowerNavigationSource,
} from "@/test/utils/growerNavigationSource";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const ROUTE = "/operator/post-grow-reflection-dry-run";
const SAMPLES = read("src/lib/ai/postGrowReflectionEnvelopeSamples.ts");
const COMPONENT = read("src/components/PostGrowReflectionCandidatePasteValidator.tsx");
const DOCS = read("docs/post-grow-reflection-phase2j.md");
const SIDEBAR = readDesktopGrowerNavigationSource();
const MOBILE_NAV = readMobileGrowerNavigationSource();

describe("Post-Grow Reflection envelope sample loader static safety", () => {
  it("keeps samples deterministic, local, and free of runtime surfaces", () => {
    const all = [SAMPLES, COMPONENT, DOCS].join("\n");

    expect(all).not.toMatch(
      /functions\.invoke|fetch\(|axios|XMLHttpRequest|EventSource|WebSocket/i,
    );
    expect(all).not.toMatch(/create table|alter table|enable row level security/i);
    expect(all).not.toMatch(/from\("action_queue"\)|\.insert\(|\.update\(|\.delete\(/i);
    expect(all).not.toMatch(/target_device|raw_payload|service_role|bridge_token/i);
  });

  it("does not add blocked action affordances", () => {
    const interactive = [SAMPLES, COMPONENT].join("\n");
    expect(interactive).not.toMatch(/\bGenerate\b/);
    expect(interactive).not.toMatch(/\bSave\b/);
    expect(interactive).not.toMatch(/\bApply\b/);
    expect(interactive).not.toMatch(/\bSend\b/);
    expect(interactive).not.toMatch(/Create Action/i);
  });

  it("keeps sample loading operator-only and out of grower navigation", () => {
    expect(getRoutesByAccess("operator").some((route) => route.path === ROUTE)).toBe(true);
    expect(getRoutesByAccess("auth").some((route) => route.path === ROUTE)).toBe(false);
    expect(getRoutesByAccess("public").some((route) => route.path === ROUTE)).toBe(false);

    expect(SIDEBAR).not.toContain(ROUTE);
    expect(MOBILE_NAV).not.toContain(ROUTE);
    expect(SIDEBAR).not.toMatch(/envelope sample/i);
    expect(MOBILE_NAV).not.toMatch(/envelope sample/i);
  });

  it("documents the sample-only boundary", () => {
    expect(DOCS).toContain(ROUTE);
    expect(DOCS).toMatch(/operator-only/i);
    expect(DOCS).toMatch(/local/i);
    expect(DOCS).toMatch(/sample/i);
    expect(DOCS).toMatch(/no provider call/i);
    expect(DOCS).toMatch(/not saved/i);
  });
});
