import { beforeEach, describe, expect, it } from "vitest";
import {
  AN_DEMO_BRAND,
  AN_DEMO_CATALOG,
  AN_DEMO_CATALOG_DISCLOSURE,
  findAnDemoProductById,
  isAnDemoCatalogProductName,
  listAnDemoCatalog,
} from "@/lib/partners/advancedNutrients/demoCatalog";
import {
  AN_VERDANT_DEMO_DISCLOSURE,
  AN_VERDANT_DEMO_HEADER,
  AN_VERDANT_DEMO_SUPPORTING,
  AN_VERDANT_MISSING_SENSOR_COPY,
  AN_VERDANT_AQ_PREFERRED_RECOMMENDATION,
} from "@/lib/partners/advancedNutrients/anVerdantFeedingDemoCopy";
import {
  applyCatalogProductToForm,
  buildAnVerdantActionQueueSuggestion,
  buildAnVerdantAiDoctorSplit,
  buildAnVerdantSensorSnapshot,
  buildDefaultAnDemoForm,
  enrichProductsWithCatalogMeta,
  isActionQueueExecutable,
  resetAnVerdantDemoSaveCache,
  saveAnVerdantDemoFeeding,
  sensorEvidenceSummary,
} from "@/lib/partners/advancedNutrients/anVerdantFeedingDemoRules";
import {
  buildAnVerdantFeedingDemoShellVM,
  buildAnVerdantPostSaveReviewVM,
} from "@/lib/partners/advancedNutrients/anVerdantFeedingDemoViewModel";
import {
  EMPTY_QUICKLOG_FEEDING_FORM,
  buildFeedingFormPayload,
} from "@/lib/quickLogFeedingFormViewModel";

const NOW = "2026-08-26T18:00:00.000Z";

describe("AN demo catalog", () => {
  it("lists only Advanced Nutrients demo products with no dosages", () => {
    const catalog = listAnDemoCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(1);
    expect(catalog).toHaveLength(AN_DEMO_CATALOG.length);
    for (const p of catalog) {
      expect(p.brand).toBe(AN_DEMO_BRAND);
      expect(p.demoOnly).toBe(true);
      expect(p.amount).toBeNull();
      expect(p.unit).toBeNull();
    }
  });

  it("finds by id and recognizes catalog names", () => {
    const grow = findAnDemoProductById("an-demo-ph-perfect-grow");
    expect(grow?.name).toBe("pH Perfect Grow");
    expect(isAnDemoCatalogProductName("Big Bud")).toBe(true);
    expect(isAnDemoCatalogProductName("Unknown Sauce")).toBe(false);
  });

  it("exposes the required catalog disclosure", () => {
    expect(AN_DEMO_CATALOG_DISCLOSURE).toMatch(/Demo catalog/i);
    expect(AN_DEMO_CATALOG_DISCLOSURE).toMatch(/not an official feeding recommendation/i);
  });
});

describe("AN × Verdant demo copy fences", () => {
  it("uses approved header/supporting/disclosure without affirmative partnership claims", () => {
    expect(AN_VERDANT_DEMO_HEADER).toMatch(/Advanced Nutrients × Verdant/);
    expect(AN_VERDANT_DEMO_SUPPORTING.length).toBeGreaterThan(20);
    expect(AN_VERDANT_DEMO_DISCLOSURE).toMatch(/Concept demonstration/i);
    // User-supplied disclosure negates official / partnership claims.
    expect(AN_VERDANT_DEMO_DISCLOSURE).toMatch(/do not represent an official/i);
    expect(AN_VERDANT_DEMO_DISCLOSURE).toMatch(/announced partnership/i);
    expect(AN_VERDANT_DEMO_HEADER).not.toMatch(
      /\bofficial\b|\bapproved\b|\bpartner|\bintegrated\b/i,
    );
    expect(AN_VERDANT_DEMO_SUPPORTING).not.toMatch(
      /\bofficial\b|\bapproved\b|\bpartner|\bintegrated\b/i,
    );
    expect(AN_VERDANT_DEMO_DISCLOSURE).not.toMatch(/\bapproved\b|\bintegrated\b/i);
  });
});

