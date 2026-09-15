/**
 * anVerdantFeedingDemoRules — pure rules for the Advanced Nutrients × Verdant
 * fixture-only feeding demo.
 *
 * Hard constraints:
 *  - No I/O, no React, no Supabase, no model calls, no device control.
 *  - Deterministic. No production writes.
 *  - Catalog selection ≠ grower-entered event.
 *  - Sensor truth: missing / stale / demo never presented as live or healthy.
 *  - AI Doctor buckets: Observed / Inferred / Unknown — no causation from one feed.
 *  - Action Queue suggestion is approval-required only; never auto-executed.
 */

import {
  AN_DEMO_BRAND,
  AN_DEMO_CATALOG,
  AN_DEMO_CATALOG_DISCLOSURE,
  findAnDemoProductById,
  type AnDemoCatalogProduct,
  type AnDemoCatalogSource,
} from "./demoCatalog";
import {
  AN_VERDANT_AQ_PREFERRED_RECOMMENDATION,
  AN_VERDANT_DEMO_LINE_ID,
  AN_VERDANT_DEMO_SENSOR_COPY,
  AN_VERDANT_MISSING_SENSOR_COPY,
  AN_VERDANT_STALE_SENSOR_COPY,
} from "./anVerdantFeedingDemoCopy";
import type { QuickLogFeedingFormState } from "@/lib/quickLogFeedingFormViewModel";
import {
  EMPTY_FEEDING_PRODUCT_ROW,
  EMPTY_QUICKLOG_FEEDING_FORM,
  buildFeedingFormPayload,
} from "@/lib/quickLogFeedingFormViewModel";
import type { AiDoctorActionQueueSuggestion } from "@/lib/aiDoctorEnginePhase1Foundation";

// ---------------------------------------------------------------------------
// Demo plant / grow fixture (visibly demo)
// ---------------------------------------------------------------------------

export interface AnVerdantDemoPlantContext {
  readonly growId: string;
  readonly growLabel: string;
  readonly tentId: string;
  readonly tentLabel: string;
  readonly plantId: string;
  readonly plantLabel: string;
  readonly stage: string;
  readonly strain: string;
  readonly demoOnly: true;
}

export const AN_VERDANT_DEMO_PLANT: AnVerdantDemoPlantContext = Object.freeze({
  growId: "demo-grow-an-verdant-001",
  growLabel: "Demo Grow — AN × Verdant (fixture)",
  tentId: "demo-tent-an-verdant-001",
  tentLabel: "Demo Tent A (fixture)",
  plantId: "demo-plant-an-verdant-001",
  plantLabel: "Demo Plant — Veg Week 2 (fixture)",
  stage: "veg",
  strain: "Demo Strain (fixture)",
  demoOnly: true as const,
});

// ---------------------------------------------------------------------------
// Sensor scenario
// ---------------------------------------------------------------------------

export type AnVerdantSensorScenario = "trustworthy" | "missing" | "stale" | "demo";

export interface AnVerdantSensorSnapshot {
  readonly source: "manual" | "demo" | "stale";
  readonly capturedAt: string;
  readonly temperatureC: number | null;
  readonly humidityPct: number | null;
  readonly vpdKpa: number | null;
  readonly confidence: "high" | "low" | "none";
  readonly freshness: "current" | "stale" | "missing" | "demo";
  readonly honestLabel: string;
  readonly isHealthyPresentation: false;
}

export function buildAnVerdantSensorSnapshot(
  scenario: AnVerdantSensorScenario,
  nowIso: string,
): AnVerdantSensorSnapshot | null {
  if (scenario === "missing") return null;

  if (scenario === "stale") {
    return {
      source: "stale",
      capturedAt: "2026-08-20T08:00:00.000Z",
      temperatureC: 24.1,
      humidityPct: 55,
      vpdKpa: 1.05,
      confidence: "low",
      freshness: "stale",
      honestLabel: AN_VERDANT_STALE_SENSOR_COPY,
      isHealthyPresentation: false,
    };
  }

  if (scenario === "demo") {
    return {
      source: "demo",
      capturedAt: nowIso,
      temperatureC: 25.0,
      humidityPct: 58,
      vpdKpa: 1.1,
      confidence: "none",
      freshness: "demo",
      honestLabel: AN_VERDANT_DEMO_SENSOR_COPY,
      isHealthyPresentation: false,
    };
  }

  // trustworthy → labeled manual (never fabricated as live)
  return {
    source: "manual",
    capturedAt: nowIso,
    temperatureC: 24.5,
    humidityPct: 57,
    vpdKpa: 1.08,
    confidence: "high",
    freshness: "current",
    honestLabel: "Manual sensor snapshot captured for this demo feeding event.",
    isHealthyPresentation: false,
  };
}

