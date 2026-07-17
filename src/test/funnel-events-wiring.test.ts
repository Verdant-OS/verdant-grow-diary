/**
 * Funnel event wiring — static source contracts.
 *
 * Pins each of the eight growth-calendar events to its one canonical
 * emission seam, and fences the module against privacy regressions:
 *
 *   signup                  → Auth.tsx (after supabase.auth.signUp succeeds)
 *   tent_created            → CreateTentDialog.tsx (after insert succeeds)
 *   plant_created           → CreatePlantDialog.tsx (after insert succeeds)
 *   quick_log_saved         → useQuickLogV2Save.ts (after the RPC confirms)
 *   csv_import_completed    → EnvironmentCsvImportLauncher.tsx (success block)
 *   paywall_viewed          → Pricing.tsx + Upgrade.tsx + AI Doctor limit (mount effects)
 *   checkout_started        → usePaddleCheckout.ts (authenticated openCheckout)
 *   subscription_activated  → CheckoutSuccess.tsx (server-confirmed flip)
 *
 * Pure text assertions — no DB, no rendering.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FUNNEL_PARAM_KEYS } from "@/lib/funnelAnalytics";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const MODULE = read("src/lib/funnelAnalytics.ts");

const SEAMS: Array<{ event: string; file: string; extra?: RegExp[] }> = [
  {
    event: "signup",
    file: "src/pages/Auth.tsx",
    extra: [/trackFunnelEvent\("signup",\s*\{\s*method:\s*"email"\s*\}\)/],
  },
  { event: "tent_created", file: "src/components/CreateTentDialog.tsx" },
  { event: "plant_created", file: "src/components/CreatePlantDialog.tsx" },
  {
    event: "quick_log_saved",
    file: "src/hooks/useQuickLogV2Save.ts",
    // Emits the closed p_action enum, never note text.
    extra: [/event_type:\s*payload\.p_action/],
  },
  {
    event: "csv_import_completed",
    file: "src/components/EnvironmentCsvImportLauncher.tsx",
    extra: [/rows:\s*res\.insertedCount/],
  },
  {
    event: "checkout_started",
    file: "src/hooks/usePaddleCheckout.ts",
    extra: [/plan:\s*options\.priceId/],
  },
  {
    event: "subscription_activated",
    file: "src/pages/CheckoutSuccess.tsx",
    extra: [/plan:\s*entitlement\.effectivePlanId/],
  },
];

describe("each funnel event fires from its canonical seam", () => {
  for (const seam of SEAMS) {
    it(`${seam.event} → ${seam.file}`, () => {
      const src = read(seam.file);
      expect(src).toMatch(new RegExp(`trackFunnelEvent\\(\\s*"${seam.event}"`));
      expect(src).toMatch(/from\s+["']@\/lib\/funnelAnalytics["']/);
      for (const rx of seam.extra ?? []) expect(src).toMatch(rx);
    });
  }

  it("paywall_viewed fires from each paywall surface with a privacy-safe surface param", () => {
    const pricing = read("src/pages/Pricing.tsx");
    const upgrade = read("src/pages/Upgrade.tsx");
    const aiDoctor = read("src/components/PlantDetailAiDoctorLiveReview.tsx");
    expect(pricing).toMatch(
      /trackFunnelEvent\("paywall_viewed",\s*\{\s*surface:\s*"pricing"\s*\}\)/,
    );
    expect(upgrade).toMatch(
      /trackFunnelEvent\("paywall_viewed",\s*\{\s*surface:\s*"upgrade"\s*\}\)/,
    );
    expect(aiDoctor).toMatch(
      /trackFunnelEvent\("paywall_viewed",\s*\{\s*surface:\s*"ai_doctor_limit"\s*\}\)/,
    );
  });
});

describe("ordering and safety constraints at the seams", () => {
  it("quick_log_saved fires only inside the RPC-confirmed success path", () => {
    const src = read("src/hooks/useQuickLogV2Save.ts");
    // The tracking call must come after the r.ok rejection branch and
    // before the ok:true return — i.e. inside the confirmed block.
    const okBranch = src.indexOf("if (!r.ok)");
    const track = src.indexOf('trackFunnelEvent("quick_log_saved"');
    const okReturn = src.indexOf("ok: true");
    expect(okBranch).toBeGreaterThan(-1);
    expect(track).toBeGreaterThan(okBranch);
    expect(okReturn).toBeGreaterThan(track);
  });

  it("subscription_activated is gated on the server-confirmed flip and deduped", () => {
    const src = read("src/pages/CheckoutSuccess.tsx");
    expect(src).toMatch(/if \(!confirmed \|\| activationTrackedRef\.current\) return;/);
    expect(src).toMatch(/activationTrackedRef\.current = true;/);
  });

  it("checkout_started fires only after the signed-in gate", () => {
    const src = read("src/hooks/usePaddleCheckout.ts");
    const userGate = src.indexOf("if (!user)");
    const track = src.indexOf('trackFunnelEvent("checkout_started"');
    expect(userGate).toBeGreaterThan(-1);
    expect(track).toBeGreaterThan(userGate);
  });
});

describe("funnelAnalytics module — privacy fences", () => {
  it("never allowlists grower-content param keys", () => {
    const keys = [...FUNNEL_PARAM_KEYS] as string[];
    for (const banned of ["note", "nickname", "email", "strain", "photo", "name"]) {
      expect(keys, `param allowlist must not include "${banned}"`).not.toContain(banned);
    }
  });

  it("has no network client, storage writes, or identifiers", () => {
    expect(MODULE).not.toMatch(/supabase|service_role|fetch\(|localStorage/);
    expect(MODULE).not.toMatch(/user_id|plant_id|grow_id|tent_id/);
  });

  it("guards gtag behind a typeof check (ad blockers / tests never throw)", () => {
    expect(MODULE).toMatch(/typeof g === "function"/);
  });

  it("is the only funnel gtag emitter — no seam calls gtag directly", () => {
    for (const seam of SEAMS) {
      const src = read(seam.file);
      expect(
        /gtag\(\s*["']event["']/.test(src),
        `${seam.file} must route through trackFunnelEvent, not raw gtag`,
      ).toBe(false);
    }
  });
});
