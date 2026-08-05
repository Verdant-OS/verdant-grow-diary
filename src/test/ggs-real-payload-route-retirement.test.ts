import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ROUTES } from "@/lib/appRouteManifest";
import {
  extractMountedAppRoutePaths,
  readAllRouteModuleSources,
} from "./helpers/routeManifestSyncHarness";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const APP = readAllRouteModuleSources();
const MOBILE_ROUTE_SPEC = read("e2e/auth-route-protection-mobile.spec.ts");

const BROKEN_BROWSER_ROUTE = "/operator/ggs-real-payload-ingest";

describe("retired browser-only GGS payload commit route", () => {
  it("does not mount the operator page whose browser client cannot execute its service-role RPC", () => {
    expect(APP).not.toMatch(/import\(\s*["']\.\/pages\/OperatorGgsRealPayloadIngest["']\s*\)/);
    expect(extractMountedAppRoutePaths()).not.toContain(BROKEN_BROWSER_ROUTE);
  });

  it("does not advertise the retired route in the canonical manifest", () => {
    expect(APP_ROUTES.some((route) => route.path === BROKEN_BROWSER_ROUTE)).toBe(false);
    expect(MOBILE_ROUTE_SPEC).not.toContain(`"${BROKEN_BROWSER_ROUTE}"`);
  });

  it("keeps the real authenticated ingest boundary instead of granting the RPC to browsers", () => {
    const migration = read(
      "supabase/migrations/20260523184548_898f7681-be10-410e-8295-b8ce0aeda803.sql",
    );
    const edge = read("supabase/functions/pi-ingest-readings/index.ts");

    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.pi_ingest_commit_batch[\s\S]*FROM authenticated/i,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.pi_ingest_commit_batch[\s\S]*TO service_role/i,
    );
    expect(edge).toContain("verifyBridgeRequest");
    expect(edge).toContain("commitPiIngestBatch");
  });
});
