/**
 * Pins the browser origins mcp-js 3.x will accept. Any other browser Origin
 * is rejected with HTTP 403. The list is exact https origins only.
 */
import { describe, expect, it, vi } from "vitest";

const defineMcp = vi.hoisted(() => vi.fn((definition: unknown) => definition));

vi.mock("@lovable.dev/mcp-js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lovable.dev/mcp-js")>();
  return { ...actual, defineMcp };
});

import mcpServer, { MCP_ALLOWED_ORIGINS } from "@/lib/mcp";

const EXACT_ORIGINS = [
  "https://verdantgrowdiary.com",
  "https://www.verdantgrowdiary.com",
  "https://id-preview--66255e7b-892c-4be5-8686-ab1cfc3666db.lovable.app",
  "https://66255e7b-892c-4be5-8686-ab1cfc3666db.lovableproject.com",
] as const;

describe("MCP_ALLOWED_ORIGINS", () => {
  it("is the exact https-only list, with no wildcard and no retired lovable.app host", () => {
    expect(MCP_ALLOWED_ORIGINS).toEqual(EXACT_ORIGINS);
    for (const origin of MCP_ALLOWED_ORIGINS) {
      expect(origin.startsWith("https://")).toBe(true);
      expect(origin.includes("*")).toBe(false);
      expect(origin.toLowerCase()).not.toBe("any");
      expect(origin).not.toContain("verdantgrowdiary-com.lovable.app");
    }
  });

  it("passes that list to defineMcp as allowedOrigins", () => {
    expect(defineMcp).toHaveBeenCalledTimes(1);
    expect(defineMcp).toHaveBeenCalledWith(
      expect.objectContaining({ allowedOrigins: MCP_ALLOWED_ORIGINS }),
    );
    expect(mcpServer).toEqual(expect.objectContaining({ allowedOrigins: MCP_ALLOWED_ORIGINS }));
  });
});
