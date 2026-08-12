/**
 * Tent-alert → Blueprint hint (Daily Check only).
 *
 * A grower on Daily Check sees "Temperature high" for a tent with nothing on
 * the page explaining what the band is — Daily Check renders the alerts panel
 * but no Blueprint section. This adds one line naming the plant's stage and
 * how many targets exist, linking to where the real (free) teaser lives.
 *
 * The two invariants worth defending:
 *
 * 1. IT NEVER DOUBLE-UPSELLS. Plant Detail already renders BlueprintTeaser +
 *    PaywallCta a few sections above its own alerts panel. The hint therefore
 *    lives at the Daily Check call site, NOT inside the shared panel, so the
 *    Plant Detail suppression is structural rather than a flag.
 *
 * 2. IT FAILS CLOSED. An unverified or still-loading entitlement must never
 *    produce an upsell, and an unknown stage must render nothing rather than a
 *    nudge with no information in it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import TentAlertsBlueprintHint from "@/components/TentAlertsBlueprintHint";
import { plantDetailPath } from "@/lib/routes";
import type { ResolvedEntitlement } from "@/lib/entitlements/types";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const DAILY_CHECK = read("src/pages/DailyCheck.tsx");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");
const PANEL = read("src/components/PlantAssignedTentAlertsPanel.tsx");

const ent = vi.hoisted(() => ({
  loading: false,
  lookupFailed: false,
  blueprint: false,
  isActive: true,
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: ent.loading,
    lookupFailed: ent.lookupFailed,
    entitlement: {
      displayPlanId: ent.blueprint ? "craft_monthly" : "free",
      effectivePlanId: ent.blueprint ? "craft_monthly" : "free",
      status: "active",
      isActive: ent.isActive,
      capabilities: { blueprint: ent.blueprint },
      degraded: false,
      source: ent.blueprint ? "lovable_paddle_subscription" : "free",
    } as unknown as ResolvedEntitlement,
    refetch: async () => undefined,
  }),
}));

function renderHint(props: { plantId?: string | null; stage?: string | null }) {
  return render(
    <MemoryRouter>
      <TentAlertsBlueprintHint {...props} />
    </MemoryRouter>,
  );
}

const HINT = "tent-alerts-blueprint-hint";

beforeEach(() => {
  ent.loading = false;
  ent.lookupFailed = false;
  ent.blueprint = false;
  ent.isActive = true;
});

describe("tent alerts · Blueprint hint", () => {
  it("names the real stage and target count, not a generic pitch", () => {
    renderHint({ plantId: "plant-1", stage: "flower" });
    const el = screen.getByTestId(HINT);
    // A true, specific fact — the count comes from the same band table the
    // paid overlay scores against.
    expect(el.textContent).toMatch(/\d+ .*targets/i);
    expect(el.textContent).toMatch(/flower/i);
  });

  it("links to the plant, built by the shared route helper", () => {
    renderHint({ plantId: "plant-1", stage: "flower" });
    expect(screen.getByTestId(`${HINT}-link`)).toHaveAttribute(
      "href",
      plantDetailPath("plant-1"),
    );
  });

  it("says nothing when the stage is unknown", () => {
    // No stage means no targets to name — a hint with no information is just
    // an ad, which is the thing this deliberately is not.
    renderHint({ plantId: "plant-1", stage: null });
    expect(screen.queryByTestId(HINT)).toBeNull();
  });

  it("says nothing when the caller cannot prove the plant owns these alerts", () => {
    renderHint({ plantId: null, stage: "flower" });
    expect(screen.queryByTestId(HINT)).toBeNull();
  });
});

describe("tent alerts · Blueprint hint fails closed", () => {
  it("never upsells a grower who already has Blueprint", () => {
    ent.blueprint = true;
    renderHint({ plantId: "plant-1", stage: "flower" });
    expect(screen.queryByTestId(HINT)).toBeNull();
  });

  it("never upsells while the plan is still loading", () => {
    ent.loading = true;
    renderHint({ plantId: "plant-1", stage: "flower" });
    expect(screen.queryByTestId(HINT)).toBeNull();
  });

  it("never upsells on an unverified entitlement", () => {
    ent.lookupFailed = true;
    renderHint({ plantId: "plant-1", stage: "flower" });
    expect(screen.queryByTestId(HINT)).toBeNull();
  });

  it("treats an inactive entitlement as not owning Blueprint", () => {
    // isActive false + capability true must still show the hint (they do not
    // have it), never suppress it — canUseCapability requires BOTH.
    ent.isActive = false;
    ent.blueprint = true;
    renderHint({ plantId: "plant-1", stage: "flower" });
    expect(screen.getByTestId(HINT)).toBeInTheDocument();
  });
});

describe("tent alerts · Blueprint hint placement", () => {
  it("is rendered by Daily Check under the same ownership proof as the panel", () => {
    expect(DAILY_CHECK).toContain("TentAlertsBlueprintHint");
    // The identical guard the panel's plant-scoped shortcut uses.
    expect(DAILY_CHECK).toMatch(
      /TentAlertsBlueprintHint[\s\S]{0,240}effectiveTentId === selectedPlantTentId/,
    );
  });

  it("is NOT rendered on Plant Detail, which already shows the full teaser", () => {
    // Structural suppression: a second upsell for the same feature on the same
    // screen is the failure mode this design exists to avoid.
    expect(PLANT_DETAIL).not.toContain("TentAlertsBlueprintHint");
    expect(PLANT_DETAIL).toContain("PlantBlueprintOverlaySection");
  });

  it("keeps the shared alerts panel free of upsell logic", () => {
    // Living inside the panel would force both callers to reason about it.
    expect(PANEL).not.toContain("TentAlertsBlueprintHint");
    expect(PANEL).not.toContain("canUseCapability");
    expect(PANEL).not.toMatch(/blueprint/i);
  });
});
