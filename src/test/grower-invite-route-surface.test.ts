import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const APP = read("src/App.tsx");
const MANIFEST = read("src/lib/appRouteManifest.ts");
const SIDEBAR = read("src/components/AppSidebar.tsx");
const MOBILE = read("src/components/MobileNav.tsx");
const ONBOARDING = read("src/components/OnboardingChecklistCard.tsx");

describe("authenticated grower invite reachability", () => {
  it("mounts /invite only inside the authenticated AppShell route group", () => {
    expect(APP).toContain('path="/invite" element={<GrowerInvite />}');
    expect(MANIFEST).toContain('path: "/invite"');
    expect(MANIFEST).toMatch(/path: "\/invite",\s+access: "auth"/);
  });

  it("is reachable from desktop, mobile, and the fully activated onboarding state", () => {
    expect(SIDEBAR).toContain('to: "/invite"');
    expect(MOBILE).toContain('to: "/invite"');
    expect(ONBOARDING).toContain('to="/invite"');
    expect(ONBOARDING).toContain("if (vm.isFullyActivated)");
  });

  it("contains no contact upload, user identifier, entitlement, or reward transport", () => {
    const combined = [APP, SIDEBAR, MOBILE, ONBOARDING].join("\n");
    expect(combined).not.toMatch(/uploadContacts|contact_list|referrer_id|reward_id/i);
  });
});
