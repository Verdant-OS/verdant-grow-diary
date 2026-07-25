/**
 * sell-vs-grant parity — what we SELL must equal what we GRANT.
 *
 * Motivated by a real shipped defect: Craft is marketed as "Everything in Pro"
 * and `planCatalog` defines CRAFT_CAPABILITIES as a literal superset of
 * PRO_CAPABILITIES — yet Craft was absent from the Pheno Tracker allow-list at
 * BOTH the client (`featureEntitlements.PRO_PLAN_IDS`) and the database
 * (`has_pheno_tracker_entitlement`), and from the edge gate
 * (`_shared/assertPhenoTrackerEntitlement`). A paying Craft subscriber was
 * denied a feature the pricing page promises.
 *
 * The invariant is deliberately derived, never hard-coded to Craft: any plan
 * whose capabilities dominate Pro's must be granted every FeatureKey, at every
 * gate. That keeps working for the next tier without editing this file, and a
 * fix that lands at two of three gates still fails loudly.
 *
 * Scope fence — this asserts CAPABILITY→GRANT consistency only. It deliberately
 * does NOT try to parse marketing prose into capability flags: nothing links
 * "Pro Blueprint: live per-stage SOP scoring" to `capabilities.blueprint`
 * except human intent, and a fuzzy matcher there would manufacture false
 * confidence. It also cannot prove the DEPLOYED database matches these
 * migration files (see project memory: migration files ≠ live prod).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { KNOWN_PLAN_IDS, PLAN_CATALOG } from "@/lib/entitlements/planCatalog";
import { SUBSCRIPTION_PLAN_IDS } from "@/lib/paidPlanAllowlist";
import {
  FEATURE_KEYS,
  canReadExistingFeatureData,
  canUseFeature,
  canWriteFeatureData,
} from "@/lib/featureEntitlements";
import type { Capabilities, PlanId, ResolvedEntitlement } from "@/lib/entitlements/types";

const PRO: Capabilities = PLAN_CATALOG.pro_monthly;

/**
 * Does `a` deliver at least what `b` does for one capability?
 *
 * `null` means "unlimited" for maxActiveGrows / sensorHistoryDays, so it
 * dominates any number. aiCreditsPerGrow uses `null` to mean "n/a — uses the
 * monthly bucket", which is likewise not a downgrade from a finite per-grow
 * taste. Equal values always dominate, which keeps the comparator honest for
 * the `null === null` case rather than leaning on the unlimited rule.
 */
function dominatesCapability(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof b === "boolean") return b === false && a === true;
  if (a === null) return true; // unlimited / not-applicable beats any finite cap
  if (b === null) return false;
  if (typeof a === "number" && typeof b === "number") return a >= b;
  return false;
}

function dominatesPro(plan: PlanId): boolean {
  const caps = PLAN_CATALOG[plan];
  return (Object.keys(PRO) as Array<keyof Capabilities>).every((key) =>
    dominatesCapability(caps[key], PRO[key]),
  );
}

function activeEntitlement(plan: PlanId): ResolvedEntitlement {
  return {
    effectivePlanId: plan,
    displayPlanId: plan,
    status: "active",
    isActive: true,
    capabilities: PLAN_CATALOG[plan],
    degraded: false,
    degradedReason: null,
    isStaff: false,
  };
}

