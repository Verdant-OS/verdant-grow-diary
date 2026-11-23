import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { redirectResponseFor, resolveHostRouting } from "@/lib/cloudflareHostRoutingRules";
import { HelpCenterContent } from "@/lib/helpCenterContent";

const SITEMAP = readFileSync(resolve(__dirname, "../../public/sitemap.xml"), "utf8");

function decision(pathname: string) {
  return resolveHostRouting({ pathname, search: "" });
}

describe("help center host redirects", () => {
  it("keeps /docs/mcp-api and its trailing slash on the document", () => {
    expect(decision("/docs/mcp-api")).toMatchObject({ kind: "continue", location: null });
    expect(decision("/docs/mcp-api/")).toMatchObject({ kind: "continue", location: null });
    expect(
      redirectResponseFor(new Request("https://verdantgrowdiary.com/docs/mcp-api")),
    ).toBeNull();
  });

  it("sends the exact help aliases with 308", () => {
    expect(decision("/docs")).toMatchObject({ kind: "redirect", status: 308, location: "/help" });
    expect(decision("/docs/")).toMatchObject({ kind: "redirect", status: 308, location: "/help" });
    expect(decision("/support")).toMatchObject({
      kind: "redirect",
      status: 308,
      location: "/help",
    });
    expect(decision("/support/")).toMatchObject({
      kind: "redirect",
      status: 308,
      location: "/help",
    });
    expect(decision("/help/developers/mcp-tools")).toMatchObject({
      kind: "redirect",
      status: 308,
      location: "/docs/mcp-api",
    });
  });

  it("does not redirect unknown docs paths or /faq", () => {
    expect(decision("/docs/foo").kind).toBe("continue");
    expect(decision("/docs/mcp-api/x").kind).toBe("continue");
    expect(decision("/faq").kind).toBe("continue");
  });
});

describe("help sitemap", () => {
  it("lists the help home, the nine hubs, and the MCP API reference", () => {
    for (const path of HelpCenterContent.paths()) {
      expect(SITEMAP).toContain(`<loc>https://verdantgrowdiary.com${path}</loc>`);
    }
    expect(SITEMAP).toContain("<loc>https://verdantgrowdiary.com/docs/mcp-api</loc>");
  });
});
