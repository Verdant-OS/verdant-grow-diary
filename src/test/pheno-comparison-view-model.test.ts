/**
<<<<<<< HEAD
 * phenoComparisonViewModel — pure view-model unit tests.
 */
import { describe, it, expect } from "vitest";
import {
  buildPhenoComparisonView,
  type PhenoCandidateInput,
} from "@/lib/phenoComparisonViewModel";

const base: PhenoCandidateInput = {
  candidateId: "a",
  candidateLabel: "A",
  requireEcPh: true,
  requirePpfd: true,
  quickLogEntries: [{ id: "q1", at: "2026-06-20T00:00:00Z", kind: "note" }],
  photos: [{ id: "p1" }],
  sensorSnapshots: [
    {
      id: "s1",
      source: "live",
      capturedAt: "2026-06-20T00:00:00Z",
      tempF: 75,
      rh: 55,
      vpd: 1.1,
      ec: 1.5,
      ph: 6.1,
      ppfd: 600,
    },
  ],
};

describe("buildPhenoComparisonView", () => {
  it("errors on fewer than two candidates", () => {
    const v = buildPhenoComparisonView([base]);
    expect(v.ok).toBe(false);
    expect(v.error).toBe("too_few_candidates");
  });

  it("aggregates two candidates deterministically", () => {
    const v = buildPhenoComparisonView([
      { ...base, candidateId: "b", candidateLabel: "B" },
      base,
    ]);
    expect(v.ok).toBe(true);
    expect(v.candidates.map((c) => c.candidateId)).toEqual(["a", "b"]);
  });

  it("flags stale + invalid sources and missing metrics; never healthy", () => {
    const v = buildPhenoComparisonView([
      base,
      {
        candidateId: "z",
        candidateLabel: "Z",
        requireEcPh: true,
        requirePpfd: true,
        photos: [],
        sensorSnapshots: [
          { id: "st", source: "stale", capturedAt: "2024-01-01T00:00:00Z" },
          { id: "iv", source: "invalid" },
          { id: "wat", source: "not-a-real-source" },
        ],
      },
    ]);
    const z = v.candidates.find((c) => c.candidateId === "z")!;
    expect(z.hasAnyTrustedSensor).toBe(false);
    expect(z.missing.map((m) => m.code)).toEqual(
      expect.arrayContaining(["no_photo", "no_diary"]),
    );
    const stale = z.sensorSnapshots.find((s) => s.id === "st")!;
    expect(stale.source).toBe("stale");
    expect(stale.missing.map((m) => m.code)).toContain("stale_reading");
    const inv = z.sensorSnapshots.find((s) => s.id === "iv")!;
    expect(inv.source).toBe("invalid");
    expect(inv.missing.map((m) => m.code)).toContain("invalid_reading");
    // Unknown vendor label normalizes to invalid, never to a healthy label.
    const wat = z.sensorSnapshots.find((s) => s.id === "wat")!;
    expect(wat.source).toBe("invalid");
    expect(wat.trusted).toBe(false);
=======
 * Pheno Comparison — pure rules + view model tests.
 *
 * Covers:
 *   - Source-label mapping for all six canonical sources (incl. "live").
 *   - Freshness: fresh vs stale (age-based + explicit stale source).
 *   - Validity: invalid source, suspicious telemetry (RH pinned 100),
 *     unknown provenance.
 *   - Missing-metric flags: core temp/RH/VPD + conditional EC/pH/PPFD.
 *   - The never-healthy invariant: demo/stale/invalid/missing is never
 *     `canShowHealthy`.
 *   - Candidate flag rollup (no photo / no snapshot).
 *   - URL sanitization.
 *   - Determinism.
 */
import { describe, it, expect } from "vitest";
import {
  classifyPhenoSnapshot,
  collectCandidateMissingFlags,
  containsHealthyStatusLanguage,
  deriveEvidenceStatus,
  emptyStateCopy,
  PHENO_EMPTY_STATE_COPY,
  sanitizePhotoUrl,
  type MissingDataFlagCode,
  type PhenoSensorSnapshotInput,
} from "@/lib/phenoComparisonRules";
import {
  buildPhenoComparisonViewModel,
  PHENO_COMPARISON_DEFAULT_NOW,
} from "@/lib/phenoComparisonViewModel";
import { PHENO_COMPARISON_DEMO_INPUT } from "@/lib/phenoComparisonFixtures";

const NOW = PHENO_COMPARISON_DEFAULT_NOW; // 2026-07-01T12:00:00Z
const FRESH = "2026-07-01T10:30:00.000Z"; // 1.5h old (< 3h window)
const OLD = "2026-06-29T00:00:00.000Z"; // days old

function snap(overrides: PhenoSensorSnapshotInput): PhenoSensorSnapshotInput {
  // Confidence is part of the sensor contract; the default carries a known
  // confidence so "healthy" cases are testable. Override with null to
  // exercise the unknown-confidence path.
  return { capturedAt: FRESH, temp: 24, rh: 55, vpd: 1.2, confidence: 0.9, ...overrides };
}

describe("classifyPhenoSnapshot — source labels", () => {
  it.each([
    ["live", "Live"],
    ["manual", "Manual"],
    ["csv", "CSV"],
    ["demo", "Demo"],
    ["stale", "Stale"],
    ["invalid", "Invalid"],
  ])("maps source %s → label %s", (source, label) => {
    const c = classifyPhenoSnapshot(snap({ source }), { now: NOW });
    expect(c.badge.label).toBe(label);
    expect(c.source).toBe(source);
  });

  it("unknown/provider source is not canonical and never healthy", () => {
    const c = classifyPhenoSnapshot(snap({ source: "ecowitt" }), { now: NOW });
    expect(c.badge.isUnknown).toBe(true);
    expect(c.isInvalid).toBe(true);
    expect(c.canShowHealthy).toBe(false);
  });
});

describe("classifyPhenoSnapshot — freshness", () => {
  it("recent manual reading is fresh", () => {
    const c = classifyPhenoSnapshot(snap({ source: "manual", capturedAt: FRESH }), {
      now: NOW,
    });
    expect(c.isStale).toBe(false);
  });

  it("old reading is stale", () => {
    const c = classifyPhenoSnapshot(snap({ source: "manual", capturedAt: OLD }), {
      now: NOW,
    });
    expect(c.isStale).toBe(true);
    expect(c.missingFlags).toContain("stale_reading");
  });

  it("explicit stale source is stale even with a fresh timestamp", () => {
    const c = classifyPhenoSnapshot(snap({ source: "stale", capturedAt: FRESH }), {
      now: NOW,
    });
    expect(c.isStale).toBe(true);
  });

  it("missing timestamp cannot be proven current → stale", () => {
    const c = classifyPhenoSnapshot(snap({ source: "manual", capturedAt: null }), {
      now: NOW,
    });
    expect(c.isStale).toBe(true);
  });

  it("future-dated reading (clock skew) is stale and never healthy", () => {
    // Two hours in the future — negative age must not read as fresh.
    const future = new Date(NOW + 2 * 60 * 60 * 1000).toISOString();
    const c = classifyPhenoSnapshot(
      snap({
        source: "manual",
        capturedAt: future,
        ec: 1.8,
        ph: 6,
        ppfd: 700,
        ecPhRelevant: true,
        ppfdRelevant: true,
      }),
      { now: NOW },
    );
    expect(c.isStale).toBe(true);
    expect(c.canShowHealthy).toBe(false);
  });
});

describe("classifyPhenoSnapshot — validity", () => {
  it("invalid source is invalid", () => {
    const c = classifyPhenoSnapshot(snap({ source: "invalid" }), { now: NOW });
    expect(c.isInvalid).toBe(true);
    expect(c.missingFlags).toContain("invalid_reading");
  });

  it("humidity pinned at 100% is flagged invalid, not healthy", () => {
    const c = classifyPhenoSnapshot(snap({ source: "manual", rh: 100 }), {
      now: NOW,
    });
    expect(c.isInvalid).toBe(true);
    const rh = c.metrics.find((m) => m.key === "rh");
    expect(rh?.invalid).toBe(true);
    expect(c.canShowHealthy).toBe(false);
  });

  it("pH out of realistic range is invalid", () => {
    const c = classifyPhenoSnapshot(
      snap({ source: "manual", ph: 14, ecPhRelevant: true }),
      { now: NOW },
    );
    const ph = c.metrics.find((m) => m.key === "ph");
    expect(ph?.invalid).toBe(true);
    expect(c.isInvalid).toBe(true);
  });
});

describe("classifyPhenoSnapshot — missing metric flags", () => {
  it("flags missing core temp/RH/VPD", () => {
    const c = classifyPhenoSnapshot(
      { source: "manual", capturedAt: FRESH, temp: null, rh: null, vpd: null },
      { now: NOW },
    );
    expect(c.missingFlags).toEqual(
      expect.arrayContaining(["missing_temp", "missing_rh", "missing_vpd"]),
    );
  });

  it("flags EC/pH/PPFD only when relevant", () => {
    const relevant = classifyPhenoSnapshot(
      snap({ source: "manual", ecPhRelevant: true, ppfdRelevant: true }),
      { now: NOW },
    );
    expect(relevant.missingFlags).toEqual(
      expect.arrayContaining(["missing_ec", "missing_ph", "missing_ppfd"]),
    );

    const notRelevant = classifyPhenoSnapshot(snap({ source: "manual" }), {
      now: NOW,
    });
    expect(notRelevant.missingFlags).not.toContain("missing_ec");
    expect(notRelevant.missingFlags).not.toContain("missing_ph");
    expect(notRelevant.missingFlags).not.toContain("missing_ppfd");
  });
});

describe("never-healthy invariant (canShowHealthy)", () => {
  it("is true only for a trustworthy, fresh, complete, valid reading", () => {
    const good = classifyPhenoSnapshot(
      snap({ source: "manual", ec: 1.8, ph: 6.1, ppfd: 700, ecPhRelevant: true, ppfdRelevant: true }),
      { now: NOW },
    );
    expect(good.canShowHealthy).toBe(true);
  });

  it.each(["demo", "stale", "invalid"])(
    "is false for %s provenance",
    (source) => {
      const c = classifyPhenoSnapshot(snap({ source }), { now: NOW });
      expect(c.canShowHealthy).toBe(false);
    },
  );

  it("is false when a relevant metric is missing", () => {
    const c = classifyPhenoSnapshot(
      snap({ source: "manual", ppfd: null, ppfdRelevant: true }),
      { now: NOW },
    );
    expect(c.canShowHealthy).toBe(false);
  });

  it.each([null, undefined, 1.4, -0.1])(
    "is false when confidence is unknown/implausible (%s)",
    (confidence) => {
      const c = classifyPhenoSnapshot(
        snap({ source: "manual", confidence }),
        { now: NOW },
      );
      expect(c.canShowHealthy).toBe(false);
    },
  );

  it("surfaces a visible missing_confidence flag when confidence is omitted", () => {
    // A literal without the default helper confidence.
    const c = classifyPhenoSnapshot(
      { source: "manual", capturedAt: FRESH, temp: 24, rh: 55, vpd: 1.2 },
      { now: NOW },
    );
    expect(c.missingFlags).toContain("missing_confidence");
  });
});

describe("collectCandidateMissingFlags", () => {
  it("no snapshot yields no_sensor_snapshot", () => {
    const flags = collectCandidateMissingFlags({ hasPhoto: true, snapshot: null });
    expect(flags).toContain("no_sensor_snapshot");
  });

  it("no photo yields no_photo", () => {
    const c = classifyPhenoSnapshot(snap({ source: "manual" }), { now: NOW });
    const flags = collectCandidateMissingFlags({ hasPhoto: false, snapshot: c });
    expect(flags).toContain("no_photo");
  });
});

describe("deriveEvidenceStatus", () => {
  const derive = (s: PhenoSensorSnapshotInput | null, hasPhoto = true) =>
    deriveEvidenceStatus({
      hasPhoto,
      snapshot: s ? classifyPhenoSnapshot(s, { now: NOW }) : null,
    });

  it("no snapshot → evidence_missing (risky)", () => {
    const st = derive(null);
    expect(st.code).toBe("evidence_missing");
    expect(st.risky).toBe(true);
  });

  it("unknown provenance → unknown (risky, danger)", () => {
    const st = derive(snap({ source: "ecowitt" }));
    expect(st.code).toBe("unknown");
    expect(st.tone).toBe("danger");
    expect(st.risky).toBe(true);
  });

  it.each([
    ["invalid", "invalid"],
    ["stale", "stale"],
    ["demo", "demo"],
  ])("%s source → %s (risky)", (source, code) => {
    const st = derive(snap({ source }));
    expect(st.code).toBe(code);
    expect(st.risky).toBe(true);
  });

  it("fresh valid known snapshot missing a photo → limited_evidence", () => {
    const st = derive(snap({ source: "manual" }), false);
    expect(st.code).toBe("limited_evidence");
    expect(st.risky).toBe(true);
  });

  it("complete valid fresh snapshot with photo → evidence_present (not risky)", () => {
    const st = derive(
      snap({ source: "manual", ec: 1.8, ph: 6, ppfd: 700, ecPhRelevant: true, ppfdRelevant: true }),
      true,
    );
    expect(st.code).toBe("evidence_present");
    expect(st.risky).toBe(false);
    expect(st.tone).toBe("neutral");
  });
});

describe("containsHealthyStatusLanguage", () => {
  it.each([
    "Plant looks healthy",
    "status: OK",
    "all good here",
    "no issues detected",
    "readings complete",
    "verified reading",
    "environment normal",
  ])("flags positive status: %s", (text) => {
    expect(containsHealthyStatusLanguage(text)).toBe(true);
  });

  it.each([
    "Reading is invalid — excluded from healthy status.",
    "Missing, stale, or invalid readings are flagged and never shown as healthy.",
    "Reading is stale — do not treat as current.",
    "Limited evidence",
    "Evidence missing",
    "Demo/sample reading",
  ])("allows honest caveat: %s", (text) => {
    expect(containsHealthyStatusLanguage(text)).toBe(false);
  });
});

describe("empty-state copy", () => {
  const codes: MissingDataFlagCode[] = [
    "no_photo",
    "no_sensor_snapshot",
    "missing_temp",
    "missing_rh",
    "missing_vpd",
    "missing_ec",
    "missing_ph",
    "missing_ppfd",
    "missing_confidence",
    "stale_reading",
    "invalid_reading",
  ];

  it("every flag has non-empty copy", () => {
    for (const code of codes) {
      expect(emptyStateCopy(code)).toBe(PHENO_EMPTY_STATE_COPY[code]);
      expect(emptyStateCopy(code).length).toBeGreaterThan(0);
    }
  });

  it("no empty-state copy reads as healthy/OK/complete", () => {
    for (const code of codes) {
      expect(
        containsHealthyStatusLanguage(emptyStateCopy(code)),
        `copy for ${code} trips healthy language`,
      ).toBe(false);
    }
  });
});

describe("sanitizePhotoUrl", () => {
  it("accepts http(s)", () => {
    expect(sanitizePhotoUrl("https://example.com/a.jpg")).toBe(
      "https://example.com/a.jpg",
    );
  });
  it("accepts a same-origin root-relative path (demo-safe, no external fetch)", () => {
    expect(sanitizePhotoUrl("/placeholder.svg")).toBe("/placeholder.svg");
  });

  it.each([
    ["data:text/html,x"],
    ["javascript:alert(1)"],
    ["//evil.example.com/x.jpg"], // protocol-relative → third-party origin
    [""],
    ["   "],
    [null],
    [42],
  ])("rejects %s", (raw) => {
    expect(sanitizePhotoUrl(raw)).toBeNull();
  });
});

describe("demo fixtures — no off-origin photo fetches", () => {
  it("every candidate photo is same-origin (null or root-relative)", () => {
    const vm = buildPhenoComparisonViewModel(PHENO_COMPARISON_DEMO_INPUT);
    for (const c of vm.candidates) {
      if (c.photoUrl !== null) {
        expect(c.photoUrl.startsWith("/"), `${c.id} photo is off-origin`).toBe(true);
        expect(c.photoUrl.startsWith("//")).toBe(false);
      }
    }
  });
});

describe("buildPhenoComparisonViewModel — demo fixtures", () => {
  it("is flagged demo with four candidates", () => {
    const vm = buildPhenoComparisonViewModel(PHENO_COMPARISON_DEMO_INPUT);
    expect(vm.isDemo).toBe(true);
    expect(vm.candidateCount).toBe(4);
  });

  it("orders quick logs newest-first with stable tie-breakers", () => {
    const vm = buildPhenoComparisonViewModel({
      isDemo: true,
      candidates: [
        {
          id: "x",
          candidateLabel: "#1",
          quickLogs: [
            { id: "b", at: "2026-06-01T00:00:00.000Z", kind: "note" },
            { id: "a", at: "2026-07-01T00:00:00.000Z", kind: "watering" },
          ],
        },
      ],
    });
    expect(vm.candidates[0].quickLogs.map((q) => q.id)).toEqual(["a", "b"]);
  });

  it("demoted telemetry never drives selection — each card has a phenotype-based strength and an environment-context section", () => {
    const vm = buildPhenoComparisonViewModel(PHENO_COMPARISON_DEMO_INPUT);
    for (const c of vm.candidates) {
      expect(["strong", "partial", "thin"]).toContain(c.selectionEvidence.strength);
      expect(c.environmentContext.label).toMatch(/not a selection signal/i);
    }
  });

  it("the demo set lands on a clearly-explained 'not directly comparable'", () => {
    const vm = buildPhenoComparisonViewModel(PHENO_COMPARISON_DEMO_INPUT);
    expect(vm.comparability.verdict).toBe("not_comparable");
    expect(vm.comparability.reasons.length).toBeGreaterThan(0);
  });

  it("is deterministic (same input → deep-equal output)", () => {
    const a = buildPhenoComparisonViewModel(PHENO_COMPARISON_DEMO_INPUT);
    const b = buildPhenoComparisonViewModel(PHENO_COMPARISON_DEMO_INPUT);
    expect(a).toEqual(b);
>>>>>>> origin/main
  });
});