describe("catalog apply + amounts/units", () => {
  it("fills product name only — never auto-populates amount or unit from catalog", () => {
    const product = findAnDemoProductById("an-demo-b-52")!;
    const next = applyCatalogProductToForm(buildDefaultAnDemoForm(), product, 0);
    expect(next.products[0].name).toBe("B-52");
    expect(next.products[0].amount).toBe("");
    expect(next.products[0].unit).toBe("ml_per_l");
  });

  it("requires grower-entered amount/unit/volume for a valid payload", () => {
    const form = applyCatalogProductToForm(
      buildDefaultAnDemoForm(),
      findAnDemoProductById("an-demo-big-bud")!,
      0,
    );
    const incomplete = buildFeedingFormPayload({
      growId: "demo-grow",
      idempotencyKey: "idem-key-12",
      form,
    });
    expect(incomplete.ok).toBe(false);

    const complete = buildFeedingFormPayload({
      growId: "demo-grow",
      idempotencyKey: "idem-key-12",
      form: {
        ...form,
        volumeMl: "1000",
        products: [{ name: "Big Bud", amount: "2", unit: "ml_per_l" }],
      },
    });
    expect(complete.ok).toBe(true);
    if (complete.ok) {
      const product = (complete.payload.products as Array<Record<string, unknown>>)[0];
      expect(product).toMatchObject({
        name: "Big Bud",
        amount: 2,
        unit: "ml_per_l",
      });
    }
  });
});

describe("sensor evidence honesty", () => {
  it("missing sensor yields honest missing copy", () => {
    expect(buildAnVerdantSensorSnapshot("missing", NOW)).toBeNull();
    expect(sensorEvidenceSummary(null)).toBe(AN_VERDANT_MISSING_SENSOR_COPY);
  });

  it("stale and demo snapshots are never healthy or live", () => {
    const stale = buildAnVerdantSensorSnapshot("stale", NOW)!;
    expect(stale.source).toBe("stale");
    expect(stale.freshness).toBe("stale");
    expect(stale.isHealthyPresentation).toBe(false);

    const demo = buildAnVerdantSensorSnapshot("demo", NOW)!;
    expect(demo.source).toBe("demo");
    expect(demo.freshness).toBe("demo");
    expect(demo.isHealthyPresentation).toBe(false);

    const manual = buildAnVerdantSensorSnapshot("trustworthy", NOW)!;
    expect(manual.source).toBe("manual");
    expect(manual.source).not.toBe("live");
  });
});

