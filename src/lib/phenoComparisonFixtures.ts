/**
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
