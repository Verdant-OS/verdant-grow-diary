import { describe, expect, it } from "vitest";
import { APP_ROUTES } from "@/lib/appRouteManifest";
import { resolveHostRouting } from "@/lib/cloudflareHostRoutingRules";

const SAFE_PUBLIC_LEGACY_REDIRECTS = [
  { source: "/welcome", destination: "/" },
  { source: "/features", destination: "/" },
  { source: "/demo", destination: "/" },
  { source: "/refunds", destination: "/refund" },
  { source: "/refund-policy", destination: "/refund" },
  { source: "/terms-of-service", destination: "/terms" },
  { source: "/privacy-policy", destination: "/privacy" },
] as const;

describe("public legacy host redirects", () => {
  it.each(SAFE_PUBLIC_LEGACY_REDIRECTS)(
    "permanently redirects $source to the canonical public $destination route",
    ({ source, destination }) => {
      expect(resolveHostRouting({ pathname: source, search: "" })).toEqual(
        expect.objectContaining({ kind: "redirect", status: 308, location: destination }),
      );

      expect(APP_ROUTES).toContainEqual(
        expect.objectContaining({
          path: destination === "/" ? "/" : destination,
          access: "public",
        }),
      );
    },
  );
});
