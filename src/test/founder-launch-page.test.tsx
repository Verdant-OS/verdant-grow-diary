import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ROUTES } from "@/lib/appRouteManifest";

const route = readFileSync(resolve(__dirname, "../routes/founder.tsx"), "utf8");

describe("/founder no longer sells Founder Lifetime", () => {
  it("redirects the route to /pricing", () => {
    expect(route).toContain('to="/pricing"');
    expect(route).not.toMatch(/Founder Lifetime/);
  });

  it("marks /founder as a redirect in the route manifest", () => {
    const entry = APP_ROUTES.find((item) => item.path === "/founder");
    expect(entry?.access).toBe("redirect");
  });
});
