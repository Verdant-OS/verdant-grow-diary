/**
 * anVerdantFeedingDemoViewModel — pure presentation shaping for the
 * Advanced Nutrients × Verdant fixture demo.
 */

import {
  AN_DEMO_CATALOG_DISCLOSURE,
  listAnDemoCatalog,
  type AnDemoCatalogProduct,
} from "./demoCatalog";
import {
  AN_VERDANT_DEMO_DISCLOSURE,
  AN_VERDANT_DEMO_HEADER,
  AN_VERDANT_DEMO_SUPPORTING,
  AN_VERDANT_DEMO_ROUTE,
} from "./anVerdantFeedingDemoCopy";
import {
  AN_VERDANT_DEMO_PLANT,
  buildAnVerdantAiDoctorSplit,
  buildAnVerdantActionQueueSuggestion,
  type AnVerdantAiDoctorSplit,
  type AnVerdantActionQueueDemoItem,
  type AnVerdantDemoPlantContext,
  type AnVerdantSavedFeedingEvent,
} from "./anVerdantFeedingDemoRules";

export interface AnVerdantFeedingDemoShellVM {
  readonly route: typeof AN_VERDANT_DEMO_ROUTE;
  readonly header: typeof AN_VERDANT_DEMO_HEADER;
  readonly supporting: typeof AN_VERDANT_DEMO_SUPPORTING;
  readonly disclosure: typeof AN_VERDANT_DEMO_DISCLOSURE;
  readonly catalogDisclosure: typeof AN_DEMO_CATALOG_DISCLOSURE;
  readonly plant: AnVerdantDemoPlantContext;
  readonly catalog: readonly AnDemoCatalogProduct[];
  readonly complementNote: string;
  readonly safetyNotes: readonly string[];
}

export function buildAnVerdantFeedingDemoShellVM(): AnVerdantFeedingDemoShellVM {
  return {
    route: AN_VERDANT_DEMO_ROUTE,
    header: AN_VERDANT_DEMO_HEADER,
    supporting: AN_VERDANT_DEMO_SUPPORTING,
    disclosure: AN_VERDANT_DEMO_DISCLOSURE,
    catalogDisclosure: AN_DEMO_CATALOG_DISCLOSURE,
    plant: AN_VERDANT_DEMO_PLANT,
    catalog: listAnDemoCatalog(),
    complementNote:
      "AN supplies products, feeding guidance, and cultivation expertise. Verdant records what the grower actually did, environment at the time, plant response, and grower-approved next step. This demo complements BudLabs — it is not a nutrient calculator, static chart, automatic doser, or BudLabs replacement.",
    safetyNotes: Object.freeze([
      "Fixture-only demo. No production writes.",
      "Amounts are grower-entered — never auto-populated from the catalog.",
      "Sensor missing / stale / demo states stay honestly labeled.",
      "AI Doctor separates Observed / Inferred / Unknown. No causation from one feed.",
      "Action Queue suggestion is approval-required. Nothing auto-executes. No device control.",
    ]),
  };
}

export interface AnVerdantPostSaveReviewVM {
  readonly event: AnVerdantSavedFeedingEvent;
  readonly aiDoctor: AnVerdantAiDoctorSplit;
  readonly actionQueue: AnVerdantActionQueueDemoItem;
  readonly timelineSummary: string;
  readonly evidenceLines: readonly string[];
}

export function buildAnVerdantPostSaveReviewVM(
  event: AnVerdantSavedFeedingEvent,
): AnVerdantPostSaveReviewVM {
  const aiDoctor = buildAnVerdantAiDoctorSplit(event);
  const actionQueue = buildAnVerdantActionQueueSuggestion(event);
  const productList = event.products
    .map((p) => `${p.name}${p.amount !== null ? ` ${p.amount}${p.unit ? ` ${p.unit}` : ""}` : ""}`)
    .join(", ");

  return {
    event,
    aiDoctor,
    actionQueue,
    timelineSummary: `Feeding · ${event.plant.plantLabel} · ${productList} · ${event.volumeMl} ml`,
    evidenceLines: Object.freeze([
      `Products: ${productList}`,
      `Photo: ${event.photo.label}`,
      `Sensor: ${event.sensorSummary}`,
      `Persistence: ${event.persistence} (idempotency ${event.reused ? "reuse" : "new"})`,
    ]),
  };
}
