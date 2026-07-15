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

// Trunk routed confirm through the canonical usePaddleCheckout hook (M1
// audit fix); direct paddle.Checkout.open is no longer called by the page.
// The canonical spy is the positive assertion seam; checkoutOpen remains as
// a never-called guard against a direct-open regression.
const canonicalCheckout = vi.hoisted(() => ({ openCheckout: vi.fn() }));

vi.mock("@/hooks/usePaddleCheckout", () => ({
  usePaddleCheckout: () => ({
    openCheckout: canonicalCheckout.openCheckout,
    loading: false,
  }),
}));

const tierOverride = vi.hoisted(() => ({
  founderClaimed: 0 as number,
  proMonthlyPriceId: "pri_pro_month" as string | null,
}));

// Live-mutable pricing tiers: we mutate the ACTUAL imported array in
// beforeEach so component reads see current test overrides.
import { PRICING_TIERS, resolveTierFeatures } from "@/config/pricing";

vi.mock("@/lib/paddleConfig", async () => {
  const actual = await vi.importActual<typeof import("@/lib/paddleConfig")>("@/lib/paddleConfig");
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

function renderPage(initialEntries: string[] = ["/upgrade"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
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
  canonicalCheckout.openCheckout.mockReset();
  tierOverride.founderClaimed = 0;
  tierOverride.proMonthlyPriceId = "pri_pro_month";
  // Mutate live pricing tiers so all paid CTAs are active by default; individual
  // tests can override `tierOverride.*` (applied before renderPage()).
  for (const t of PRICING_TIERS) {
    if (t.id === "pro_monthly") t.paddlePriceId = tierOverride.proMonthlyPriceId;
    if (t.id === "pro_annual") t.paddlePriceId = "pri_pro_annual";
    if (t.id === "founder_lifetime") {
      t.paddlePriceId = "pri_founder";
      t.cap = { total: 75, claimed: tierOverride.founderClaimed };
    }
  }
  installFakePaddle();
});

afterEach(() => {
  uninstallPaddle();
  // Remove any injected paddle.js script tags.
  document.querySelectorAll('script[src*="paddle.com"]').forEach((s) => s.remove());
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
    PRICING_TIERS.find((t) => t.id === "pro_monthly")!.paddlePriceId = null;
    renderPage();
    const cta = screen.getByTestId("tier-pro_monthly-cta") as HTMLButtonElement;
    expect(cta).toBeDisabled();
    expect(cta.textContent).toMatch(/Available soon/i);
  });

  it("free tier CTA never opens confirmation or any checkout", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("tier-free-cta"));
    expect(screen.queryByTestId("checkout-confirm-dialog")).toBeNull();
    expect(paddleMock.checkoutOpen).not.toHaveBeenCalled();
    expect(canonicalCheckout.openCheckout).not.toHaveBeenCalled();
  });

  it("paid tier click opens confirmation dialog before any checkout", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("tier-pro_annual-cta"));
    const dialog = screen.getByTestId("checkout-confirm-dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByTestId("checkout-confirm-price").textContent).toMatch(/\$/);
    expect(paddleMock.checkoutOpen).not.toHaveBeenCalled();
    expect(canonicalCheckout.openCheckout).not.toHaveBeenCalled();
  });

  it("cancel in confirmation dialog opens no checkout", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("tier-pro_annual-cta"));
    fireEvent.click(screen.getByTestId("checkout-confirm-cancel"));
    expect(paddleMock.checkoutOpen).not.toHaveBeenCalled();
    expect(canonicalCheckout.openCheckout).not.toHaveBeenCalled();
  });

  it("confirm opens checkout via the canonical hook when paddlePriceId is valid and Paddle is ready", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("tier-pro_monthly-cta"));
    fireEvent.click(screen.getByTestId("checkout-confirm-continue"));
    expect(canonicalCheckout.openCheckout).toHaveBeenCalledTimes(1);
    const options = canonicalCheckout.openCheckout.mock.calls[0][0];
    expect(options.priceId).toBe("pri_pro_month");
    // Never a direct Paddle.Checkout.open — the hook is the only path.
    expect(paddleMock.checkoutOpen).not.toHaveBeenCalled();
  });

  it("founder sold-out state disables CTA", () => {
    const founder = PRICING_TIERS.find((t) => t.id === "founder_lifetime")!;
    founder.cap = { total: 75, claimed: 75 };
    renderPage();
    const cta = screen.getByTestId("tier-founder_lifetime-cta") as HTMLButtonElement;
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
    const script = document.querySelector<HTMLScriptElement>('script[src*="paddle.com"]');
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

  it("renders FAQ with billing, data ownership, founder, cancel, and approval-first equipment safety copy", async () => {
    const { UPGRADE_FAQ } = await import("@/config/pricing");
    renderPage();
    // FAQ triggers are always visible; validate trigger text is rendered.
    const faq = screen.getByTestId("upgrade-faq");
    const triggerText = faq.textContent ?? "";
    expect(triggerText).toMatch(/billing/i);
    expect(triggerText).toMatch(/grow data/i);
    expect(triggerText).toMatch(/Founder/i);
    expect(triggerText).toMatch(/cancel/i);
    expect(triggerText).toMatch(/equipment|autopilot/i);
    // Answer copy (source of truth) must include the safety statements.
    const allAnswers = UPGRADE_FAQ.map((f) => f.a)
      .join(" ")
      .toLowerCase();
    expect(allAnswers).toMatch(/does not sell grower data/);
    expect(allAnswers).toMatch(/does not control/);
    expect(allAnswers).toMatch(/runs your grow for you/);
    expect(allAnswers).toMatch(/grower-approved/);
    expect(allAnswers).toMatch(/paddle/);
    expect(allAnswers).toMatch(/founder/);
    expect(allAnswers).toMatch(/cancel|stop when your billing/);
  });

  it("renders plan comparison table with all four tier columns", () => {
    renderPage();
    const table = screen.getByTestId("plan-comparison");
    expect(within(table).getByTestId("compare-header-free")).toBeInTheDocument();
    expect(within(table).getByTestId("compare-header-pro_monthly")).toBeInTheDocument();
    expect(within(table).getByTestId("compare-header-pro_annual")).toBeInTheDocument();
    expect(within(table).getByTestId("compare-header-founder_lifetime")).toBeInTheDocument();
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

describe("Upgrade page — success panel", () => {
  it("does not render success panel without query param", () => {
    renderPage();
    expect(screen.queryByTestId("upgrade-success-panel")).toBeNull();
  });

  it("renders success panel when ?checkout=success is present", () => {
    renderPage(["/upgrade?checkout=success"]);
    const panel = screen.getByTestId("upgrade-success-panel");
    expect(panel).toBeInTheDocument();
    // With mocked unknown plan, activation must NOT be falsely confirmed.
    expect(panel.getAttribute("data-activated")).toBe("false");
    expect(panel.textContent).toMatch(/checking your account status|should update shortly/i);
  });

  it("renders success panel when ?upgrade=success is present", () => {
    renderPage(["/upgrade?upgrade=success"]);
    expect(screen.getByTestId("upgrade-success-panel")).toBeInTheDocument();
  });

  it("shows exact newly unlocked features for Pro Monthly from pricing config", () => {
    renderPage(["/upgrade?checkout=success&plan=pro_monthly"]);
    const panel = screen.getByTestId("upgrade-success-panel");
    const featuresBlock = screen.getByTestId("upgrade-success-features");
    expect(featuresBlock).toBeInTheDocument();
    expect(featuresBlock.textContent).toMatch(/newly unlocked features/i);
    const expected = resolveTierFeatures("pro_monthly");
    for (const feature of expected) {
      expect(panel.textContent).toContain(feature);
    }
  });

  it("resolves Pro Annual features to the Pro Monthly feature list", () => {
    renderPage(["/upgrade?checkout=success&plan=pro_annual"]);
    const panel = screen.getByTestId("upgrade-success-panel");
    const expected = resolveTierFeatures("pro_annual");
    expect(expected).toEqual(resolveTierFeatures("pro_monthly"));
    for (const feature of expected) {
      expect(panel.textContent).toContain(feature);
    }
    // No generic placeholder copy — features must be listed explicitly.
    expect(panel).not.toHaveTextContent(/Everything in Pro/i);
  });

  it("resolves Founder Lifetime features to Pro features plus founder perks", () => {
    renderPage(["/upgrade?checkout=success&plan=founder_lifetime"]);
    const panel = screen.getByTestId("upgrade-success-panel");
    const expected = resolveTierFeatures("founder_lifetime");
    expect(expected).toContain("Founder badge & early-supporter perks");
    for (const feature of resolveTierFeatures("pro_monthly")) {
      expect(panel.textContent).toContain(feature);
    }
  });

  it("orders inherited features deterministically across tiers (canonical order)", async () => {
    const { CANONICAL_FEATURE_ORDER } = await import("@/config/pricing");
    const pro = resolveTierFeatures("pro_monthly");
    const annual = resolveTierFeatures("pro_annual");
    const founder = resolveTierFeatures("founder_lifetime");

    // Same shared features must appear in the same relative order everywhere.
    const rank = (list: string[]) =>
      list.map((f) => CANONICAL_FEATURE_ORDER.indexOf(f));
    for (const list of [pro, annual, founder]) {
      const r = rank(list);
      const sorted = [...r].sort((a, b) => a - b);
      expect(r).toEqual(sorted);
    }

    // Shared subset (pro ∩ founder) is ordered identically in both tiers.
    const proSet = new Set(pro);
    const founderShared = founder.filter((f) => proSet.has(f));
    const proShared = pro.filter((f) => new Set(founder).has(f));
    expect(founderShared).toEqual(proShared);

    // Founder perk is anchored at the end of the canonical order.
    expect(founder[founder.length - 1]).toBe(
      "Founder badge & early-supporter perks",
    );
  });

  it("does not call Paddle.Checkout.open when success panel is shown", () => {
    renderPage(["/upgrade?checkout=success&plan=pro_monthly"]);
    expect(paddleMock.checkoutOpen).not.toHaveBeenCalled();
  });

  it("provides Settings, diary, and back-to-plans CTAs", () => {
    renderPage(["/upgrade?checkout=success"]);
    expect(screen.getByTestId("upgrade-success-settings")).toBeInTheDocument();
    expect(screen.getByTestId("upgrade-success-diary")).toBeInTheDocument();
    expect(screen.getByTestId("upgrade-success-plans")).toBeInTheDocument();
  });
});

describe("Upgrade page — success panel feature row identity", () => {
  it("assigns deterministic keys via successPanelFeatureRowKey for known features", async () => {
    const { successPanelFeatureRowKey, CANONICAL_FEATURE_ORDER } = await import(
      "@/config/pricing"
    );
    for (let i = 0; i < CANONICAL_FEATURE_ORDER.length; i++) {
      expect(successPanelFeatureRowKey(CANONICAL_FEATURE_ORDER[i])).toBe(
        `feat-${i}`,
      );
    }
  });

  it("assigns deterministic non-colliding keys for unknown feature strings", async () => {
    const { successPanelFeatureRowKey } = await import("@/config/pricing");
    const a = successPanelFeatureRowKey("Totally Made-Up Feature!");
    const b = successPanelFeatureRowKey("Totally Made-Up Feature!");
    const c = successPanelFeatureRowKey("Another Unknown");
    expect(a).toBe(b);
    expect(a.startsWith("feat-x-")).toBe(true);
    expect(a).not.toBe(c);
    // Never collides with canonical numeric-index namespace.
    expect(a).not.toMatch(/^feat-\d+$/);
  });

  it("falls back to a stable placeholder for empty / punctuation-only strings", async () => {
    const { successPanelFeatureRowKey } = await import("@/config/pricing");
    expect(successPanelFeatureRowKey("")).toBe("feat-x-unknown");
    expect(successPanelFeatureRowKey("!!!")).toBe("feat-x-unknown");
  });

  it("renders each feature row with a data-feature-key attribute", () => {
    renderPage(["/upgrade?checkout=success&plan=pro_monthly"]);
    const rows = screen.getAllByTestId("upgrade-success-feature-row");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const key = row.getAttribute("data-feature-key");
      expect(key).toBeTruthy();
      expect(key!).toMatch(/^feat-(\d+|x-[a-z0-9-]+)$/);
    }
    // All keys unique within the panel.
    const keys = rows.map((r) => r.getAttribute("data-feature-key")!);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("shares identical row keys for features common to multiple tiers", () => {
    renderPage(["/upgrade?checkout=success&plan=pro_monthly"]);
    const proKeys = new Map(
      screen
        .getAllByTestId("upgrade-success-feature-row")
        .map((r) => [r.textContent?.trim(), r.getAttribute("data-feature-key")]),
    );

    // Re-render for founder tier.
    renderPage(["/upgrade?checkout=success&plan=founder_lifetime"]);
    const founderRows = screen.getAllByTestId("upgrade-success-feature-row");
    let sharedChecked = 0;
    for (const row of founderRows) {
      const label = row.textContent?.trim();
      if (label && proKeys.has(label)) {
        expect(row.getAttribute("data-feature-key")).toBe(proKeys.get(label));
        sharedChecked++;
      }
    }
    expect(sharedChecked).toBeGreaterThan(0);
  });
});

describe("Upgrade page — success panel feature order snapshots", () => {
  const rowSnapshot = () =>
    screen.getAllByTestId("upgrade-success-feature-row").map((row) => ({
      key: row.getAttribute("data-feature-key"),
      text: row.textContent?.trim(),
    }));

  it("locks feature row order for Pro Monthly", () => {
    renderPage(["/upgrade?checkout=success&plan=pro_monthly"]);
    expect(rowSnapshot()).toMatchSnapshot();
  });

  it("locks feature row order for Pro Annual", () => {
    renderPage(["/upgrade?checkout=success&plan=pro_annual"]);
    expect(rowSnapshot()).toMatchSnapshot();
  });

  it("locks feature row order for Founder Lifetime", () => {
    renderPage(["/upgrade?checkout=success&plan=founder_lifetime"]);
    expect(rowSnapshot()).toMatchSnapshot();
  });
});

describe("sortSuccessPanelFeatures — unknown feature sorting", () => {
  it("sorts known canonical features before unknown features", async () => {
    const { sortSuccessPanelFeatures, CANONICAL_FEATURE_ORDER } = await import(
      "@/config/pricing"
    );
    const known1 = CANONICAL_FEATURE_ORDER[0];
    const known2 = CANONICAL_FEATURE_ORDER[1] ?? CANONICAL_FEATURE_ORDER[0];
    const input = ["zzz_unknown", known2, "aaa_unknown", known1];
    const out = sortSuccessPanelFeatures(input);
    const knownsInOut = out.filter(
      (f) => CANONICAL_FEATURE_ORDER.indexOf(f) !== -1,
    );
    const unknowns = out.filter(
      (f) => CANONICAL_FEATURE_ORDER.indexOf(f) === -1,
    );
    // Knowns first, in canonical order.
    expect(knownsInOut).toEqual(
      [...knownsInOut].sort(
        (a, b) =>
          CANONICAL_FEATURE_ORDER.indexOf(a) -
          CANONICAL_FEATURE_ORDER.indexOf(b),
      ),
    );
    // Every unknown appears after every known.
    const lastKnownIdx = out.lastIndexOf(knownsInOut[knownsInOut.length - 1]);
    const firstUnknownIdx = out.indexOf(unknowns[0]);
    expect(firstUnknownIdx).toBeGreaterThan(lastKnownIdx);
  });

  it("tie-breaks unknown features lexically (not by input index)", async () => {
    const { sortSuccessPanelFeatures } = await import("@/config/pricing");
    const out = sortSuccessPanelFeatures([
      "unknown_z",
      "unknown_a",
      "unknown_m",
      "unknown_b",
    ]);
    expect(out).toEqual(["unknown_a", "unknown_b", "unknown_m", "unknown_z"]);
  });

  it("is pure and does not mutate its input", async () => {
    const { sortSuccessPanelFeatures } = await import("@/config/pricing");
    const input = ["unknown_z", "unknown_a"];
    const snapshot = [...input];
    sortSuccessPanelFeatures(input);
    expect(input).toEqual(snapshot);
  });

  it("dedupes repeated entries deterministically", async () => {
    const { sortSuccessPanelFeatures } = await import("@/config/pricing");
    const out = sortSuccessPanelFeatures([
      "unknown_a",
      "unknown_a",
      "unknown_b",
      "unknown_a",
    ]);
    expect(out).toEqual(["unknown_a", "unknown_b"]);
  });

  it("orders known features by canonical index, not by input order", async () => {
    const { sortSuccessPanelFeatures, CANONICAL_FEATURE_ORDER } = await import(
      "@/config/pricing"
    );
    if (CANONICAL_FEATURE_ORDER.length < 2) return;
    const first = CANONICAL_FEATURE_ORDER[0];
    const last = CANONICAL_FEATURE_ORDER[CANONICAL_FEATURE_ORDER.length - 1];
    // Feed reversed: last-canonical first, first-canonical second.
    const out = sortSuccessPanelFeatures([last, first]);
    expect(out).toEqual([first, last]);
  });

  it("is deterministic across repeated calls with the same input", async () => {
    const { sortSuccessPanelFeatures, CANONICAL_FEATURE_ORDER } = await import(
      "@/config/pricing"
    );
    const input = [
      "unknown_z",
      CANONICAL_FEATURE_ORDER[0],
      "unknown_a",
      CANONICAL_FEATURE_ORDER[1] ?? CANONICAL_FEATURE_ORDER[0],
      "unknown_m",
    ];
    const runs = Array.from({ length: 5 }, () =>
      sortSuccessPanelFeatures(input),
    );
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]).toEqual(runs[0]);
    }
  });

  it("does not depend on runtime locale for unknown tie-break", async () => {
    // ASCII-only unknowns: sort must be codepoint-based (a < b < ... < z),
    // which is what a locale-independent comparator produces. localeCompare
    // under certain locales can reorder or ignore case/punctuation — this
    // asserts we do NOT rely on that behavior.
    const { sortSuccessPanelFeatures } = await import("@/config/pricing");
    const input = ["unknown-b", "unknown-A", "unknown-a", "unknown-B"];
    const out = sortSuccessPanelFeatures(input);
    // Uppercase codepoints (< 'a') come before lowercase.
    expect(out).toEqual(["unknown-A", "unknown-B", "unknown-a", "unknown-b"]);
  });
});

describe("Upgrade success panel — multi-unknown render determinism", () => {
  it("keeps data-feature-key values unique and deterministically ordered when multiple unknowns are present", async () => {
    const { PRICING_TIERS: TIERS } = await import("@/config/pricing");
    const pro = TIERS.find((t) => t.id === "pro_monthly")!;
    const original = [...pro.features];
    // Inject multiple unknown feature strings alongside canonical features.
    pro.features = [
      ...original,
      "Zeta experimental perk",
      "Alpha experimental perk",
      "Mid experimental perk",
    ] as unknown as typeof pro.features;
    try {
      renderPage(["/upgrade?checkout=success&plan=pro_monthly"]);
      const rows = screen.getAllByTestId("upgrade-success-feature-row");
      const keys = rows.map((r) => r.getAttribute("data-feature-key")!);
      // All keys unique.
      expect(new Set(keys).size).toBe(keys.length);
      // Known (`feat-\d+`) rows all appear before unknown (`feat-x-…`) rows.
      const firstUnknown = keys.findIndex((k) => k.startsWith("feat-x-"));
      const lastKnown = (() => {
        let idx = -1;
        keys.forEach((k, i) => {
          if (/^feat-\d+$/.test(k)) idx = i;
        });
        return idx;
      })();
      expect(firstUnknown).toBeGreaterThan(-1);
      expect(firstUnknown).toBeGreaterThan(lastKnown);
      // Unknown block itself is lexically ordered by underlying text.
      const unknownRows = rows.slice(firstUnknown);
      const unknownTexts = unknownRows.map((r) => r.textContent?.trim() ?? "");
      expect(unknownTexts).toEqual([...unknownTexts].sort());
    } finally {
      pro.features = original as unknown as typeof pro.features;
    }
  });
});

describe("Upgrade success panel — source guard", () => {
  it("does not use array-index keys for feature rows in Upgrade.tsx", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/pages/Upgrade.tsx", "utf8");
    expect(src).not.toMatch(/key=\{\s*(?:index|i|idx)\s*\}/);
  });
});