/** Newest migration that DEFINES the function — mentions do not count. */
function latestMigrationDefining(fnSignature: string): string {
  const dir = resolve(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (let i = files.length - 1; i >= 0; i -= 1) {
    const body = readFileSync(join(dir, files[i]), "utf8");
    if (body.includes(`CREATE OR REPLACE FUNCTION ${fnSignature}`)) return body;
  }
  throw new Error(`No migration defines ${fnSignature}`);
}

/**
 * Isolate ONE function's body from a migration that may define several.
 *
 * Scoping matters: `20260717193000_entitlement_status_parity.sql` defines both
 * `has_pheno_tracker_entitlement` and `ai_credit_spend`, and the latter
 * contains `COALESCE(v_lov_plan, 'free')`. A whole-file scan therefore reports
 * `free` as Pheno-Tracker-granted — a false reading that would make this suite
 * assert a fiction.
 */
function functionBody(sql: string, fnSignature: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${fnSignature}`);
  if (start === -1) throw new Error(`Migration does not define ${fnSignature}`);
  const tagMatch = sql.slice(start).match(/AS (\$[A-Za-z_]*\$)/);
  if (!tagMatch) throw new Error(`Could not find a dollar-quoted body for ${fnSignature}`);
  const tag = tagMatch[1];
  const bodyStart = sql.indexOf(tag, start) + tag.length;
  const bodyEnd = sql.indexOf(tag, bodyStart);
  if (bodyEnd === -1) throw new Error(`Unterminated body for ${fnSignature}`);
  return sql.slice(bodyStart, bodyEnd);
}

/** Every known plan id quoted inside the given SQL body, as a set. */
function planIdsMentionedInSql(sql: string): ReadonlySet<string> {
  const found = new Set<string>();
  for (const plan of KNOWN_PLAN_IDS) {
    if (sql.includes(`'${plan}'`)) found.add(plan);
  }
  return found;
}

const PHENO_FN = "public.has_pheno_tracker_entitlement";

function phenoSqlGrantedPlans(): ReadonlySet<string> {
  return planIdsMentionedInSql(functionBody(latestMigrationDefining(PHENO_FN), PHENO_FN));
}

/**
 * The webhook's price allow-list — the FIRST grant gate, chronologically.
 *
 * A price id missing from it makes `decide()` return `unknown_price_id`, so no
 * `subscriptions` row is written at all and the buyer resolves as Free. The
 * three entitlement gates are then unreachable: they would all agree the plan
 * is entitled, about a subscription that does not exist. Paddle still receives
 * a 200, so a real charge fails silently.
 */
function webhookGrantedPriceIds(): ReadonlySet<string> {
  // Reads the shared source of truth instead of scraping the edge module.
  // KNOWN_PRICE_IDS is now DERIVED from SUBSCRIPTION_PLAN_IDS — it used to be
  // a hand-maintained literal, which is exactly how Craft went missing — so
  // scanning for an array literal would find nothing and fail spuriously.
  //
  // The assertion stays meaningful rather than tautological: it still
  // cross-checks two independent modules — the entitlements plan catalog
  // (KNOWN_PLAN_IDS, "what can we grant capabilities for") against the paid
  // plan allow-list ("what do we accept money for"). Those must agree.
  return new Set<string>(SUBSCRIPTION_PLAN_IDS);
}

/**
 * The edge gate keeps its own copy of the allow-list and does not export it,
 * so it is read as text — the same static-scan technique this repo already
 * uses for migration SQL. Reading beats exporting here: it needs no
 * production change to become testable.
 */
function edgeGatePlanIds(): ReadonlySet<string> {
  const source = readFileSync(
    resolve(process.cwd(), "supabase", "functions", "_shared", "assertPhenoTrackerEntitlement.ts"),
    "utf8",
  );
  const block = source.match(/const PRO_PLAN_IDS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  if (!block) throw new Error("Could not locate PRO_PLAN_IDS in assertPhenoTrackerEntitlement.ts");
  const found = new Set<string>();
  for (const plan of KNOWN_PLAN_IDS) {
    if (block[1].includes(`"${plan}"`) || block[1].includes(`'${plan}'`)) found.add(plan);
  }
  return found;
}

const DOMINATING_PLANS = KNOWN_PLAN_IDS.filter(dominatesPro);

describe("sell-vs-grant parity", () => {
  // Guards against a comparator bug making every other assertion vacuously
  // true — the failure mode that would let this suite stay green while the
  // very bug it exists to catch is present.
  it("derives a non-trivial set of Pro-dominating plans that excludes free", () => {
    expect(DOMINATING_PLANS.length).toBeGreaterThan(1);
    expect(DOMINATING_PLANS).toContain("pro_monthly");
    expect(DOMINATING_PLANS).not.toContain("free");
    expect(dominatesPro("free")).toBe(false);
  });

  it("grants every feature to every Pro-dominating plan at the client gate", () => {
    for (const plan of DOMINATING_PLANS) {
      const entitlement = activeEntitlement(plan);
      for (const feature of FEATURE_KEYS) {
        expect(
          canUseFeature(entitlement, feature),
          `${plan} dominates Pro's capabilities but canUseFeature denied "${feature}"`,
        ).toBe(true);
        expect(
          canWriteFeatureData(entitlement, feature),
          `${plan} dominates Pro's capabilities but canWriteFeatureData denied "${feature}"`,
        ).toBe(true);
        expect(
          canReadExistingFeatureData(entitlement, feature),
          `${plan} dominates Pro's capabilities but canReadExistingFeatureData denied "${feature}"`,
        ).toBe(true);
      }
    }
  });

  it("grants Pheno Tracker to every Pro-dominating plan at the database gate", () => {
    const granted = phenoSqlGrantedPlans();
    for (const plan of DOMINATING_PLANS) {
      expect(
        granted.has(plan),
        `${plan} dominates Pro's capabilities but has_pheno_tracker_entitlement never names it`,
      ).toBe(true);
    }
  });

  it("grants Pheno Tracker to every Pro-dominating plan at the edge gate", () => {
    const granted = edgeGatePlanIds();
    for (const plan of DOMINATING_PLANS) {
      expect(
        granted.has(plan),
        `${plan} dominates Pro's capabilities but the edge PRO_PLAN_IDS omits it — ` +
          `a client+database fix that skips this gate still denies the feature server-side`,
      ).toBe(true);
    }
  });

  // The gate that runs FIRST. Without it the other three are unreachable —
  // they would agree the plan is entitled, about a subscription row that was
  // never written. This is the difference between "sold but degraded" and
  // "charged and granted nothing", so it is asserted for every purchasable
  // plan, not only the Pro-dominating ones.
  it("persists a subscription for every purchasable plan at the webhook gate", () => {
    const granted = webhookGrantedPriceIds();
    const purchasable = KNOWN_PLAN_IDS.filter((plan) => plan !== "free");
    for (const plan of purchasable) {
      expect(
        granted.has(plan),
        `${plan} is a purchasable plan but KNOWN_PRICE_IDS omits it — a completed ` +
          `payment is skipped as unknown_price_id, no subscriptions row is written, ` +
          `and the buyer resolves as Free while Paddle still receives a 200`,
      ).toBe(true);
    }
  });

  it("keeps the three grant sites in agreement with each other", () => {
    // Catches a partial fix that lands at some gates but not all, even for a
    // plan that does not dominate Pro.
    const sqlGranted = phenoSqlGrantedPlans();
    const edgeGranted = edgeGatePlanIds();
    const clientGranted = KNOWN_PLAN_IDS.filter((plan) =>
      canUseFeature(activeEntitlement(plan), "pheno_tracker"),
    );
    expect([...edgeGranted].sort()).toEqual([...clientGranted].sort());
    expect([...sqlGranted].sort()).toEqual([...clientGranted].sort());
  });
});
