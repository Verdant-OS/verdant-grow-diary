/**
 * MCP tool schema + safety regression tests.
 *
 * Asserts each of the three MCP tools exposed by
 * `src/lib/mcp/manifestView.ts` has the expected presenter-safe shape:
 *   - stable name / description / read-only annotation
 *   - required/optional parameters we advertise on the settings page
 *   - no secret-like strings anywhere in the manifest view
 *
 * These are structural regressions, not runtime OAuth calls. Real
 * hosted OAuth cannot execute in CI without secrets; the drift test
 * (`mcp-manifest-drift.test.ts`) proves this view stays synced with
 * the plugin-generated manifest, and the pi-ingest/RLS harnesses cover
 * server-side row scoping.
 */
import { describe, it, expect } from "vitest";
import {
  MCP_MANIFEST,
  buildConnectionDetailsText,
  containsSecretLikeValue,
} from "@/lib/mcp/manifestView";

describe("MCP tools — schema regression", () => {
  it("list_grows exposes only optional includeArchived + limit", () => {
    const tool = MCP_MANIFEST.tools.find((t) => t.name === "list_grows");
    expect(tool).toBeDefined();
    expect(tool!.readOnly).toBe(true);
    expect(tool!.params.map((p) => p.name).sort()).toEqual([
      "includeArchived",
      "limit",
    ]);
    expect(tool!.params.every((p) => p.required === false)).toBe(true);
  });

  it("list_recent_diary_entries requires growId only", () => {
    const tool = MCP_MANIFEST.tools.find(
      (t) => t.name === "list_recent_diary_entries",
    );
    expect(tool).toBeDefined();
    expect(tool!.readOnly).toBe(true);
    const required = tool!.params.filter((p) => p.required).map((p) => p.name);
    const optional = tool!.params.filter((p) => !p.required).map((p) => p.name);
    expect(required).toEqual(["growId"]);
    expect(optional).toEqual(["limit"]);
  });

  it("get_latest_sensor_snapshot requires tentId only", () => {
    const tool = MCP_MANIFEST.tools.find(
      (t) => t.name === "get_latest_sensor_snapshot",
    );
    expect(tool).toBeDefined();
    expect(tool!.readOnly).toBe(true);
    expect(tool!.params.map((p) => p.name)).toEqual(["tentId"]);
    expect(tool!.params[0].required).toBe(true);
    // Must mention the source-label rule so agents never treat non-live
    // sources as current readings.
    expect(tool!.description.toLowerCase()).toContain("source");
    expect(tool!.description).toMatch(/live\/manual\/csv\/demo\/stale\/invalid/);
  });

  it("no tool description contains a secret-like value", () => {
    for (const tool of MCP_MANIFEST.tools) {
      expect(containsSecretLikeValue(tool.description)).toBe(false);
      expect(containsSecretLikeValue(tool.name)).toBe(false);
      for (const p of tool.params) {
        expect(containsSecretLikeValue(p.description ?? "")).toBe(false);
      }
    }
  });
});

describe("MCP connection copy payload — no secrets", () => {
  const payload = buildConnectionDetailsText(
    MCP_MANIFEST,
    "https://knkwiiywfkbqznbxwqfh.supabase.co",
    "https://verdantgrowdiary.com",
  );

  it("includes endpoint, consent URL, and every tool name", () => {
    expect(payload).toContain(
      "https://knkwiiywfkbqznbxwqfh.supabase.co/functions/v1/mcp",
    );
    expect(payload).toContain("/.lovable/oauth/consent");
    expect(payload).toContain("list_grows");
    expect(payload).toContain("list_recent_diary_entries");
    expect(payload).toContain("get_latest_sensor_snapshot");
  });

  it("advertises OAuth 2.1 with the direct supabase.co issuer", () => {
    expect(payload).toContain("OAuth 2.1");
    expect(payload).toContain("https://knkwiiywfkbqznbxwqfh.supabase.co/auth/v1");
    expect(payload).not.toMatch(/lovable\.cloud/);
  });

  it("carries the read-only safety statement", () => {
    expect(payload.toLowerCase()).toContain("read-only");
    expect(payload.toLowerCase()).toContain("no action queue");
    expect(payload.toLowerCase()).toContain("no device control");
  });

  it("contains no secret-like values", () => {
    expect(containsSecretLikeValue(payload)).toBe(false);
    // Belt + suspenders: never leak known secret material even if
    // someone accidentally hard-codes it into the view later.
    expect(payload).not.toMatch(/\bBearer\s+/i);
    expect(payload).not.toMatch(/service[_-]?role/i);
    expect(payload).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/); // JWT-shaped
    expect(payload).not.toMatch(/refresh[_-]?token/i);
    expect(payload).not.toMatch(/bridge[_-]?token/i);
    expect(payload).not.toMatch(/client[_-]?secret/i);
  });
});