export function sensorEvidenceSummary(snapshot: AnVerdantSensorSnapshot | null): string {
  if (!snapshot) return AN_VERDANT_MISSING_SENSOR_COPY;
  return snapshot.honestLabel;
}

// ---------------------------------------------------------------------------
// Product metadata persisted alongside grower-entered amounts
// ---------------------------------------------------------------------------

export interface AnVerdantFeedingProductMeta {
  readonly productId: string;
  readonly brand: typeof AN_DEMO_BRAND;
  readonly name: string;
  readonly amount: number | null;
  readonly unit: string | null;
  readonly catalogSource: AnDemoCatalogSource;
}

export function applyCatalogProductToForm(
  form: QuickLogFeedingFormState,
  product: AnDemoCatalogProduct,
  rowIndex = 0,
): QuickLogFeedingFormState {
  const products = form.products.map((row) => ({ ...row }));
  while (products.length <= rowIndex) {
    products.push({ ...EMPTY_FEEDING_PRODUCT_ROW });
  }
  // Name only — never auto-populate amount/unit from catalog.
  products[rowIndex] = {
    ...products[rowIndex],
    name: product.name,
  };
  return {
    ...form,
    lineId: form.lineId.trim() === "" ? AN_VERDANT_DEMO_LINE_ID : form.lineId,
    products,
  };
}

export function buildDefaultAnDemoForm(): QuickLogFeedingFormState {
  return {
    ...EMPTY_QUICKLOG_FEEDING_FORM,
    lineId: AN_VERDANT_DEMO_LINE_ID,
    products: [{ ...EMPTY_FEEDING_PRODUCT_ROW }],
  };
}

/**
 * Enrich form products with catalog metadata for the in-memory demo event.
 * Catalog source stays demo_fixture when the name matches the catalog;
 * otherwise user_entered. Never labels a manual log as simulated.
 */
export function enrichProductsWithCatalogMeta(
  products: readonly Record<string, unknown>[],
  selectedProductIds: readonly string[],
): AnVerdantFeedingProductMeta[] {
  const selected = new Set(selectedProductIds);
  return products.map((raw) => {
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const amount =
      typeof raw.amount === "number" && Number.isFinite(raw.amount) ? raw.amount : null;
    const unit = typeof raw.unit === "string" && raw.unit.trim() !== "" ? raw.unit.trim() : null;

    const fromSelection = [...selected]
      .map((id) => findAnDemoProductById(id))
      .find((p) => p && p.name === name);

    const catalogMatch = fromSelection ?? AN_DEMO_CATALOG.find((p) => p.name === name) ?? null;

    if (catalogMatch) {
      return {
        productId: catalogMatch.productId,
        brand: AN_DEMO_BRAND,
        name: catalogMatch.name,
        amount,
        unit,
        catalogSource: "demo_fixture" as const,
      };
    }

    return {
      productId: `user-entered-${name.toLowerCase().replace(/\s+/g, "-") || "product"}`,
      brand: AN_DEMO_BRAND,
      name: name || "Unnamed product",
      amount,
      unit,
      catalogSource: "user_entered" as const,
    };
  });
}

// ---------------------------------------------------------------------------
// Photo evidence
// ---------------------------------------------------------------------------

export type AnVerdantPhotoState = "present" | "missing";

export interface AnVerdantPhotoEvidence {
  readonly state: AnVerdantPhotoState;
  readonly label: string;
}

