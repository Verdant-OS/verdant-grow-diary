import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ASSET_CACHE_CONTROL,
  CLOUDFLARE_WORKERS_RUNTIME,
  GLOBAL_SECURITY_HEADERS,
  LOVABLE_OAUTH_ORIGIN,
  SEO_SNAPSHOT_ENV,
  SEO_SNAPSHOT_HEADER,
  SEO_SNAPSHOT_HEADER_VALUE,
  SPA_CATCH_ALL_REWRITE,
  UNSUBSCRIBE_HEADERS,
  hostHeadersForPathname,
  isSpaCatchAllExcluded,
  redirectResponseFor,
  resolveHostRouting,
  withHostHeaders,
  workerRoutingEnv,
} from "@/lib/cloudflareHostRoutingRules";
import {
  CONTENT_SECURITY_POLICY_REPORT_ONLY_HEADER,
  buildContentSecurityPolicyReportOnly,
} from "@/lib/securityHeadersRules";
import worker from "../server";

const ROOT = resolve(__dirname, "../..");

interface VercelRedirect {
  source?: unknown;
  destination?: unknown;
  permanent?: unknown;
}

interface VercelHeaderRule {
  source?: unknown;
  headers?: Array<{ key?: unknown; value?: unknown }>;
}

interface VercelRewrite {
  source?: unknown;
  destination?: unknown;
}

const vercel = JSON.parse(readFileSync(resolve(ROOT, "vercel.json"), "utf8")) as {
  redirects?: VercelRedirect[];
  headers?: VercelHeaderRule[];
  rewrites?: VercelRewrite[];
};

const EXACT_PERMANENT_REDIRECTS = [
  ["/strains", "/cultivars"],
  ["/features", "/welcome"],
  ["/demo", "/welcome"],
  ["/refunds", "/refund"],
  ["/refund-policy", "/refund"],
  ["/terms-of-service", "/terms"],
  ["/privacy-policy", "/privacy"],
] as const;

function headerValue(headers: Headers, name: string): string | null {
  return headers.get(name);
}

describe("cloudflare host routing mirrors vercel.json", () => {
  it("ports every vercel.json redirect with the same destination and permanence", () => {
    const redirects = vercel.redirects ?? [];
    expect(redirects).toHaveLength(9);

    for (const [source, destination] of EXACT_PERMANENT_REDIRECTS) {
      expect(redirects).toContainEqual({ source, destination, permanent: true });
      const decision = resolveHostRouting({ pathname: source, search: "" });
      expect(decision).toEqual({
        kind: "redirect",
        status: 308,
        location: destination,
        headers: hostHeadersForPathname(source),
      });
    }

    expect(redirects).toContainEqual({
      source: "/~oauth/:path*",
      destination: `${LOVABLE_OAUTH_ORIGIN}/~oauth/:path*`,
      permanent: false,
    });
    expect(redirects).toContainEqual({
      source: "/strains/:slug",
      destination: "/cultivars/:slug",
      permanent: true,
    });
  });

  it("ports every vercel.json header rule", () => {
    const rules = vercel.headers ?? [];
    expect(rules.map((rule) => rule.source)).toEqual(["/(.*)", "/unsubscribe", "/assets/(.*)"]);

    expect(rules[0]?.headers).toEqual(
      GLOBAL_SECURITY_HEADERS.map(([key, value]) => ({ key, value })),
    );
    expect(rules[1]?.headers).toEqual(UNSUBSCRIBE_HEADERS.map(([key, value]) => ({ key, value })));
    expect(rules[2]?.headers).toEqual([{ key: "Cache-Control", value: ASSET_CACHE_CONTROL }]);
  });

  it("keeps the oauth hop and assets out of the SPA catch-all without rewriting SSR routes to /", () => {
    expect(vercel.rewrites).toEqual([
      { source: SPA_CATCH_ALL_REWRITE.source, destination: SPA_CATCH_ALL_REWRITE.destination },
    ]);
    expect(SPA_CATCH_ALL_REWRITE.source).toBe("/((?!assets/|~oauth).*)");
    expect(SPA_CATCH_ALL_REWRITE.destination).toBe("/");

    expect(isSpaCatchAllExcluded("/~oauth")).toBe(true);
    expect(isSpaCatchAllExcluded("/~oauth/initiate")).toBe(true);
    expect(isSpaCatchAllExcluded("/assets/app.js")).toBe(true);
    expect(isSpaCatchAllExcluded("/welcome")).toBe(false);

    const welcome = resolveHostRouting({ pathname: "/welcome", search: "" });
    expect(welcome.kind).toBe("continue");
    if (welcome.kind === "continue") {
      expect(welcome.spaRewriteMatched).toBe(true);
      expect(welcome.location).toBeNull();
    }
  });
});

