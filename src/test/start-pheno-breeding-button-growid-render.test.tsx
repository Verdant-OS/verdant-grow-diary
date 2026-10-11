/**
 * StartPhenoHuntButton / StartBreedingLogButton — grow-scoped deep-link render pins.
 *
 * Follow-up to PhenoHuntNew (#1612) and BreedingLogNew (#1611) destination-page pins.
 * Grow Detail (#1608) pins these CTAs without tentId; Tent Detail passes tentId and
 * every tent-detail test mocks the button out. These pins prove the carrier components
 * preserve growId (and optional tentId) in rendered hrefs. Fail closed: blank growId
 * renders nothing.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { resolveEntitlements } from "@/lib/entitlements/resolveEntitlements";
import type { BillingSubscriptionRow } from "@/lib/entitlements/types";

const GROW = "4cad3cae-21e3-42f8-8372-2f6237205db3";
const TENT = "tent-77";

const authState = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
}));

const entitlementMode = vi.hoisted(() => ({
  current: "pro" as "pro" | "free" | "loading" | "error",
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: authState.user }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => {
    if (entitlementMode.current === "loading") {
      return {
        loading: true,
        lookupFailed: false,
        entitlement: resolveEntitlements(null, new Date("2026-08-01T00:00:00Z")),
        refetch: async () => {},
      };
    }
    const proRow: BillingSubscriptionRow = {
      id: "r",
      user_id: "user-1",
      plan_id: "pro_monthly",
      status: "active",
      provider: "paddle",
      provider_customer_id: null,
      provider_subscription_id: null,
      current_period_end: "2099-01-01T00:00:00Z",
      cancel_at_period_end: false,
      founder_number: null,
      created_at: "",
      updated_at: "",
    };
    const row = entitlementMode.current === "pro" ? proRow : null;
    return {
      loading: false,
      lookupFailed: entitlementMode.current === "error",
      entitlement: resolveEntitlements(row, new Date("2026-08-01T00:00:00Z")),
      refetch: async () => {},
    };
  },
}));

import StartPhenoHuntButton from "@/components/StartPhenoHuntButton";
import StartBreedingLogButton from "@/components/StartBreedingLogButton";

function hrefForTestId(testId: string): string | null {
  const node = screen.getByTestId(testId);
  const anchor = node.tagName === "A" ? node : node.closest("a");
  return anchor?.getAttribute("href") ?? null;
}

function renderButtons(props: { growId: string; tentId?: string | null }, phenoOnly = false) {
  return render(
    <MemoryRouter>
      <StartPhenoHuntButton growId={props.growId} tentId={props.tentId} />
      {phenoOnly ? null : <StartBreedingLogButton growId={props.growId} tentId={props.tentId} />}
    </MemoryRouter>,
  );
}

describe("StartPhenoHuntButton grow-scoped deep links", () => {
  beforeEach(() => {
    authState.user = { id: "user-1" };
    entitlementMode.current = "pro";
  });

  it("links to /pheno-hunts/new with growId when tentId is absent", () => {
    renderButtons({ growId: GROW }, true);
    expect(hrefForTestId("start-pheno-hunt-btn")).toBe(`/pheno-hunts/new?growId=${GROW}`);
  });

  it("carries tentId on the new-hunt target when scoped from Tent Detail", () => {
    renderButtons({ growId: GROW, tentId: TENT }, true);
    expect(hrefForTestId("start-pheno-hunt-btn")).toBe(
      `/pheno-hunts/new?growId=${GROW}&tentId=${TENT}`,
    );
  });

  it("fail-closed: does not render when growId is blank", () => {
    renderButtons({ growId: "" }, true);
    expect(screen.queryByTestId("start-pheno-hunt-btn")).toBeNull();
  });

  it("fail-closed: does not render when user is signed out", () => {
    authState.user = null;
    renderButtons({ growId: GROW }, true);
    expect(screen.queryByTestId("start-pheno-hunt-btn")).toBeNull();
  });

  it("routes unentitled users to pricing with full returnTo including tentId", () => {
    entitlementMode.current = "free";
    renderButtons({ growId: GROW, tentId: TENT }, true);
    const href = hrefForTestId("start-pheno-hunt-btn");
    expect(href).toMatch(/^\/pricing\?returnTo=/);
    const returnTo = decodeURIComponent(href!.split("returnTo=")[1] ?? "");
    expect(returnTo).toBe(`/pheno-hunts/new?growId=${GROW}&tentId=${TENT}`);
  });
});

describe("StartBreedingLogButton grow-scoped deep links", () => {
  beforeEach(() => {
    authState.user = { id: "user-1" };
  });

  it("links to /breeding/log/new with growId when tentId is absent", () => {
    renderButtons({ growId: GROW });
    expect(hrefForTestId("start-breeding-log-btn")).toBe(`/breeding/log/new?growId=${GROW}`);
  });

  it("carries tentId on the log-new target when scoped from Tent Detail", () => {
    renderButtons({ growId: GROW, tentId: TENT });
    expect(hrefForTestId("start-breeding-log-btn")).toBe(
      `/breeding/log/new?growId=${GROW}&tentId=${TENT}`,
    );
  });

  it("fail-closed: does not render when growId is blank", () => {
    renderButtons({ growId: "" });
    expect(screen.queryByTestId("start-breeding-log-btn")).toBeNull();
  });

  it("fail-closed: does not render when user is signed out", () => {
    authState.user = null;
    renderButtons({ growId: GROW });
    expect(screen.queryByTestId("start-breeding-log-btn")).toBeNull();
  });
});
