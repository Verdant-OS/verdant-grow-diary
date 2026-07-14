/**
<<<<<<< HEAD
 * phenoComparisonFixtures
 *
 * Deterministic, demo-labeled candidate rows for the read-only Pheno
 * Comparison preview page. Pure data. No I/O. No randomness. No writes.
 */
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";

export const PHENO_COMPARISON_DEMO_BANNER =
  "Demo comparison data — not live sensor data. Preview surface only.";

export const PHENO_COMPARISON_DEMO_CANDIDATES: readonly PhenoCandidateInput[] = [
  {
    candidateId: "demo-cand-alpha",
    candidateLabel: "Alpha #1",
    growLabel: "Demo Grow",
    tentLabel: "Tent A",
    plantLabel: "Plant Alpha",
    strain: "Demo Kush",
    stage: "flower",
    requireEcPh: true,
    requirePpfd: true,
    quickLogEntries: [
      {
        id: "ql-a-1",
        at: "2026-06-20T08:00:00.000Z",
        kind: "note",
        note: "Even canopy. No stress signs.",
      },
      {
        id: "ql-a-2",
        at: "2026-06-19T18:00:00.000Z",
        kind: "watering",
        note: "500ml pH 6.2.",
      },
    ],
    timelineEvents: [
      {
        id: "tl-a-1",
        at: "2026-06-20T08:05:00.000Z",
        kind: "diary",
        summary: "Note logged",
      },
      {
        id: "tl-a-2",
        at: "2026-06-19T18:05:00.000Z",
        kind: "watering",
        summary: "Watering logged",
      },
    ],
    photos: [
      {
        id: "ph-a-1",
        at: "2026-06-20T08:00:00.000Z",
        caption: "Canopy top-down (demo)",
      },
    ],
    sensorSnapshots: [
      {
        id: "sn-a-1",
        source: "live",
        capturedAt: "2026-06-20T08:00:00.000Z",
        tempF: 76,
        rh: 58,
        vpd: 1.05,
        ec: 1.6,
        ph: 6.1,
        ppfd: 720,
      },
      {
        id: "sn-a-2",
        source: "manual",
        capturedAt: "2026-06-19T18:00:00.000Z",
        tempF: 78,
        rh: 55,
        vpd: 1.18,
        ec: 1.7,
        ph: 6.2,
        ppfd: null,
      },
    ],
  },
  {
    candidateId: "demo-cand-bravo",
    candidateLabel: "Bravo #2",
    growLabel: "Demo Grow",
    tentLabel: "Tent A",
    plantLabel: "Plant Bravo",
    strain: "Demo Kush",
    stage: "flower",
    requireEcPh: true,
    requirePpfd: true,
    quickLogEntries: [
      {
        id: "ql-b-1",
        at: "2026-06-19T09:00:00.000Z",
        kind: "note",
        note: "Slight leaf droop on lower fans.",
      },
    ],
    timelineEvents: [
      {
        id: "tl-b-1",
        at: "2026-06-19T09:05:00.000Z",
        kind: "diary",
        summary: "Note logged",
      },
    ],
    photos: [],
    sensorSnapshots: [
      {
        id: "sn-b-1",
        source: "csv",
        capturedAt: "2026-06-18T12:00:00.000Z",
        tempF: 74,
        rh: 62,
        vpd: 0.92,
        ec: null,
        ph: null,
        ppfd: 540,
      },
      {
        id: "sn-b-2",
        source: "stale",
        capturedAt: "2026-05-10T12:00:00.000Z",
        tempF: 80,
        rh: 50,
        vpd: 1.4,
        ec: 1.5,
        ph: 6.0,
        ppfd: 700,
      },
    ],
  },
  {
    candidateId: "demo-cand-charlie",
    candidateLabel: "Charlie #3",
    growLabel: "Demo Grow",
    tentLabel: "Tent B",
    plantLabel: "Plant Charlie",
    strain: null,
    stage: null,
    requireEcPh: true,
    requirePpfd: true,
    quickLogEntries: [],
    timelineEvents: [],
    photos: [],
    sensorSnapshots: [
      {
        id: "sn-c-1",
        source: "invalid",
        capturedAt: "2026-06-18T13:00:00.000Z",
        tempF: null,
        rh: null,
        vpd: null,
        ec: null,
        ph: null,
        ppfd: null,
      },
    ],
  },
];
=======
 * phenoComparisonFixtures — static SAMPLE / DEMO candidate data for the
 * read-only Pheno Comparison surface.
 *
 * Hard rules:
 *   - Pure data. No Supabase, model client, Edge Functions, or fetch.
 *   - Clearly demo/sample (`isDemo`). The presenter stamps the page.
 *   - Photos are same-origin (`/placeholder.svg`) — no external fetch.
 *   - Environment telemetry carries non-live provenance only and is CONTEXT
 *     ONLY — it never drives selection.
 *   - Deterministic timestamps relative to the fixed default clock.
 *
 * Selection story: the set intentionally lands on "Not directly comparable"
 * so the surface demonstrates the honest discipline James Loud asked for —
 * different tents, misaligned timepoints, a thin record, single specimens,
 * and uncured candidates are all named as reasons. Individual cards still
 * show the full range of phenotype evidence.
 */
import type { PhenoComparisonInput } from "./phenoComparisonViewModel";

// NOTE: public/placeholder.svg is the Lovable-platform scaffold wordmark
// ("Ask Lovable to build it"), not a plant photo — rendering it as a candidate
// photo would show vendor placeholder text on screen. No real photo asset
// exists in this repo, so every demo candidate honestly shows the existing
// "No photo attached for this candidate." empty state instead of a fake image.
const SAMPLE_PHOTO = null;

