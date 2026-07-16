/**
 * Static ownership guard: proves the canonical checkout topology stays intact.
 *
 *   - `/pricing` (Pricing.tsx) is the sole routed user-facing caller of
 *     `usePaddleCheckout`; the retired Upgrade presenter may delegate to the
 *     same hook but is not mounted by App.tsx.
 *   - `/upgrade` and `/billing/:plan` are compatibility redirects to
 *     canonical `/pricing` and never mount a second checkout surface.
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

function normalizePath(path: string): string {
  return path.split("\\").join("/");
}

function readAllSource(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (/\.(t|j)sx?$/.test(entry) && !/\.test\.(t|j)sx?$/.test(entry)) {
        out.push({ file: normalizePath(full), text: readFileSync(full, "utf8") });
      }
    }
  };
  walk(SRC);
  return out;
}

const ALL = readAllSource();

const RUNTIME_ROOTS = ["pages", "components", "hooks", "lib", "store"].map((r) =>
  normalizePath(resolve(SRC, r)),
);

function isRuntime(file: string): boolean {
  return RUNTIME_ROOTS.some((r) => file.startsWith(r));
}

describe("Canonical checkout ownership — static guard", () => {
  it("keeps checkout opening in the canonical hook across approved presenters", () => {
    const callers = ALL.filter(
      (f) => isRuntime(f.file) && /from\s+["']@\/hooks\/usePaddleCheckout["']/.test(f.text),
    )
      .map((f) => f.file)
      .filter((file) => !file.endsWith("usePaddleCheckout.ts"))
      .map((file) => file.slice(file.lastIndexOf("/src/") + 5))
      .sort();

    expect(callers).toEqual(["pages/Pricing.tsx", "pages/Upgrade.tsx"]);

    const app = ALL.find((entry) => entry.file.endsWith("/src/App.tsx"));
    const retiredUpgrade = ALL.find((entry) => entry.file.endsWith("/src/pages/Upgrade.tsx"));
    expect(app).toBeDefined();
    expect(retiredUpgrade).toBeDefined();
    expect(app!.text).not.toMatch(/import\(["']\.\/pages\/Upgrade["']\)/);
    expect(app!.text).toMatch(/path="\/upgrade"\s+element=\{<LegacyUpgradeRedirect\s*\/>\}/);
    expect(retiredUpgrade!.text).not.toMatch(/Paddle\.Checkout\.open\s*\(/);
  });

  it("legacy checkout routes only navigate — no Paddle or plan presenter", () => {
    for (const filename of ["LegacyBillingRedirect.tsx", "LegacyUpgradeRedirect.tsx"]) {
      const f = ALL.find((x) => x.file.endsWith(`pages/${filename}`));
      expect(f, `${filename} must exist`).toBeDefined();
      expect(f!.text).not.toMatch(/usePaddleCheckout/);
      expect(f!.text).not.toMatch(/Paddle\.Checkout/);
      expect(f!.text).not.toMatch(/openCheckout/);
      expect(f!.text).toMatch(/<Navigate\s/);
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

  it("PhenoTrackerUpgradeGate targets /pricing (never /upgrade or /billing)", () => {
    const f = ALL.find((x) => x.file.endsWith("components/PhenoTrackerUpgradeGate.tsx"));
    expect(f).toBeDefined();
    expect(f!.text).toMatch(/["']\/pricing/);
    expect(f!.text).not.toMatch(/["']\/upgrade["'`?]/);
    expect(f!.text).not.toMatch(/["']\/billing\//);
  });

  it("StartPhenoHuntButton targets /pricing (never /upgrade or /billing)", () => {
    const f = ALL.find((x) => x.file.endsWith("components/StartPhenoHuntButton.tsx"));
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
      (f) => isRuntime(f.file) && /from\s+["']@\/pages\/BillingPlaceholder["']/.test(f.text),
    ).map((f) => f.file);
    expect(offenders).toEqual([]);
  });
});
