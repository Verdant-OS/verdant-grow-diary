import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { getRoutesByAccess } from "@/lib/appRouteManifest";
import {
  readDesktopGrowerNavigationSource,
  readMobileGrowerNavigationSource,
} from "@/test/utils/growerNavigationSource";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const ROUTE = "/operator/post-grow-reflection-dry-run";
const PACKET = read("src/lib/ai/postGrowReflectionReviewPacket.ts");
const EXPORT_HELPERS = read("src/lib/ai/postGrowReflectionReviewPacketExport.ts");
const CARD = read("src/components/PostGrowReflectionReviewPacketCard.tsx");
const VALIDATOR = read("src/components/PostGrowReflectionCandidatePasteValidator.tsx");
const DOCS = read("docs/post-grow-reflection-phase2l.md");
const SIDEBAR = readDesktopGrowerNavigationSource();
const MOBILE_NAV = readMobileGrowerNavigationSource();

describe("Post-Grow Reflection Phase 2L static safety", () => {
  it("keeps all new files free of runtime and persistence surfaces", () => {
    const all = [PACKET, EXPORT_HELPERS, CARD, VALIDATOR, DOCS].join("\n");

    expect(all).not.toMatch(/functions\.invoke|openai|anthropic|gemini/i);
    expect(all).not.toMatch(/fetch\(|axios|XMLHttpRequest|EventSource|WebSocket/i);
    expect(all).not.toMatch(/create table|alter table|enable row level security/i);
    expect(all).not.toMatch(/from\("action_queue"\)|\.insert\(|\.update\(|\.delete\(/i);
    expect(all).not.toMatch(/target_device|raw_payload|service_role|bridge_token/i);
  });

  it("does not add blocked action affordances in product files", () => {
    const interactive = [PACKET, EXPORT_HELPERS, CARD, VALIDATOR].join("\n");

    expect(interactive).not.toMatch(/\bGenerate\b/);
    expect(interactive).not.toMatch(/\bSave\b/);
    expect(interactive).not.toMatch(/\bApply\b/);
    expect(interactive).not.toMatch(/\bSend\b/);
    expect(interactive).not.toMatch(/Create Action/i);
  });

  it("export helpers accept only the sanitized packet, not the raw paste result", () => {
    expect(EXPORT_HELPERS).not.toContain("PostGrowReflectionCandidatePasteResult");
    expect(EXPORT_HELPERS).not.toContain("parseError");
    expect(EXPORT_HELPERS).not.toContain("rawText");
  });

  it("packet builder excludes raw pasted text by not accessing parseError", () => {
    expect(PACKET).not.toContain("result.parseError");
    expect(PACKET).toContain("paragraphPresent");
    expect(PACKET).toContain("itemCount");
  });

  it("card component never receives raw section content", () => {
    // section.paragraphPresent is a safe summary field; section.paragraph (raw body) must not appear
    expect(CARD).not.toMatch(/section\.paragraph[^P]/);
    expect(CARD).not.toContain("section.items");
    expect(CARD).not.toContain("parseError");
  });

  it("keeps the review packet on the operator route and out of grower navigation", () => {
    expect(getRoutesByAccess("operator").some((route) => route.path === ROUTE)).toBe(true);
    expect(getRoutesByAccess("auth").some((route) => route.path === ROUTE)).toBe(false);
    expect(getRoutesByAccess("public").some((route) => route.path === ROUTE)).toBe(false);

    expect(SIDEBAR).not.toContain(ROUTE);
    expect(MOBILE_NAV).not.toContain(ROUTE);
  });

  it("documents the sanitized boundary and required safety properties", () => {
    expect(DOCS).toContain(ROUTE);
    expect(DOCS).toMatch(/sanitized/i);
    expect(DOCS).toMatch(/operator.?only/i);
    expect(DOCS).toMatch(/not saved/i);
    expect(DOCS).toMatch(/no live ai call/i);
    expect(DOCS).toMatch(/excludes raw/i);
  });
});
