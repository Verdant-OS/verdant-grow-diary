import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ROUTES } from "@/lib/appRouteManifest";

const ROOT = resolve(__dirname, "../..");

interface VercelRedirect {
  source?: unknown;
  destination?: unknown;
  permanent?: unknown;
}

const vercelConfig = JSON.parse(readFileSync(resolve(ROOT, "vercel.json"), "utf8")) as {
  redirects?: VercelRedirect[];
};

const SAFE_PUBLIC_LEGACY_REDIRECTS = [
  { source: "/features", destination: "/welcome" },
  { source: "/demo", destination: "/welcome" },
  { source: "/refunds", destination: "/refund" },
  { source: "/refund-policy", destination: "/refund" },
  { source: "/terms-of-service", destination: "/terms" },
  { source: "/privacy-policy", destination: "/privacy" },
] as const;

describe("public legacy host redirects", () => {
  it.each(SAFE_PUBLIC_LEGACY_REDIRECTS)(
    "permanently redirects $source to the canonical public $destination route",
    ({ source, destination }) => {
      const matchingRedirects = (vercelConfig.redirects ?? []).filter(
        (redirect) => redirect.source === source,
      );

      expect(matchingRedirects).toEqual([{ source, destination, permanent: true }]);

      expect(APP_ROUTES).toContainEqual(
        expect.objectContaining({ path: destination, access: "public" }),
      );
    },
  );
});
