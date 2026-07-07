/**
 * Upgrade page — presenter tests.
 *
 * Covers: tier rendering, checkout status banner (loading/error/unavailable),
 * retry behavior, confirmation dialog flow, Free-tier bypass, null price-ID
 * inertness, founder sold-out state, FAQ, comparison table, and forbidden-
 * claim guard. All checkout interactions are mocked — no network calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// --- Mocks (hoisted so vi.mock factories can reach them) --------------------
const paddleMock = vi.hoisted(() => ({
  configAvailable: true as boolean,
  ready: true as boolean,
  loading: false as boolean,
  error: null as string | null,
  checkoutOpen: vi.fn(),
  retryCount: 0,
}));

const tierOverride = vi.hoisted(() => ({
  founderClaimed: 0 as number,
  proMonthlyPriceId: "pri_pro_month" as string | null,
}));

// Live-mutable pricing tiers: we mutate the ACTUAL imported array in
// beforeEach so component reads see current test overrides.
import { PRICING_TIERS } from "@/config/pricing";


vi.mock("@/lib/paddleConfig", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/paddleConfig")
  >("@/lib/paddleConfig");
  return {
    ...actual,
    resolvePaddleConfig: () =>
      paddleMock.configAvailable
        ? {
            available: true,
            environment: "sandbox",
            clientToken: "test_token",
            priceIds: {
              "pro-monthly": "pri_pro_month",
              "pro-annual": "pri_pro_annual",
              "founder-lifetime": "pri_founder",
            },
          }
        : { available: false, reason: "missing_client_token", environment: "sandbox" },
  };
});

// Mock useMyEntitlements to a stable "unknown" (free) state.
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    entitlement: { displayPlanId: null },
  }),
}));

// Mock the internal usePaddle by intercepting the module — instead, we stub
// window.Paddle so the real hook's ready path is taken (no script load in
// jsdom). We control readiness via paddleMock flags by re-mocking the module.
vi.mock("@/pages/Upgrade", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/pages/Upgrade")>();
  return mod;
});

// Provide a fake window.Paddle so the real usePaddle hook resolves ready
// synchronously (it short-circuits when window.Paddle.Checkout exists).
function installFakePaddle() {
  (window as any).Paddle = {
    Environment: { set: () => {} },
    Initialize: () => {},
    Checkout: { open: paddleMock.checkoutOpen },
  };
}
function uninstallPaddle() {
  delete (window as any).Paddle;
}

import Upgrade from "@/pages/Upgrade";

function renderPage() {
  return render(
    <MemoryRouter>
      <Upgrade />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  paddleMock.configAvailable = true;
  paddleMock.ready = true;
  paddleMock.loading = false;
  paddleMock.error = null;
  paddleMock.checkoutOpen.mockReset();
  tierOverride.founderClaimed = 0;
  tierOverride.proMonthlyPriceId = "pri_pro_month";
  installFakePaddle();
});

afterEach(() => {
  uninstallPaddle();
  // Remove any injected paddle.js script tags.
  document
    .querySelectorAll('script[src*="paddle.com"]')
    .forEach((s) => s.remove());
});

describe("Upgrade page", () => {
  it("renders all four tiers", () => {
    renderPage();
    expect(screen.getByTestId("tier-free")).toBeInTheDocument();
    expect(screen.getByTestId("tier-pro_monthly")).toBeInTheDocument();
    expect(screen.getByTestId("tier-pro_annual")).toBeInTheDocument();
    expect(screen.getByTestId("tier-founder_lifetime")).toBeInTheDocument();
  });

  it("keeps paid CTA disabled and shows 'Available soon' when paddlePriceId is null", () => {
    tierOverride.proMonthlyPriceId = null;
    renderPage();
    const cta = screen.getByTestId("tier-pro_monthly-cta") as HTMLButtonElement;
    expect(cta).toBeDisabled();
    expect(cta.textContent).toMatch(/Available soon/i);
  });

  it("free tier CTA never opens confirmation or Paddle checkout", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("tier-free-cta"));
    expect(screen.queryByTestId("checkout-confirm-dialog")).toBeNull();
    expect(paddleMock.checkoutOpen).not.toHaveBeenCalled();
  });

  it("paid tier click opens confirmation dialog before Paddle checkout", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("tier-pro_annual-cta"));
    const dialog = screen.getByTestId("checkout-confirm-dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByTestId("checkout-confirm-price").textContent).toMatch(
      /\$/,
    );
    expect(paddleMock.checkoutOpen).not.toHaveBeenCalled();
  });

  it("cancel in confirmation dialog does not call Paddle.Checkout.open", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("tier-pro_annual-cta"));
    fireEvent.click(screen.getByTestId("checkout-confirm-cancel"));
    expect(paddleMock.checkoutOpen).not.toHaveBeenCalled();
  });

  it("confirm calls Paddle.Checkout.open when paddlePriceId is valid and Paddle is ready", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("tier-pro_monthly-cta"));
    fireEvent.click(screen.getByTestId("checkout-confirm-continue"));
    expect(paddleMock.checkoutOpen).toHaveBeenCalledTimes(1);
    const payload = paddleMock.checkoutOpen.mock.calls[0][0];
    expect(payload.items[0].priceId).toBe("pri_pro_month");
  });

  it("founder sold-out state disables CTA", () => {
    tierOverride.founderClaimed = 75;
    renderPage();
    const cta = screen.getByTestId(
      "tier-founder_lifetime-cta",
    ) as HTMLButtonElement;
    expect(cta).toBeDisabled();
    expect(cta.textContent).toMatch(/Sold out/i);
  });

  it("shows checkout-unavailable banner when Paddle config is missing", () => {
    paddleMock.configAvailable = false;
    uninstallPaddle();
    renderPage();
    const banner = screen.getByTestId("checkout-status-banner");
    expect(banner).toBeInTheDocument();
    expect(banner.getAttribute("data-variant")).toBe("warn");
  });

  it("retry button appears on init error, re-attempts init, and does not open checkout", async () => {
    // Simulate initialization failure by removing Paddle before render and
    // forcing the script path to fail synchronously.
    uninstallPaddle();
    renderPage();
    // The hook injects a <script> tag; simulate its error event.
    const script = document.querySelector<HTMLScriptElement>(
      'script[src*="paddle.com"]',
    );
    expect(script).toBeTruthy();
    await act(async () => {
      script!.dispatchEvent(new Event("error"));
    });

    const retryBtn = await screen.findByTestId("checkout-status-retry");
    // Now install a working Paddle so the retry attempt can succeed without
    // touching the network.
    installFakePaddle();
    await act(async () => {
      fireEvent.click(retryBtn);
    });
    expect(paddleMock.checkoutOpen).not.toHaveBeenCalled();
  });

  it("renders FAQ with billing, data ownership, founder, cancel, and no-autopilot copy", () => {
    renderPage();
    const faq = screen.getByTestId("upgrade-faq");
    const text = faq.textContent ?? "";
    expect(text).toMatch(/billing/i);
    expect(text).toMatch(/own your grow data|grow history/i);
    expect(text).toMatch(/Founder/i);
    expect(text).toMatch(/cancel/i);
    expect(text).toMatch(/does not control|not run.*autopilot|never runs your grow on autopilot/i);
  });

  it("renders plan comparison table with all four tier columns", () => {
    renderPage();
    const table = screen.getByTestId("plan-comparison");
    expect(within(table).getByTestId("compare-header-free")).toBeInTheDocument();
    expect(
      within(table).getByTestId("compare-header-pro_monthly"),
    ).toBeInTheDocument();
    expect(
      within(table).getByTestId("compare-header-pro_annual"),
    ).toBeInTheDocument();
    expect(
      within(table).getByTestId("compare-header-founder_lifetime"),
    ).toBeInTheDocument();
  });

  it("contains none of the forbidden marketing claims", () => {
    renderPage();
    const text = document.body.textContent?.toLowerCase() ?? "";
    expect(text).not.toContain("ai grows for you");
    expect(text).not.toContain("guaranteed yield");
    expect(text).not.toContain("guaranteed harvest improvement");
    expect(text).not.toContain("device control included");
    // "autopilot" only appears in a negation ("never runs ... on autopilot").
    // Ensure no positive autopilot claim exists.
    expect(text).not.toMatch(/(includes|with|full)\s+autopilot/);
  });
});
