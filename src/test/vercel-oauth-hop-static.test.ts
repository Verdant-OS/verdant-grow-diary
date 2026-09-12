import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");

const LOVABLE_PROJECT_OAUTH_DEST =
  "https://66255e7b-892c-4be5-8686-ab1cfc3666db.lovableproject.com/~oauth/:path*";

interface VercelRedirect {
  source?: unknown;
  destination?: unknown;
  permanent?: unknown;
}

interface VercelRewrite {
  source?: unknown;
  destination?: unknown;
}

const vercelConfig = JSON.parse(readFileSync(resolve(ROOT, "vercel.json"), "utf8")) as {
  redirects?: VercelRedirect[];
  rewrites?: VercelRewrite[];
};

describe("vercel lovable google oauth hop", () => {
  it("redirects /~oauth/:path* to the Lovable project host (non-permanent hop)", () => {
    const matching = (vercelConfig.redirects ?? []).filter(
      (redirect) => redirect.source === "/~oauth/:path*",
    );

    expect(matching).toEqual([
      {
        source: "/~oauth/:path*",
        destination: LOVABLE_PROJECT_OAUTH_DEST,
        permanent: false,
      },
    ]);
  });

  it("excludes ~oauth from the SPA catch-all rewrite so the hop cannot be swallowed", () => {
    const spaRewrites = (vercelConfig.rewrites ?? []).filter(
      (rewrite) => rewrite.destination === "/",
    );

    expect(spaRewrites).toHaveLength(1);
    expect(String(spaRewrites[0]?.source)).toMatch(/\(\(\?!assets\/\|~oauth\)\.\*\)/);
    expect(String(spaRewrites[0]?.source)).toContain("~oauth");
    expect(String(spaRewrites[0]?.source)).not.toBe("/((?!assets/).*)");
  });
});