export const PHENO_COMPARISON_DEMO_INPUT: PhenoComparisonInput = {
  huntName: "Sample Pheno Hunt",
  isDemo: true,
  candidates: [
    {
      id: "cand-1",
      candidateLabel: "#1",
      plantName: "GG #1",
      strain: "Gorilla Glue #4",
      stage: "flower",
      growName: "Summer 2026",
      tentName: "Tent A",
      medium: "coco",
      photoUrl: SAMPLE_PHOTO,
      dayOfFlower: 46,
      replicateCount: 3,
      phenotype: {
        structure: { value: 4, note: "tight internodes, sturdy stems" },
        bud_density: { value: 4, note: "dense colas" },
        resin: { value: 5, note: "heavy frost onto sugar leaf" },
        aroma: { value: "gassy citrus, sour funk" },
        vigor: { value: 4 },
        finish: { value: "58 days" },
        stretch: { value: "~1.4x" },
        node_spacing: { value: 3 },
        disease_resistance: { value: 4, note: "no PM" },
        yield: { value: "~62 g dry" },
      },
      postCure: {
        curedDays: 21,
        noseAfterCure: "fuel + candied lemon holds",
        quality: "smooth, dense ash",
        keeperImpression: "Leaning yes — resin and nose stood out",
      },
      quickLogs: [
        {
          id: "c1-q1",
          at: "2026-06-30T09:00:00.000Z",
          kind: "note",
          note: "Trichomes mostly cloudy, some amber",
        },
      ],
      timelineEvents: [{ id: "c1-t1", at: "2026-06-30T09:05:00.000Z", kind: "photo" }],
      snapshot: {
        source: "manual",
        capturedAt: "2026-07-01T10:30:00.000Z",
        temp: 24.5,
        rh: 52,
        vpd: 1.35,
      },
    },
    {
      id: "cand-2",
      candidateLabel: "#2",
      plantName: "GG #2",
      strain: "Gorilla Glue #4",
      stage: "flower",
      growName: "Summer 2026",
      tentName: "Tent A",
      medium: "coco",
      photoUrl: SAMPLE_PHOTO,
      dayOfFlower: 44,
      replicateCount: 3,
      phenotype: {
        // Finish time (core) not recorded → partial, not strong.
        structure: { value: 3 },
        bud_density: { value: 3 },
        resin: { value: 3, note: "moderate frost" },
        aroma: { value: "sweet earthy" },
        vigor: { value: 3 },
      },
      postCure: {
        curedDays: 14,
        quality: "decent",
        keeperImpression: "Undecided — wants another run",
      },
      quickLogs: [
        { id: "c2-q1", at: "2026-06-29T08:45:00.000Z", kind: "feeding", note: "Bloom nutrients" },
      ],
      timelineEvents: [{ id: "c2-t1", at: "2026-06-29T08:50:00.000Z", kind: "feeding" }],
      snapshot: {
        source: "csv",
        capturedAt: "2026-07-01T10:15:00.000Z",
        temp: 25.1,
        rh: 49,
        vpd: 1.28,
      },
    },
    {
      id: "cand-3",
      candidateLabel: "#3",
      plantName: "ZK #1",
      strain: "Zkittlez",
      stage: "flower",
      growName: "Summer 2026",
      tentName: "Tent B",
      medium: "soil",
      photoUrl: null,
      dayOfFlower: 60,
      replicateCount: 1,
      phenotype: {
        // Thin record — only two core traits recorded.
        structure: { value: 3 },
        vigor: { value: 3, note: "slower stack" },
      },
      // Not cured yet.
      postCure: null,
      quickLogs: [
        { id: "c3-q1", at: "2026-06-27T12:00:00.000Z", kind: "training", note: "LST applied" },
      ],
      timelineEvents: [{ id: "c3-t1", at: "2026-06-27T12:05:00.000Z", kind: "training" }],
      snapshot: {
        source: "stale",
        capturedAt: "2026-06-29T06:00:00.000Z",
        temp: 26.2,
        rh: 61,
        vpd: 1.1,
      },
    },
    {
      id: "cand-4",
      candidateLabel: "#4",
      plantName: "ZK #2",
      strain: "Zkittlez",
      stage: "flower",
      growName: "Summer 2026",
      tentName: "Tent B",
      medium: "hydro",
      photoUrl: SAMPLE_PHOTO,
      dayOfFlower: 62,
      replicateCount: 2,
      phenotype: {
        // Finish (core) not recorded → partial.
        structure: { value: 4 },
        bud_density: { value: 3 },
        resin: { value: 4, note: "good frost" },
        aroma: { value: "grape candy" },
        vigor: { value: 4 },
      },
      postCure: {
        curedDays: 10,
        keeperImpression: "Promising, wants replication",
      },
      quickLogs: [
        {
          id: "c4-q1",
          at: "2026-06-30T07:30:00.000Z",
          kind: "measurement",
          note: "Reservoir check",
        },
      ],
      timelineEvents: [{ id: "c4-t1", at: "2026-06-30T07:35:00.000Z", kind: "measurement" }],
      snapshot: {
        // Suspicious payload: humidity pinned at 100% → invalid (context only).
        source: "invalid",
        capturedAt: "2026-07-01T10:40:00.000Z",
        temp: 25.0,
        rh: 100,
        vpd: 0.9,
      },
    },
  ],
};
>>>>>>> origin/main
