/**
 * Today Trust + Route Polish v1 — /ai-doctor redirect alias.
 *
 * Growers sometimes type /ai-doctor; canonical route is /doctor.
 * Static scan verifies the alias is mounted as a redirect and that the
 * manifest records it as a redirect entry.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { APP_ROUTES } from "@/lib/appRouteManifest";

const APP_TSX = readFileSync(
  resolve(__dirname, "../../src/App.tsx"),
  "utf8",
);

describe("/ai-doctor redirect alias", () => {
  it("App.tsx mounts /ai-doctor as a <Navigate> to /doctor", () => {
    expect(APP_TSX).toMatch(
      /path="\/ai-doctor"[\s\S]{0,120}<Navigate\s+to="\/doctor"\s+replace/,
    );
  });

  it("App.tsx still mounts canonical /doctor route", () => {
    expect(APP_TSX).toMatch(/path="\/doctor"\s+element=\{<AiDoctorStart\s*\/>\}/);
  });

  it("appRouteManifest records /ai-doctor as redirect", () => {
    const entry = APP_ROUTES.find((r) => r.path === "/ai-doctor");
    expect(entry).toBeDefined();
    expect(entry?.access).toBe("redirect");
  });

  it("canonical /doctor manifest entry remains auth-gated", () => {
    const entry = APP_ROUTES.find((r) => r.path === "/doctor");
    expect(entry?.access).toBe("auth");
  });
});