export function buildPhotoEvidence(state: AnVerdantPhotoState): AnVerdantPhotoEvidence {
  if (state === "present") {
    return {
      state: "present",
      label: "Demo photo attached (fixture placeholder — not a real plant image upload).",
    };
  }
  return {
    state: "missing",
    label: "No photo attached for this feeding event (honest missing).",
  };
}

// ---------------------------------------------------------------------------
// In-memory saved event (no production write)
// ---------------------------------------------------------------------------

export interface AnVerdantSavedFeedingEvent {
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly reused: boolean;
  readonly occurredAt: string;
  readonly plant: AnVerdantDemoPlantContext;
  readonly lineId: string;
  readonly volumeMl: number;
  readonly products: readonly AnVerdantFeedingProductMeta[];
  readonly note: string | null;
  readonly photo: AnVerdantPhotoEvidence;
  readonly sensor: AnVerdantSensorSnapshot | null;
  readonly sensorSummary: string;
  readonly catalogDisclosure: typeof AN_DEMO_CATALOG_DISCLOSURE;
  readonly persistence: "in_memory_demo_only";
}

export type AnVerdantSaveResult =
  { ok: true; event: AnVerdantSavedFeedingEvent } | { ok: false; reason: string };

const priorSaves = new Map<string, AnVerdantSavedFeedingEvent>();

/** Test-only: clear idempotency cache. */
export function resetAnVerdantDemoSaveCache(): void {
  priorSaves.clear();
}

export interface AnVerdantSaveInput {
  form: QuickLogFeedingFormState;
  idempotencyKey: string;
  selectedProductIds: readonly string[];
  sensorScenario: AnVerdantSensorScenario;
  photoState: AnVerdantPhotoState;
  nowIso: string;
}

export function saveAnVerdantDemoFeeding(input: AnVerdantSaveInput): AnVerdantSaveResult {
  const mapped = buildFeedingFormPayload({
    growId: AN_VERDANT_DEMO_PLANT.growId,
    tentId: AN_VERDANT_DEMO_PLANT.tentId,
    plantId: AN_VERDANT_DEMO_PLANT.plantId,
    idempotencyKey: input.idempotencyKey,
    form: input.form,
  });

  if (!mapped.ok) {
    return { ok: false, reason: mapped.reason };
  }

  const existing = priorSaves.get(input.idempotencyKey);
  if (existing) {
    return { ok: true, event: { ...existing, reused: true } };
  }

  const products = enrichProductsWithCatalogMeta(
    mapped.payload.products as Record<string, unknown>[],
    input.selectedProductIds,
  );

  if (products.length === 0) {
    return { ok: false, reason: "products:empty" };
  }

  const sensor = buildAnVerdantSensorSnapshot(input.sensorScenario, input.nowIso);
  const event: AnVerdantSavedFeedingEvent = {
    eventId: `demo-feed-evt-${input.idempotencyKey.slice(0, 12)}`,
    idempotencyKey: input.idempotencyKey,
    reused: false,
    occurredAt: input.nowIso,
    plant: AN_VERDANT_DEMO_PLANT,
    lineId: mapped.payload.nutrient_line_id ?? mapped.payload.line_id ?? AN_VERDANT_DEMO_LINE_ID,
    volumeMl: mapped.payload.volume_ml,
    products,
    note: mapped.payload.note ?? null,
    photo: buildPhotoEvidence(input.photoState),
    sensor,
    sensorSummary: sensorEvidenceSummary(sensor),
    catalogDisclosure: AN_DEMO_CATALOG_DISCLOSURE,
    persistence: "in_memory_demo_only",
  };

  priorSaves.set(input.idempotencyKey, event);
  return { ok: true, event };
}

// ---------------------------------------------------------------------------
// AI Doctor — Observed / Inferred / Unknown
// ---------------------------------------------------------------------------

export interface AnVerdantEvidenceBucket {
  readonly kind: "observed" | "inferred" | "unknown";
  readonly title: string;
  readonly items: readonly string[];
}

export interface AnVerdantAiDoctorSplit {
  readonly observed: AnVerdantEvidenceBucket;
  readonly inferred: AnVerdantEvidenceBucket;
  readonly unknown: AnVerdantEvidenceBucket;
  readonly causationFence: string;
  readonly preferredFollowUp: string;
}

