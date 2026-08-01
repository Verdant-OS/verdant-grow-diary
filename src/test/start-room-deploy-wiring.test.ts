import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");

describe("Start your room — deploy wiring", () => {
  const APP = readFileSync(resolve(ROOT, "src/App.tsx"), "utf8");
  const MANIFEST = readFileSync(resolve(ROOT, "src/lib/appRouteManifest.ts"), "utf8");
  const ONBOARD = readFileSync(resolve(ROOT, "src/pages/Onboarding.tsx"), "utf8");
  const PAGE = readFileSync(resolve(ROOT, "src/pages/StartYourRoom.tsx"), "utf8");

  it("registers lazy route /start-room", () => {
    expect(APP).toMatch(/lazy\(\s*\(\)\s*=>\s*import\("\.\/pages\/StartYourRoom"\)\s*\)/);
    expect(APP).toMatch(/path="\/start-room"/);
    expect(APP).toMatch(/element=\{<StartYourRoom\s*\/>\}/);
  });

  it("manifest lists /start-room after /signup (sorted)", () => {
    expect(MANIFEST).toMatch(/path:\s*"\/start-room"/);
    const signup = MANIFEST.indexOf('path: "/signup"');
    const start = MANIFEST.indexOf('path: "/start-room"');
    const strains = MANIFEST.indexOf('path: "/strains"');
    expect(signup).toBeGreaterThan(-1);
    expect(start).toBeGreaterThan(signup);
    expect(strains).toBeGreaterThan(start);
  });

  it("onboarding offers Start your room for zero-grow accounts", () => {
    expect(ONBOARD).toMatch(/shouldPreferStartYourRoom/);
    expect(ONBOARD).toMatch(/onboarding-start-room-cta/);
    expect(ONBOARD).toMatch(/\/start-room/);
  });

  it("wizard binds grow_id on tent and plant inserts", () => {
    expect(PAGE).toMatch(/buildStartRoomTentPayload|grow_id/);
    expect(PAGE).toMatch(/buildStartRoomPlantPayload/);
    expect(PAGE).toMatch(/data-testid="start-your-room"/);
  });
});