describe("save + enrich + idempotency", () => {
  beforeEach(() => {
    resetAnVerdantDemoSaveCache();
  });

  function readyForm() {
    return {
      ...buildDefaultAnDemoForm(),
      volumeMl: "750",
      products: [{ name: "pH Perfect Grow", amount: "4", unit: "ml_per_l" }],
      note: "Grower-entered demo note",
    };
  }

  it("persists enriched product metadata with catalogSource demo_fixture", () => {
    const enriched = enrichProductsWithCatalogMeta(
      [{ name: "pH Perfect Grow", amount: 4, unit: "ml_per_l" }],
      ["an-demo-ph-perfect-grow"],
    );
    expect(enriched[0]).toMatchObject({
      brand: AN_DEMO_BRAND,
      name: "pH Perfect Grow",
      amount: 4,
      unit: "ml_per_l",
      catalogSource: "demo_fixture",
      productId: "an-demo-ph-perfect-grow",
    });
  });

  it("saves in-memory with full evidence and reuses idempotency key", () => {
    const first = saveAnVerdantDemoFeeding({
      form: readyForm(),
      idempotencyKey: "an-demo-idem-abcdef12",
      selectedProductIds: ["an-demo-ph-perfect-grow"],
      sensorScenario: "trustworthy",
      photoState: "present",
      nowIso: NOW,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.event.persistence).toBe("in_memory_demo_only");
    expect(first.event.reused).toBe(false);
    expect(first.event.products[0].catalogSource).toBe("demo_fixture");

    const second = saveAnVerdantDemoFeeding({
      form: readyForm(),
      idempotencyKey: "an-demo-idem-abcdef12",
      selectedProductIds: ["an-demo-ph-perfect-grow"],
      sensorScenario: "missing",
      photoState: "missing",
      nowIso: NOW,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.event.reused).toBe(true);
    expect(second.event.eventId).toBe(first.event.eventId);
  });
});

describe("AI Doctor Observed / Inferred / Unknown + AQ approval", () => {
  beforeEach(() => {
    resetAnVerdantDemoSaveCache();
  });

  it("splits evidence and refuses causation; AQ stays approval-required", () => {
    const saved = saveAnVerdantDemoFeeding({
      form: {
        ...buildDefaultAnDemoForm(),
        volumeMl: "500",
        products: [{ name: "Overdrive", amount: "1", unit: "ml_per_l" }],
      },
      idempotencyKey: "an-demo-idem-ai-doc-01",
      selectedProductIds: ["an-demo-overdrive"],
      sensorScenario: "missing",
      photoState: "missing",
      nowIso: NOW,
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const split = buildAnVerdantAiDoctorSplit(saved.event);
    expect(split.observed.items.length).toBeGreaterThan(0);
    expect(split.inferred.items.some((i) => /causation|single feeding/i.test(i))).toBe(true);
    expect(split.unknown.items).toContain(AN_VERDANT_MISSING_SENSOR_COPY);
    expect(split.causationFence).toMatch(/does not establish causation/i);
    expect(split.preferredFollowUp).toBe(AN_VERDANT_AQ_PREFERRED_RECOMMENDATION);

    const aq = buildAnVerdantActionQueueSuggestion(saved.event);
    expect(aq.status).toBe("pending_approval");
    expect(aq.suggestion.approval_required).toBe(true);
    expect(aq.deviceControl).toBe(false);
    expect(aq.autoCreatedOnSave).toBe(false);
    expect(aq.sourceFeedingEventId).toBe(saved.event.eventId);
    expect(isActionQueueExecutable(aq)).toBe(false);
  });
});

describe("non-AN feeding regression (form mapper unchanged)", () => {
  it("still maps a manual non-catalog product without AN branding requirements", () => {
    const result = buildFeedingFormPayload({
      growId: "grow-1",
      idempotencyKey: "non-an-feed-01",
      form: {
        ...EMPTY_QUICKLOG_FEEDING_FORM,
        lineId: "house-line",
        volumeMl: "400",
        products: [{ name: "Generic Bloom", amount: "3", unit: "ml_per_l" }],
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const product = (result.payload.products as Array<Record<string, unknown>>)[0];
    expect(product).toEqual({
      name: "Generic Bloom",
      amount: 3,
      unit: "ml_per_l",
    });
    expect(product).not.toHaveProperty("brand");
    expect(product).not.toHaveProperty("catalogSource");
  });
});

describe("shell + post-save view models", () => {
  beforeEach(() => {
    resetAnVerdantDemoSaveCache();
  });

  it("shell carries disclosure and catalog", () => {
    const shell = buildAnVerdantFeedingDemoShellVM();
    expect(shell.catalogDisclosure).toBe(AN_DEMO_CATALOG_DISCLOSURE);
    expect(shell.catalog.length).toBe(AN_DEMO_CATALOG.length);
    expect(shell.plant.demoOnly).toBe(true);
  });

  it("post-save review includes evidence summary lines", () => {
    const saved = saveAnVerdantDemoFeeding({
      form: {
        ...buildDefaultAnDemoForm(),
        volumeMl: "600",
        products: [{ name: "pH Perfect Micro", amount: "2", unit: "ml_per_l" }],
      },
      idempotencyKey: "an-demo-idem-review-01",
      selectedProductIds: ["an-demo-ph-perfect-micro"],
      sensorScenario: "stale",
      photoState: "present",
      nowIso: NOW,
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const review = buildAnVerdantPostSaveReviewVM(saved.event);
    expect(review.evidenceLines.some((l) => /Sensor:/i.test(l))).toBe(true);
    expect(review.evidenceLines.some((l) => /Photo:/i.test(l))).toBe(true);
    expect(review.aiDoctor.observed.kind).toBe("observed");
  });
});
