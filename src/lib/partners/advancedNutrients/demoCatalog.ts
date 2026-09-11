/**
 * Advanced Nutrients × Verdant — isolated demo product catalog.
 *
 * Narrow fixture only. Not an official feeding recommendation.
 * Every entry is demoOnly. No dosages, no marketing claims, no logo.
 * Catalog selection is not the grower-entered feeding event.
 */

export const AN_DEMO_BRAND = "Advanced Nutrients" as const;

export const AN_DEMO_CATALOG_DISCLOSURE =
  "Demo catalog — not an official feeding recommendation" as const;

export type AnDemoCatalogSource = "demo_fixture" | "user_entered" | "approved_catalog";

export interface AnDemoCatalogProduct {
  readonly productId: string;
  readonly brand: typeof AN_DEMO_BRAND;
  readonly name: string;
  readonly demoOnly: true;
  /** Catalog never carries dosages. Grower enters amount/unit separately. */
  readonly amount: null;
  readonly unit: null;
}

export const AN_DEMO_CATALOG: readonly AnDemoCatalogProduct[] = Object.freeze([
  Object.freeze({
    productId: "an-demo-ph-perfect-grow",
    brand: AN_DEMO_BRAND,
    name: "pH Perfect Grow",
    demoOnly: true as const,
    amount: null,
    unit: null,
  }),
  Object.freeze({
    productId: "an-demo-ph-perfect-micro",
    brand: AN_DEMO_BRAND,
    name: "pH Perfect Micro",
    demoOnly: true as const,
    amount: null,
    unit: null,
  }),
  Object.freeze({
    productId: "an-demo-ph-perfect-bloom",
    brand: AN_DEMO_BRAND,
    name: "pH Perfect Bloom",
    demoOnly: true as const,
    amount: null,
    unit: null,
  }),
  Object.freeze({
    productId: "an-demo-b-52",
    brand: AN_DEMO_BRAND,
    name: "B-52",
    demoOnly: true as const,
    amount: null,
    unit: null,
  }),
  Object.freeze({
    productId: "an-demo-big-bud",
    brand: AN_DEMO_BRAND,
    name: "Big Bud",
    demoOnly: true as const,
    amount: null,
    unit: null,
  }),
  Object.freeze({
    productId: "an-demo-overdrive",
    brand: AN_DEMO_BRAND,
    name: "Overdrive",
    demoOnly: true as const,
    amount: null,
    unit: null,
  }),
]);

export function listAnDemoCatalog(): readonly AnDemoCatalogProduct[] {
  return AN_DEMO_CATALOG;
}

export function findAnDemoProductById(productId: string): AnDemoCatalogProduct | null {
  const id = productId.trim();
  if (!id) return null;
  return AN_DEMO_CATALOG.find((p) => p.productId === id) ?? null;
}

export function isAnDemoCatalogProductName(name: string): boolean {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return false;
  return AN_DEMO_CATALOG.some((p) => p.name.toLowerCase() === trimmed);
}
