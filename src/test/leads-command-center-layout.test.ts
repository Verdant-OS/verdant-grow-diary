/**
 * Tests for the read-only Leads Command Center layout rules.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  DEFAULT_SECTION_ORDER,
  LEAD_COMMAND_CENTER_LAYOUT_STORAGE_KEY,
  defaultLeadCommandCenterLayout,
  loadLeadCommandCenterLayout,
  sanitizeLeadCommandCenterLayout,
  saveLeadCommandCenterLayout,
  serializeLeadCommandCenterLayout,
  toggleSectionCollapsed,
  type LayoutStorage,
} from "@/lib/leadCommandCenterLayoutRules";

const readSrc = (p: string) =>
  readFileSync(resolve(__dirname, "..", p), "utf8");
const RULES = readSrc("lib/leadCommandCenterLayoutRules.ts");
const COMPONENT = readSrc("components/LeadCommandCenterLayoutControls.tsx");
const PAGE = readSrc("pages/Leads.tsx");

function memStorage(initial?: Record<string, string>): LayoutStorage & {
  data: Record<string, string>;
} {
  const data: Record<string, string> = { ...(initial ?? {}) };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe("leadCommandCenterLayoutRules — safety", () => {
  it("rules module has no Supabase / network calls", () => {
    expect(RULES).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(RULES).not.toMatch(/fetch\s*\(/);
    expect(RULES).not.toMatch(/service_role/);
  });

  it("serialized payload contains only id/collapsed/order keys", () => {
    const json = serializeLeadCommandCenterLayout(
      defaultLeadCommandCenterLayout(),
    );
    const parsed = JSON.parse(json);
    for (const s of parsed.sections) {
      expect(Object.keys(s).sort()).toEqual(["collapsed", "id", "order"]);
    }
  });

  it("never persists lead data fields (no email/name/notes keys)", () => {
    const layout = defaultLeadCommandCenterLayout();
    const json = serializeLeadCommandCenterLayout(layout);
    expect(json).not.toMatch(/email|name|notes|phone|message|lead_type|source|created_at/i);
  });

  it("is wired into Leads page", () => {
    expect(PAGE).toMatch(/LeadCommandCenter(Layout|Section)/);
  });

  it("component is presenter-only", () => {
    expect(COMPONENT).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(COMPONENT).not.toMatch(/fetch\s*\(/);
  });
});

describe("layout defaults & sanitization", () => {
  it("default order is deterministic and contains all known sections", () => {
    const a = defaultLeadCommandCenterLayout();
    const b = defaultLeadCommandCenterLayout();
    expect(a.sections.map((s) => s.id)).toEqual([...DEFAULT_SECTION_ORDER]);
    expect(a).toEqual(b);
    expect(a.sections.every((s) => s.collapsed === false)).toBe(true);
  });

  it("malformed localStorage falls back to defaults", () => {
    const s = memStorage({
      [LEAD_COMMAND_CENTER_LAYOUT_STORAGE_KEY]: "{not json",
    });
    expect(loadLeadCommandCenterLayout(s)).toEqual(
      defaultLeadCommandCenterLayout(),
    );
  });

  it("empty localStorage falls back to defaults", () => {
    expect(loadLeadCommandCenterLayout(memStorage())).toEqual(
      defaultLeadCommandCenterLayout(),
    );
  });

  it("drops unknown section ids", () => {
    const out = sanitizeLeadCommandCenterLayout({
      sections: [
        { id: "guidance", collapsed: true, order: 0 },
        { id: "totally_fake", collapsed: true, order: 1 },
      ],
    });
    expect(out.sections.some((s) => s.id === ("totally_fake" as never))).toBe(
      false,
    );
  });

  it("removes duplicate section ids (first wins)", () => {
    const out = sanitizeLeadCommandCenterLayout({
      sections: [
        { id: "guidance", collapsed: true, order: 0 },
        { id: "guidance", collapsed: false, order: 1 },
      ],
    });
    const guidance = out.sections.filter((s) => s.id === "guidance");
    expect(guidance.length).toBe(1);
    expect(guidance[0].collapsed).toBe(true);
  });

  it("repairs missing sections by appending in default order", () => {
    const out = sanitizeLeadCommandCenterLayout({
      sections: [{ id: "analytics", collapsed: false, order: 0 }],
    });
    const ids = out.sections.map((s) => s.id);
    expect(ids[0]).toBe("analytics");
    for (const id of DEFAULT_SECTION_ORDER) expect(ids).toContain(id);
    // order indices are contiguous
    expect(out.sections.map((s) => s.order)).toEqual(
      out.sections.map((_, i) => i),
    );
  });

  it("toggle collapse is pure and round-trips", () => {
    const a = defaultLeadCommandCenterLayout();
    const b = toggleSectionCollapsed(a, "guidance");
    expect(a.sections.find((s) => s.id === "guidance")?.collapsed).toBe(false);
    expect(b.sections.find((s) => s.id === "guidance")?.collapsed).toBe(true);
    const c = toggleSectionCollapsed(b, "guidance");
    expect(c.sections.find((s) => s.id === "guidance")?.collapsed).toBe(false);
  });

  it("save + load round-trips collapsed state deterministically", () => {
    const s = memStorage();
    const toggled = toggleSectionCollapsed(
      defaultLeadCommandCenterLayout(),
      "analytics",
    );
    saveLeadCommandCenterLayout(toggled, s);
    const loaded = loadLeadCommandCenterLayout(s);
    expect(loaded.sections.find((x) => x.id === "analytics")?.collapsed).toBe(
      true,
    );
    const loaded2 = loadLeadCommandCenterLayout(s);
    expect(loaded).toEqual(loaded2);
  });

  it("sanitize is deterministic for the same input", () => {
    const input = {
      sections: [
        { id: "priority_queue", collapsed: true, order: 2 },
        { id: "guidance", collapsed: false, order: 0 },
      ],
    };
    expect(sanitizeLeadCommandCenterLayout(input)).toEqual(
      sanitizeLeadCommandCenterLayout(input),
    );
  });

  it("non-object payloads yield defaults", () => {
    expect(sanitizeLeadCommandCenterLayout(null)).toEqual(
      defaultLeadCommandCenterLayout(),
    );
    expect(sanitizeLeadCommandCenterLayout(42)).toEqual(
      defaultLeadCommandCenterLayout(),
    );
    expect(sanitizeLeadCommandCenterLayout({ sections: "x" })).toEqual(
      defaultLeadCommandCenterLayout(),
    );
  });
});