export function buildAnVerdantAiDoctorSplit(
  event: AnVerdantSavedFeedingEvent,
): AnVerdantAiDoctorSplit {
  const observed: string[] = [
    `Grower logged feeding on ${event.plant.plantLabel}.`,
    `Nutrient line: ${event.lineId}.`,
    `Applied volume: ${event.volumeMl} ml.`,
    ...event.products.map((p) => {
      const amt =
        p.amount === null ? "amount not entered" : `${p.amount}${p.unit ? ` ${p.unit}` : ""}`;
      return `Product applied: ${p.brand} ${p.name} (${amt}; catalogSource=${p.catalogSource}).`;
    }),
  ];

  if (event.note) observed.push(`Grower note: ${event.note}`);
  if (event.photo.state === "present") observed.push(event.photo.label);
  if (event.sensor && event.sensor.freshness === "current") {
    observed.push(
      `Sensor at save: source=${event.sensor.source}, captured_at=${event.sensor.capturedAt}, ` +
        `temp=${event.sensor.temperatureC}°C, RH=${event.sensor.humidityPct}%, VPD=${event.sensor.vpdKpa} kPa, ` +
        `confidence=${event.sensor.confidence}.`,
    );
  }

  const inferred: string[] = [
    "Plant response to this single feeding cannot be established from one event.",
  ];
  if (event.sensor?.freshness === "stale") {
    inferred.push("Stale sensor values are background only — not current plant environment.");
  }
  if (event.sensor?.freshness === "demo") {
    inferred.push("Demo sensor fixture is illustrative and must not be treated as live telemetry.");
  }

  const unknown: string[] = [];
  if (event.photo.state === "missing") unknown.push("Visual plant response (no photo).");
  if (!event.sensor || event.sensor.freshness === "missing") {
    unknown.push(AN_VERDANT_MISSING_SENSOR_COPY);
  }
  if (event.sensor && event.sensor.freshness !== "current") {
    unknown.push("Trustworthy current environment at feed time.");
  }
  unknown.push("Whether the applied amounts match the grower's intended protocol.");
  unknown.push("Multi-day plant response trajectory.");

  return {
    observed: {
      kind: "observed",
      title: "Observed",
      items: observed,
    },
    inferred: {
      kind: "inferred",
      title: "Inferred",
      items: inferred,
    },
    unknown: {
      kind: "unknown",
      title: "Unknown",
      items: unknown,
    },
    causationFence:
      "One feeding event does not establish causation. Do not change the feeding plan from this log alone.",
    preferredFollowUp: AN_VERDANT_AQ_PREFERRED_RECOMMENDATION,
  };
}

// ---------------------------------------------------------------------------
// Action Queue — approval-required suggestion (demo-route only, not persisted)
// ---------------------------------------------------------------------------

export interface AnVerdantActionQueueDemoItem {
  readonly id: string;
  readonly sourceFeedingEventId: string;
  readonly suggestion: AiDoctorActionQueueSuggestion;
  readonly status: "pending_approval";
  readonly deviceControl: false;
  readonly autoCreatedOnSave: false;
  readonly demoOnly: true;
  readonly label: string;
}

export function buildAnVerdantActionQueueSuggestion(
  event: AnVerdantSavedFeedingEvent,
): AnVerdantActionQueueDemoItem {
  return {
    id: `demo-aq-${event.eventId}`,
    sourceFeedingEventId: event.eventId,
    suggestion: {
      title: "Recheck plant before changing feeding plan",
      rationale: AN_VERDANT_AQ_PREFERRED_RECOMMENDATION,
      approval_required: true,
      risk_level: "low",
    },
    status: "pending_approval",
    deviceControl: false,
    autoCreatedOnSave: false,
    demoOnly: true,
    label:
      "Demo-route-only conservative suggestion. Approval-required. Nothing executes. Not written to production Action Queue.",
  };
}

export function isActionQueueExecutable(item: AnVerdantActionQueueDemoItem): false {
  void item;
  return false;
}
