/**
 * Static ownership guard: proves the canonical checkout topology stays intact.
 *
 *   - The ONLY user-facing callers of `usePaddleCheckout` are the two
 *     checkout surfaces trunk ships today: Pricing.tsx and Upgrade.tsx.
 *     Everything else stays checkout-free, and no page ever opens Paddle
 *     directly (`Paddle.Checkout`) — the hook is the single canonical path.
 *   - `LegacyBillingRedirect.tsx` only navigates (no Paddle imports).
 *   - `PhenoTrackerUpgradeGate`, `StartPhenoHuntButton`, and the auth
 *     intent/resume machinery continue targeting `/pricing`, never
 *     `/upgrade` and never `/billing/*`.
 *   - No visible CTA (`to=`/`href=`) targets `/billing/*`.
 *   - The retired `BillingPlaceholder` module is not imported anywhere.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve(__dirname, "..");

function readAllSource(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (
        /\.(t|j)sx?$/.test(entry) &&
        !/\.test\.(t|j)sx?$/.test(entry)
      ) {
        out.push({ file: full, text: readFileSync(full, "utf8") });
      }
    }
  };
  walk(SRC);
  return out;
}

const ALL = readAllSource();

const RUNTIME_ROOTS = ["pages", "components", "hooks", "lib", "store"].map(
  (r) => resolve(SRC, r),
);

function isRuntime(file: string): boolean {
  return RUNTIME_ROOTS.some((r) => file.startsWith(r));
}

describe("Canonical checkout ownership — static guard", () => {
  it("only the two shipped checkout surfaces call usePaddleCheckout", () => {
    // Trunk deliberately wired Upgrade.tsx to the same canonical hook
    // Pricing uses. The guard now pins the exact caller set so any NEW
    // checkout surface still fails loudly.
    const ALLOWED = [
      /pages[\\/]+Pricing\.tsx$/,
      /pages[\\/]+Upgrade\.tsx$/,
    ];
    const callers = ALL.filter(
      (f) =>
        isRuntime(f.file) &&
        /from\s+["']@\/hooks\/usePaddleCheckout["']/.test(f.text),
    ).map((f) => f.file);
    const filtered = callers.filter((c) => !c.endsWith("usePaddleCheckout.ts"));
    expect(filtered.length).toBe(ALLOWED.length);
    for (const caller of filtered) {
      expect(
        ALLOWED.some((rx) => rx.test(caller)),
        `unexpected usePaddleCheckout caller: ${caller}`,
      ).toBe(true);
    }
  });

  it("no page opens Paddle directly — the canonical hook is the only path", () => {
    for (const f of ALL) {
      if (!isRuntime(f.file)) continue;
      if (f.file.endsWith("usePaddleCheckout.ts")) continue;
      expect(
        /Paddle\.Checkout/.test(f.text),
        `${f.file} must not call Paddle.Checkout directly`,
      ).toBe(false);
    }
  });

  it("LegacyBillingRedirect.tsx only navigates — no Paddle surface", () => {
    const f = ALL.find((x) => x.file.endsWith("pages/LegacyBillingRedirect.tsx"));
    expect(f).toBeDefined();
    expect(f!.text).not.toMatch(/usePaddleCheckout/);
    expect(f!.text).not.toMatch(/Paddle\.Checkout/);
    expect(f!.text).not.toMatch(/openCheckout/);
    expect(f!.text).toMatch(/<Navigate\s/);
  });

  it("PhenoTrackerUpgradeGate targets /pricing (never /upgrade or /billing)", () => {
    const f = ALL.find((x) =>
      x.file.endsWith("components/PhenoTrackerUpgradeGate.tsx"),
    );
    expect(f).toBeDefined();
    expect(f!.text).toMatch(/["']\/pricing/);
    expect(f!.text).not.toMatch(/["']\/upgrade["'`?]/);
    expect(f!.text).not.toMatch(/["']\/billing\//);
  });

  it("StartPhenoHuntButton targets /pricing (never /upgrade or /billing)", () => {
    const f = ALL.find((x) =>
      x.file.endsWith("components/StartPhenoHuntButton.tsx"),
    );
    expect(f).toBeDefined();
    expect(f!.text).toMatch(/\/pricing\?returnTo=/);
    expect(f!.text).not.toMatch(/\/upgrade\?returnTo=/);
    expect(f!.text).not.toMatch(/\/billing\//);
  });

  it("checkoutPlanIntent resume targets /pricing (never /upgrade)", () => {
    const f = ALL.find((x) => x.file.endsWith("lib/checkoutPlanIntent.ts"));
    expect(f).toBeDefined();
    // Any hardcoded resume href/path should reference /pricing.
    const upgradeHrefs = f!.text.match(/["']\/upgrade["'?]/g) ?? [];
    expect(upgradeHrefs).toEqual([]);
  });

  it("no runtime file (outside tests + LegacyBillingRedirect) links to /billing/*", () => {
    const linkRx = /(?:to|href)=["']\/billing\/[a-zA-Z0-9_-]+/g;
    const offenders = ALL.filter(
      (f) =>
        isRuntime(f.file) &&
        !f.file.endsWith("pages/LegacyBillingRedirect.tsx") &&
        linkRx.test(f.text),
    ).map((f) => f.file);
    expect(offenders).toEqual([]);
  });

  it("no runtime file imports the retired BillingPlaceholder module", () => {
    const offenders = ALL.filter(
      (f) =>
        isRuntime(f.file) &&
        /from\s+["']@\/pages\/BillingPlaceholder["']/.test(f.text),
    ).map((f) => f.file);
    expect(offenders).toEqual([]);
  });
});