describe("oauth hop", () => {
  it("temporarily redirects /~oauth/* to the Lovable project host and keeps the query", () => {
    const decision = resolveHostRouting({
      pathname: "/~oauth/initiate",
      search: "?provider=google&redirect_uri=https%3A%2F%2Fverdantgrowdiary.com%2Fauth",
    });

    expect(decision.kind).toBe("redirect");
    if (decision.kind !== "redirect") return;
    expect(decision.status).toBe(307);
    expect(decision.location).toBe(
      `${LOVABLE_OAUTH_ORIGIN}/~oauth/initiate?provider=google&redirect_uri=https%3A%2F%2Fverdantgrowdiary.com%2Fauth`,
    );
    expect(new URL(decision.location).origin).toBe(LOVABLE_OAUTH_ORIGIN);
  });

  it("redirects a bare /~oauth hop and preserves a trailing slash", () => {
    expect(resolveHostRouting({ pathname: "/~oauth", search: "" })).toMatchObject({
      kind: "redirect",
      status: 307,
      location: `${LOVABLE_OAUTH_ORIGIN}/~oauth`,
    });
    expect(resolveHostRouting({ pathname: "/~oauth/", search: "" })).toMatchObject({
      kind: "redirect",
      status: 307,
      location: `${LOVABLE_OAUTH_ORIGIN}/~oauth/`,
    });
  });

  it("does not let a dot-segment hop escape the Lovable /~oauth prefix", () => {
    for (const pathname of [
      "/~oauth/..",
      "/~oauth/../evil",
      "/~oauth/./secret",
      "/~oauth//double",
    ]) {
      const decision = resolveHostRouting({ pathname, search: "" });
      expect(decision.kind).toBe("continue");
    }
  });

  it("worker fetch returns the oauth hop before the app handler runs", async () => {
    const response = await worker.fetch(
      new Request("https://verdantgrowdiary.com/~oauth/initiate?provider=google"),
      {},
      {},
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `${LOVABLE_OAUTH_ORIGIN}/~oauth/initiate?provider=google`,
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("drops a header-breaking query instead of reflecting it into Location", () => {
    const decision = resolveHostRouting({
      pathname: "/~oauth/initiate",
      search: "?code=1\r\nSet-Cookie: a=b",
    });
    expect(decision).toMatchObject({
      kind: "redirect",
      status: 307,
      location: `${LOVABLE_OAUTH_ORIGIN}/~oauth/initiate`,
    });
  });
});

describe("legacy permanent redirects", () => {
  it("permanently redirects /strains/:slug and keeps the query", () => {
    const decision = resolveHostRouting({
      pathname: "/strains/blue-dream",
      search: "?source=legacy",
    });
    expect(decision).toMatchObject({
      kind: "redirect",
      status: 308,
      location: "/cultivars/blue-dream?source=legacy",
    });
  });

  it("encodes a slug segment and refuses dot segments", () => {
    expect(resolveHostRouting({ pathname: "/strains/blue dream", search: "" })).toMatchObject({
      kind: "redirect",
      status: 308,
      location: "/cultivars/blue%20dream",
    });
    expect(resolveHostRouting({ pathname: "/strains/..", search: "?x=1" })).toMatchObject({
      kind: "redirect",
      status: 308,
      location: "/cultivars?x=1",
    });
    expect(resolveHostRouting({ pathname: "/strains/foo/bar", search: "" }).kind).toBe("continue");
  });

  it("returns null for missing, relative, or header-breaking pathnames", () => {
    expect(resolveHostRouting({ pathname: null, search: "" }).kind).toBe("continue");
    expect(resolveHostRouting({ pathname: "strains", search: "" }).kind).toBe("continue");
    expect(resolveHostRouting({ pathname: "/strains\r\n", search: "" }).kind).toBe("continue");
    expect(resolveHostRouting({ pathname: undefined, search: null }).kind).toBe("continue");
  });
});

describe("response headers", () => {
  it("applies the global security headers on a normal page", () => {
    const headers = hostHeadersForPathname("/");
    expect(headers).toEqual([
      ...GLOBAL_SECURITY_HEADERS,
      [CONTENT_SECURITY_POLICY_REPORT_ONLY_HEADER, buildContentSecurityPolicyReportOnly()],
    ]);
    expect(headers).toContainEqual(["X-Content-Type-Options", "nosniff"]);
    expect(headers).toContainEqual([
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    ]);
    const names = headers.map(([name]) => name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain("content-security-policy");
  });

  it("gives /unsubscribe no-store, no-referrer, and noindex over the global referrer policy", () => {
    const headers = new Headers(hostHeadersForPathname("/unsubscribe"));
    expect(headerValue(headers, "Cache-Control")).toBe("no-store");
    expect(headerValue(headers, "Referrer-Policy")).toBe("no-referrer");
    expect(headerValue(headers, "X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    expect(headerValue(headers, "X-Content-Type-Options")).toBe("nosniff");
    expect(headerValue(headers, "Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
    expect(headerValue(headers, CONTENT_SECURITY_POLICY_REPORT_ONLY_HEADER)).toBe(
      buildContentSecurityPolicyReportOnly(),
    );
    expect(headerValue(headers, "Content-Security-Policy")).toBeNull();
  });

  it("marks hashed assets immutable without dropping the security headers", () => {
    const headers = new Headers(hostHeadersForPathname("/assets/app-abc123.js"));
    expect(headerValue(headers, "Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(headerValue(headers, "X-Frame-Options")).toBe("SAMEORIGIN");
    expect(headerValue(headers, "Permissions-Policy")).toBe(
      "geolocation=(), camera=(), microphone=(), payment=()",
    );
  });

  it("writes the same headers onto a continued response and a redirect response", () => {
    const continued = withHostHeaders(
      new Request("https://verdantgrowdiary.com/unsubscribe?token=abc"),
      new Response("ok", { status: 200, headers: { "content-type": "text/html" } }),
    );
    expect(continued.status).toBe(200);
    expect(continued.headers.get("content-type")).toBe("text/html");
    expect(continued.headers.get("cache-control")).toBe("no-store");
    expect(continued.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    expect(continued.headers.get("referrer-policy")).toBe("no-referrer");

    const redirect = redirectResponseFor(
      new Request("https://verdantgrowdiary.com/refund-policy?from=footer"),
    );
    expect(redirect).not.toBeNull();
    expect(redirect?.status).toBe(308);
    expect(redirect?.headers.get("location")).toBe("/refund?from=footer");
    expect(redirect?.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("skips a permanent alias redirect only for the build snapshot env and header", () => {
    const snapshotEnv = { [SEO_SNAPSHOT_ENV]: SEO_SNAPSHOT_HEADER_VALUE };
    const strains = redirectResponseFor(
      new Request("https://verdantgrowdiary.com/strains/blue-dream", {
        headers: { [SEO_SNAPSHOT_HEADER]: SEO_SNAPSHOT_HEADER_VALUE },
      }),
      snapshotEnv,
    );
    expect(strains).toBeNull();

    const refund = redirectResponseFor(
      new Request("https://verdantgrowdiary.com/refund-policy", {
        headers: { [SEO_SNAPSHOT_HEADER]: SEO_SNAPSHOT_HEADER_VALUE },
      }),
      snapshotEnv,
    );
    expect(refund).toBeNull();

    const headerAlone = redirectResponseFor(
      new Request("https://verdantgrowdiary.com/strains/blue-dream", {
        headers: { [SEO_SNAPSHOT_HEADER]: SEO_SNAPSHOT_HEADER_VALUE },
      }),
    );
    expect(headerAlone?.status).toBe(308);
    expect(headerAlone?.headers.get("location")).toBe("/cultivars/blue-dream");

    const envAlone = redirectResponseFor(
      new Request("https://verdantgrowdiary.com/refund-policy"),
      snapshotEnv,
    );
    expect(envAlone?.status).toBe(308);

    const previousUserAgent = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      get: () => CLOUDFLARE_WORKERS_RUNTIME,
    });
    try {
      const refused = redirectResponseFor(
        new Request("https://verdantgrowdiary.com/strains/blue-dream", {
          headers: { [SEO_SNAPSHOT_HEADER]: SEO_SNAPSHOT_HEADER_VALUE },
        }),
        snapshotEnv,
      );
      expect(refused?.status).toBe(308);
      expect(refused?.headers.get("location")).toBe("/cultivars/blue-dream");
    } finally {
      Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        get: () => previousUserAgent,
      });
    }

    const oauth = redirectResponseFor(
      new Request("https://verdantgrowdiary.com/~oauth/initiate?provider=google", {
        headers: { [SEO_SNAPSHOT_HEADER]: SEO_SNAPSHOT_HEADER_VALUE },
      }),
      snapshotEnv,
    );
    expect(oauth?.status).toBe(307);
    expect(oauth?.headers.get("location")).toBe(
      `${LOVABLE_OAUTH_ORIGIN}/~oauth/initiate?provider=google`,
    );
  });

  it("reads the snapshot env from globalThis.__env__ when Nitro omits the fetch argument", () => {
    const holder = globalThis as { __env__?: unknown };
    const previous = holder.__env__;
    holder.__env__ = { [SEO_SNAPSHOT_ENV]: SEO_SNAPSHOT_HEADER_VALUE };
    try {
      const skipped = redirectResponseFor(
        new Request("https://verdantgrowdiary.com/strains", {
          headers: { [SEO_SNAPSHOT_HEADER]: SEO_SNAPSHOT_HEADER_VALUE },
        }),
        workerRoutingEnv(undefined),
      );
      expect(skipped).toBeNull();
      expect(workerRoutingEnv({})).toEqual({ [SEO_SNAPSHOT_ENV]: SEO_SNAPSHOT_HEADER_VALUE });
    } finally {
      if (previous === undefined) delete holder.__env__;
      else holder.__env__ = previous;
    }
  });

  it("worker fetch keeps the permanent redirect when only the snapshot header is sent", async () => {
    const response = await worker.fetch(
      new Request("https://verdantgrowdiary.com/refund-policy", {
        headers: { [SEO_SNAPSHOT_HEADER]: SEO_SNAPSHOT_HEADER_VALUE },
      }),
      {},
      {},
    );
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/refund");
  });

  // @source-scan-justified: the capture script is a bun process over the built
  // bundle, so this pins the retry call; the Worker behavior is asserted above.
  it("pins the SEO capture retry so a 308 alias document is re-requested once", () => {
    const capture = readFileSync(
      resolve(ROOT, "scripts/capture-ssr-head-snapshots-with-server.mjs"),
      "utf8",
    );
    expect(capture).toContain(SEO_SNAPSHOT_HEADER);
    expect(capture).toContain(SEO_SNAPSHOT_ENV);
    expect(capture).toContain("response.status !== 308");
    const server = readFileSync(resolve(ROOT, "src/server.ts"), "utf8");
    expect(server).toContain("workerRoutingEnv(env)");
  });

  it("leaves an unrelated response unchanged when the headers already match", () => {
    const original = new Response("home", {
      status: 200,
      headers: hostHeadersForPathname("/"),
    });
    const result = withHostHeaders(new Request("https://verdantgrowdiary.com/"), original);
    expect(result).toBe(original);
  });
});

describe("static asset header file", () => {
  it("publishes the same header rules for the Workers assets binding", () => {
    const text = readFileSync(resolve(ROOT, "public/_headers"), "utf8");
    expect(text).toContain("X-Content-Type-Options: nosniff");
    expect(text).toContain(
      "Strict-Transport-Security: max-age=63072000; includeSubDomains; preload",
    );
    expect(text).toContain("Referrer-Policy: strict-origin-when-cross-origin");
    expect(text).toContain(
      "Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=()",
    );
    expect(text).toContain("X-Frame-Options: SAMEORIGIN");
    expect(text.toLowerCase()).not.toContain("content-security-policy");

    const unsubscribe = text.slice(text.indexOf("/unsubscribe"));
    expect(unsubscribe).toContain("Cache-Control: no-store");
    expect(unsubscribe).toContain("Referrer-Policy: no-referrer");
    expect(unsubscribe).toContain("X-Robots-Tag: noindex, nofollow, noarchive");

    const assets = text.slice(text.indexOf("/assets/*"));
    expect(assets).toContain("Cache-Control: public, max-age=31536000, immutable");
  });
});
