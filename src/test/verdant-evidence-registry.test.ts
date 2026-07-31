/**
 * Evidence Registry and deterministic retrieval (Build 5).
 *
 * Locks the properties that keep a curated corpus from becoming a source
 * of fabricated authority: a hypothesis is never evidence, a product
 * instruction never generalizes, a contested claim stays visibly
 * contested, and "we found nothing" never reads as "nothing contradicts
 * this".
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  EVIDENCE_TIERS,
  EVIDENCE_TIER_RANKS,
  buildEvidenceRegistry,
  compareEvidenceIds,
  evidenceTierRank,
  type CultivationEvidenceRecord,
  type EvidenceRegistry,
} from "@/lib/verdantEvidenceRegistry";
import {
  evidenceSatisfiesPolicy,
  retrieveEvidence,
  type EvidenceRetrievalResult,
} from "@/lib/verdantEvidenceRetrievalRules";
import { parseVerdantSkillManifest, type VerdantSkillManifest } from "@/lib/verdantSkillManifest";
import { SKILL_CONTRACT_VERSION, serializeSkillContract } from "@/lib/verdantSkillSchemas";
import {
  EVIDENCE_FIXTURES,
  FIXTURE_PRODUCT_ID,
  FIXTURE_SKILL_ID,
  FIXTURE_SKILL_IDS,
} from "./fixtures/verdant-evidence-fixtures";

const ROOT = resolve(__dirname, "../..");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function registry(records: readonly unknown[] = EVIDENCE_FIXTURES): EvidenceRegistry {
  const built = buildEvidenceRegistry(records, { knownSkillIds: FIXTURE_SKILL_IDS });
  if (built.ok === false) throw new Error(`registry invalid: ${built.issues.join("; ")}`);
  return built.registry;
}

function record(overrides: Partial<CultivationEvidenceRecord> = {}): CultivationEvidenceRecord {
  const base = EVIDENCE_FIXTURES.find((r) => r.evidenceId === "ev-coco-dryback-sop");
  if (base === undefined) throw new Error("fixture missing");
  return { ...base, conflictingEvidenceIds: [], ...overrides };
}

function makeManifest(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: FIXTURE_SKILL_ID,
    version: "1.0.0",
    name: "Coco dryback review",
    description: "Reviews dryback behaviour for coco drain-to-waste setups.",
    authorType: "verdant",
    authorVerification: "verified",
    lifecycle: "internal_sandbox",
    operatingEnvelope: {
      growSettings: ["tent"],
      media: ["coco"],
      irrigationArchitectures: ["top_feed_drain_to_waste"],
      requiresKnownIrrigationArchitecture: true,
      requiresKnownAutoflowerStatus: false,
      minUsableSensorReadings: 1,
      requiredSensorMetrics: ["soil_moisture_pct"],
    },
    requiredContext: ["sensor_readings"],
    optionalContext: [],
    excludedConditions: { media: [], irrigationArchitectures: [], growSettings: [] },
    evidencePolicy: "approved_evidence_required",
    riskClass: "medium",
    permissions: [
      "read_plant_history",
      "read_sensor_context",
      "retrieve_approved_evidence",
      "propose_manual_action",
    ],
    deterministicCalculators: [],
    outputContractVersion: SKILL_CONTRACT_VERSION,
    followUpContract: { requiresFollowUp: true, defaultIntervalHours: 24 },
    evaluationSuiteId: "coco-dryback-golden-v1",
    modelPolicyId: "reasoning-draft-v1",
    maxExecutionCapability: "manual_only",
    deprecation: { deprecated: false, supersededBy: null, note: null },
    ...overrides,
  };
}

function manifest(overrides: Record<string, unknown> = {}): VerdantSkillManifest {
  const parsed = parseVerdantSkillManifest(makeManifest(overrides));
  if (parsed.ok === false) throw new Error(`manifest invalid: ${parsed.issues.join("; ")}`);
  return parsed.manifest;
}

function query(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    species: "cannabis",
    growSetting: "tent",
    medium: "coco",
    irrigationArchitecture: "top_feed_drain_to_waste",
    stage: "flower",
    metrics: ["vpd_kpa", "soil_moisture_pct", "soil_ec_ms_cm"],
    observedMetrics: ["soil_moisture_pct", "vpd_kpa"],
    productIds: [],
    tierCeiling: "established_sop",
    statuses: ["verified"],
    ...overrides,
  };
}

function retrieve(
  queryOverrides: Record<string, unknown> = {},
  manifestOverrides: Record<string, unknown> = {},
  reg: EvidenceRegistry = registry(),
): EvidenceRetrievalResult {
  const r = retrieveEvidence(reg, manifest(manifestOverrides), query(queryOverrides));
  if (r.ok === false) throw new Error(`retrieval invalid: ${r.issues.join("; ")}`);
  return r.result;
}

function ids(list: readonly { evidenceId: string }[]): string[] {
  return list.map((x) => x.evidenceId);
}

function reasonsFor(result: EvidenceRetrievalResult, evidenceId: string): string[] {
  return result.excluded.find((e) => e.evidenceId === evidenceId)?.reasons ?? [];
}

// ---------------------------------------------------------------------------

describe("evidence registry — build-time integrity", () => {
  it("registers the fixture corpus", () => {
    const reg = registry();
    expect(reg.recordCount()).toBe(EVIDENCE_FIXTURES.length);
    expect(reg.ids()).toEqual([...reg.ids()].sort(compareEvidenceIds));
  });

  it("ranks tiers as explicit data, strongest first", () => {
    expect(EVIDENCE_TIERS.map((t) => EVIDENCE_TIER_RANKS[t])).toEqual([1, 2, 3, 4, 5, 6]);
    // An unrecognized tier sorts LAST, never above controlled research.
    expect(evidenceTierRank("something_invented")).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("refuses to register local grow evidence in V1", () => {
    // The corpus ships in the client bundle: a grower's private result
    // would be disclosed to every user before any gate could run.
    const built = buildEvidenceRegistry(
      [record({ tier: "local_grow_evidence", sourceDocumentType: "grower_log" })],
      { knownSkillIds: FIXTURE_SKILL_IDS },
    );
    expect(built.ok).toBe(false);
    if (built.ok === false) {
      expect(built.issues.join(" ")).toContain("local_evidence_not_registerable_in_v1");
    }
  });

  it("fails the build on a dangling conflict id", () => {
    const built = buildEvidenceRegistry(
      [record({ conflictingEvidenceIds: ["ev-does-not-exist"] })],
      { knownSkillIds: FIXTURE_SKILL_IDS },
    );
    expect(built.ok).toBe(false);
    if (built.ok === false) expect(built.issues.join(" ")).toContain("is not registered");
  });

  it("rejects a self-referential conflict and duplicate ids", () => {
    const selfRef = buildEvidenceRegistry(
      [record({ conflictingEvidenceIds: ["ev-coco-dryback-sop"] })],
      { knownSkillIds: FIXTURE_SKILL_IDS },
    );
    expect(selfRef.ok).toBe(false);

    const dupe = buildEvidenceRegistry([record(), record()], {
      knownSkillIds: FIXTURE_SKILL_IDS,
    });
    expect(dupe.ok).toBe(false);
    if (dupe.ok === false) expect(dupe.issues.join(" ")).toContain("duplicate evidenceId");
  });

  it("rejects an unknown allowed skill id when the skill set is supplied", () => {
    const built = buildEvidenceRegistry([record({ allowedSkillIds: ["ghost-skill"] })], {
      knownSkillIds: FIXTURE_SKILL_IDS,
    });
    expect(built.ok).toBe(false);
    // ...and the check is genuinely skippable, but only on purpose.
    expect(
      buildEvidenceRegistry([record({ allowedSkillIds: ["ghost-skill"] })], {
        knownSkillIds: null,
      }).ok,
    ).toBe(true);
  });

  it("requires an empty axis to be declared agnostic", () => {
    // Silence is not agreement: an unscoped axis has to be an assertion.
    const undeclared = buildEvidenceRegistry([record({ media: [], agnosticAxes: [] })], {
      knownSkillIds: FIXTURE_SKILL_IDS,
    });
    expect(undeclared.ok).toBe(false);
    if (undeclared.ok === false) {
      expect(undeclared.issues.join(" ")).toContain("axis_empty_but_not_declared_agnostic:media");
    }
    // An SOP may not claim to apply everywhere.
    const sopAgnostic = buildEvidenceRegistry([record({ media: [], agnosticAxes: ["media"] })], {
      knownSkillIds: FIXTURE_SKILL_IDS,
    });
    expect(sopAgnostic.ok).toBe(false);
    if (sopAgnostic.ok === false) {
      expect(sopAgnostic.issues.join(" ")).toContain("tier_may_not_declare_agnostic_axes");
    }
  });

  it("pins tier against document form", () => {
    const built = buildEvidenceRegistry(
      [record({ tier: "controlled_cannabis_research", sourceDocumentType: "product_label" })],
      { knownSkillIds: FIXTURE_SKILL_IDS },
    );
    expect(built.ok).toBe(false);
    if (built.ok === false) {
      expect(built.issues.join(" ")).toContain("source_document_type_not_admissible_for_tier");
    }
  });

  it("scales citation completeness with the authority claimed", () => {
    // A bare title is not a citation for controlled research.
    const thin = buildEvidenceRegistry(
      [
        record({
          tier: "controlled_cannabis_research",
          sourceDocumentType: "journal_article",
          citation: {
            title: "internal notes",
            publisher: null,
            year: null,
            locator: null,
            url: null,
          },
        }),
      ],
      { knownSkillIds: FIXTURE_SKILL_IDS },
    );
    expect(thin.ok).toBe(false);
    if (thin.ok === false) {
      const joined = thin.issues.join(" ");
      expect(joined).toContain("citation_requires_publisher");
      expect(joined).toContain("citation_requires_resolvable_locator");
    }
    // A hypothesis must not dress itself up with a publisher.
    const dressed = buildEvidenceRegistry(
      [
        record({
          tier: "unverified_hypothesis",
          sourceDocumentType: "internal_sop",
          citation: { title: "Idea", publisher: "Nature", year: 2025, locator: null, url: null },
        }),
      ],
      { knownSkillIds: FIXTURE_SKILL_IDS },
    );
    expect(dressed.ok).toBe(false);
    if (dressed.ok === false) {
      expect(dressed.issues.join(" ")).toContain("hypothesis_citation_must_not_claim_publisher");
    }
  });

  it("refuses citation urls that can carry a credential", () => {
    const cases = [
      "http://example.org/paper",
      "https://user:pass@example.org/paper",
      "https://example.org/paper?token=abc123",
      "https://example.org/paper#access=xyz",
    ];
    for (const url of cases) {
      const built = buildEvidenceRegistry(
        [
          record({
            tier: "controlled_cannabis_research",
            sourceDocumentType: "journal_article",
            citation: { title: "T", publisher: "P", year: 2024, locator: null, url },
          }),
        ],
        { knownSkillIds: FIXTURE_SKILL_IDS },
      );
      expect(built.ok, `expected rejection for ${url}`).toBe(false);
    }
  });

  it("does not let a curator author a runtime-derived limitation", () => {
    const built = buildEvidenceRegistry(
      [record({ limitations: [{ code: "cross_species_extrapolation", detail: "trust me" }] })],
      { knownSkillIds: FIXTURE_SKILL_IDS },
    );
    expect(built.ok).toBe(false);
    if (built.ok === false) {
      expect(built.issues.join(" ")).toContain("limitation_code_is_runtime_derived");
    }
  });

  it("computes the symmetric closure of conflicts", () => {
    const reg = registry();
    // Only one side annotated the conflict in the fixtures.
    const annotated = reg.get("ev-vpd-flower-band");
    const other = reg.get("ev-vpd-flower-band-contested");
    expect(annotated?.conflictingEvidenceIds).toContain("ev-vpd-flower-band-contested");
    // ...but it is visible from the other side too, so which side the
    // query matched cannot decide whether the caller learns of it.
    expect(other?.conflictingEvidenceIds).toContain("ev-vpd-flower-band");
  });

  it("freezes registered records", () => {
    const first = registry().get("ev-coco-dryback-sop");
    expect(first).not.toBeNull();
    expect(() => {
      (first as unknown as { tier: string }).tier = "controlled_cannabis_research";
    }).toThrow();
  });

  it("stamps a stable signature for the corpus", () => {
    expect(registry().signature()).toBe(registry().signature());
    const smaller = buildEvidenceRegistry([record()], { knownSkillIds: FIXTURE_SKILL_IDS });
    if (smaller.ok === false) throw new Error("expected build to succeed");
    expect(smaller.registry.signature()).not.toBe(registry().signature());
  });
});

describe("evidence retrieval — the spec's required cases", () => {
  it("selects relevant evidence, strongest tier first", () => {
    const r = retrieve();
    expect(ids(r.applicable)).toEqual(["ev-vpd-flower-band", "ev-coco-dryback-sop"]);
    expect(r.evidenceOutcome).toBe("matched");
    expect(r.policyOutcome).toBe("satisfied");
    expect(evidenceSatisfiesPolicy(r)).toBe(true);
  });

  it("excludes evidence scoped to the wrong medium", () => {
    const r = retrieve({ medium: "soil" });
    expect(reasonsFor(r, "ev-coco-dryback-sop")).toContain("medium_mismatch");
    expect(ids(r.applicable)).not.toContain("ev-coco-dryback-sop");
    // The medium-agnostic tier-1 claim is untouched by that.
    expect(ids(r.applicable)).toContain("ev-vpd-flower-band");
  });

  it("excludes evidence scoped to the wrong stage", () => {
    const r = retrieve({ stage: "seedling" });
    expect(reasonsFor(r, "ev-coco-dryback-sop")).toContain("stage_mismatch");
    expect(reasonsFor(r, "ev-vpd-flower-band")).toContain("stage_mismatch");
    expect(r.applicable).toHaveLength(0);
    expect(r.evidenceOutcome).toBe("all_candidates_excluded");
  });

  it("never generalizes a product-specific instruction", () => {
    // No product in play: the manufacturer instruction stays out.
    const withoutProduct = retrieve({ stage: "veg" });
    expect(reasonsFor(withoutProduct, "ev-nutrient-a-mix-rate")).toContain(
      "product_scope_not_matched",
    );

    // Name the product and it applies — still carrying its scope.
    const withProduct = retrieve({ stage: "veg", productIds: [FIXTURE_PRODUCT_ID] });
    const entry = withProduct.applicable.find((a) => a.evidenceId === "ev-nutrient-a-mix-rate");
    expect(entry).toBeDefined();
    expect(entry?.limitations.map((l) => l.code)).toContain("product_specific_instruction");
  });

  it("surfaces conflicting evidence, including a retired counter-claim", () => {
    const r = retrieve();
    const conflict = r.conflicts.find((c) => c.evidenceId === "ev-vpd-flower-band-contested");
    expect(conflict).toBeDefined();
    // It was NOT itself applicable — it is deprecated — and it is still
    // shown, carrying that status. "We retired this" is not "this was
    // never said".
    expect(conflict?.status).toBe("deprecated");
    expect(conflict?.excludedFromApplicable).toBe(true);
    expect(conflict?.conflictsWith).toContain("ev-vpd-flower-band");
  });

  it("orders tiers deterministically and repeats byte-for-byte", () => {
    const a = retrieve();
    const b = retrieve();
    expect(serializeSkillContract(a)).toBe(serializeSkillContract(b));
    const ranks = a.applicable.map((x) => x.effectiveTierRank);
    expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
  });

  it("excludes deprecated evidence while keeping it auditable", () => {
    // Not applicable...
    const strict = retrieve();
    expect(ids(strict.applicable)).not.toContain("ev-vpd-flower-band-contested");
    // ...but a curator-audit query can still see it, with its status as
    // the reason rather than silence.
    const audit = retrieve({ statuses: ["verified", "deprecated"] });
    expect(reasonsFor(audit, "ev-vpd-flower-band-contested")).toContain("status_not_verified");
  });

  it("returns an honest empty result rather than fabricating authority", () => {
    const empty = retrieve({ statuses: ["withdrawn"] });
    expect(empty.applicable).toHaveLength(0);
    expect(empty.excluded).toHaveLength(0);
    expect(empty.conflicts).toHaveLength(0);
    expect(empty.references).toHaveLength(0);
    expect(empty.evidenceOutcome).toBe("no_matching_evidence");
    // The result says out loud that the corpus is curated, so "nothing
    // found" cannot be read as "nothing exists".
    expect(empty.limitations.map((l) => l.code)).toContain("curated_coverage_only");
    // An empty conflicts array is qualified by how much was examined.
    expect(empty.conflictSurvey.linksChecked).toBe(0);
  });

  it("preserves citation-ready references", () => {
    const r = retrieve();
    const ref = r.references.find((x) => x.evidenceId === "ev-vpd-flower-band");
    expect(ref?.citation.title).toBe(
      "Vapour pressure deficit and stomatal behaviour in flowering Cannabis sativa",
    );
    expect(ref?.citation.publisher).toBe("Journal of Controlled Environment Horticulture");
    expect(ref?.citation.year).toBe(2024);
    expect(ref?.citation.locator).toBe("10.1234/jceh.2024.0117");
    expect(ref?.citationCompleteness).toBe("bibliographic");
    // Tier travels with every reference — it can never be read without it.
    expect(ref?.tier).toBe("controlled_cannabis_research");
    expect(ref?.lastReviewed).toBe("2026-01-15T00:00:00.000Z");
    expect(r.references.map((x) => x.evidenceId)).toEqual(ids(r.applicable));
  });
});

describe("evidence retrieval — honesty guarantees", () => {
  it("never returns a hypothesis as evidence, whatever its status", () => {
    const r = retrieve();
    expect(ids(r.applicable)).not.toContain("ev-dryback-stress-hypothesis");
    expect(reasonsFor(r, "ev-dryback-stress-hypothesis")).toContain("unverified_hypothesis");
    // ...and it cannot ride in through the conflict channel either.
    expect(ids(r.conflicts)).not.toContain("ev-dryback-stress-hypothesis");
    expect(r.conflictSurvey.withheldReasons).toContain("unverified_hypothesis");
    expect(r.conflictSurvey.withheld).toBeGreaterThan(0);
  });

  it("counts conflict links so an empty conflicts array is never read as consensus", () => {
    const r = retrieve();
    expect(r.conflictSurvey.linksChecked).toBe(2);
    expect(r.conflictSurvey.surfaced).toBe(1);
    expect(r.conflictSurvey.withheld).toBe(1);
  });

  it("demotes cross-species evidence structurally, not just in prose", () => {
    const r = retrieve({ stage: "veg" });
    const tomato = r.applicable.find((a) => a.evidenceId === "ev-tomato-ec-response");
    expect(tomato).toBeDefined();
    // Nominal tier 2, but it sorts as though it were weaker...
    expect(tomato?.tierRank).toBe(2);
    expect(tomato?.effectiveTierRank).toBe(3);
    // ...and says why, in a structured code a model cannot paraphrase away.
    expect(tomato?.limitations.map((l) => l.code)).toContain("cross_species_extrapolation");
  });

  it("excludes cross-species material outside the horticulture tier", () => {
    const reg = registry([
      ...EVIDENCE_FIXTURES.filter((r) => r.evidenceId !== "ev-coco-dryback-sop"),
      record({ species: "lettuce", conflictingEvidenceIds: [] }),
    ]);
    const r = retrieve({}, {}, reg);
    expect(reasonsFor(r, "ev-coco-dryback-sop")).toContain("species_mismatch");
  });

  it("never auto-satisfies an advisory condition", () => {
    const r = retrieve();
    const sop = r.applicable.find((a) => a.evidenceId === "ev-coco-dryback-sop");
    expect(sop?.limitations.map((l) => l.code)).toContain("advisory_condition");
  });

  it("excludes a record whose machine-checkable condition is unmet", () => {
    const r = retrieve({ observedMetrics: ["vpd_kpa"] });
    expect(reasonsFor(r, "ev-coco-dryback-sop")).toContain("applicability_condition_unmet");
  });

  it("refuses a record curated for another skill", () => {
    const r = retrieve({ stage: "veg" });
    expect(reasonsFor(r, "ev-leaf-colour-index")).toContain("skill_not_permitted");
  });

  it("distinguishes 'may not look' from 'looked and found nothing'", () => {
    const r = retrieve(
      {},
      {
        evidencePolicy: "context_only",
        permissions: ["read_plant_history", "read_sensor_context", "propose_manual_action"],
      },
    );
    expect(r.evidenceOutcome).toBe("retrieval_not_permitted");
    expect(r.applicable).toHaveLength(0);
    // A context-only skill was never required to cite anything.
    expect(r.policyOutcome).toBe("not_required");
  });

  it("reports an unmet mandatory evidence policy as a blocking signal", () => {
    const r = retrieve({ statuses: ["withdrawn"] });
    expect(r.evidenceOutcome).toBe("no_matching_evidence");
    expect(r.policyOutcome).toBe("unsatisfied_required");
    // The caller must map this to insufficient context, not proceed unsourced.
    expect(evidenceSatisfiesPolicy(r)).toBe(false);
  });

  it("lets a tier ceiling narrow, and offers no lever that admits a hypothesis", () => {
    const r = retrieve({ tierCeiling: "controlled_cannabis_research" });
    expect(reasonsFor(r, "ev-coco-dryback-sop")).toContain("tier_below_ceiling");
    expect(ids(r.applicable)).toEqual(["ev-vpd-flower-band"]);
    // The ceiling vocabulary itself cannot name a hypothesis tier.
    const bad = retrieveEvidence(
      registry(),
      manifest(),
      query({ tierCeiling: "unverified_hypothesis" }),
    );
    expect(bad.ok).toBe(false);
  });

  it("does not treat an unknown axis value as agreement", () => {
    // A null axis matches only records that declared that axis agnostic.
    const r = retrieve({ medium: null });
    expect(reasonsFor(r, "ev-coco-dryback-sop")).toContain("medium_mismatch");
    expect(ids(r.applicable)).toContain("ev-vpd-flower-band");
  });

  it("stamps the corpus a citation came from", () => {
    const r = retrieve();
    expect(r.registry.contractVersion).toBe("1.0.0");
    expect(r.registry.recordCount).toBe(EVIDENCE_FIXTURES.length);
    expect(r.registry.signature).toBe(registry().signature());
  });

  it("rejects an unrecognized query key instead of ignoring it", () => {
    const bad = retrieveEvidence(registry(), manifest(), query({ includeHypotheses: true }));
    expect(bad.ok).toBe(false);
  });

  it("collects every exclusion reason, not just the first", () => {
    const r = retrieve({ stage: "seedling", medium: "soil" });
    const reasons = reasonsFor(r, "ev-coco-dryback-sop");
    expect(reasons).toContain("medium_mismatch");
    expect(reasons).toContain("stage_mismatch");
  });
});

describe("evidence contracts — structural guarantees", () => {
  it("orders ids by codepoint, not locale", () => {
    const messy = ["ev-b", "ev.a", "ev:c", "ev_d", "EV-A", "ev-a"];
    const sorted = [...messy].sort(compareEvidenceIds);
    // Uppercase sorts before lowercase under codepoint ordering; a
    // locale-aware comparison would not guarantee this across machines.
    expect(sorted).toEqual(["EV-A", "ev-a", "ev-b", "ev.a", "ev:c", "ev_d"]);
  });

  it("round-trips through the canonical serializer", () => {
    const r = retrieve();
    const once = serializeSkillContract(r);
    expect(once).toBe(serializeSkillContract(JSON.parse(JSON.stringify(r))));
    // No Set or Map leaked into the result (both serialize as {}).
    expect(once).not.toContain('"conflictSurvey":{}');
  });

  it("carries no executable or query-shaped field", () => {
    const serialized = serializeSkillContract(retrieve());
    expect(serialized).not.toContain("select ");
    expect(serialized).not.toContain("function");
    expect(serialized).not.toContain("http://");
  });

  it("never launders a registry claim into the observation contract", () => {
    // Build 1's EvidenceRecord is an OBSERVATION. If a curated claim
    // could be built into one, a literature citation and a grower's
    // sensor reading would become indistinguishable downstream.
    const source = readFileSync(resolve(ROOT, "src/lib/verdantEvidenceRetrievalRules.ts"), "utf8");
    expect(source).not.toContain("evidenceRecordSchema");
    expect(source).not.toContain("parseEvidenceRecord");
  });

  it("keeps the lib modules pure and deterministic by construction", () => {
    for (const file of [
      "src/lib/verdantEvidenceRegistry.ts",
      "src/lib/verdantEvidenceRetrievalRules.ts",
    ]) {
      const source = readFileSync(resolve(ROOT, file), "utf8");
      // No clock: retrieval must not depend on when it ran.
      expect(source, `${file} reads the clock`).not.toContain("Date.now(");
      expect(source, `${file} constructs a Date`).not.toContain("new Date(");
      // No locale-sensitive ordering. Matched as a CALL, so the comment
      // explaining why it is avoided does not trip its own rule.
      expect(source, `${file} uses localeCompare`).not.toContain(".localeCompare(");
      // No zod defaults: a default is a value nobody declared.
      expect(source, `${file} uses a zod default`).not.toContain(".default(");
      // No network, no model, no rows.
      expect(source, `${file} performs I/O`).not.toContain("fetch(");
      expect(source, `${file} touches supabase`).not.toContain("supabase");
    }
  });
});

describe("evidence retrieval — conflicts carry their own scope", () => {
  it("labels a scope-mismatched counter-claim instead of presenting it bare", () => {
    // A manufacturer feeding instruction that contests an applicable SOP
    // but is confined to a product the caller is not using. Shown —
    // suppressing a conflict manufactures certainty — but a caller must
    // be able to tell "contested" from "a different product says
    // otherwise" without re-deriving the scope.
    const reg = registry([
      ...EVIDENCE_FIXTURES,
      record({
        evidenceId: "ev-nutrient-b-dryback-note",
        tier: "manufacturer_specification",
        sourceDocumentType: "manufacturer_manual",
        citation: {
          title: "Nutrient B substrate guidance",
          publisher: "Example Nutrients Ltd",
          year: 2025,
          locator: "Rev. 1",
          url: null,
        },
        productIds: ["prod-nutrient-b"],
        conflictingEvidenceIds: ["ev-coco-dryback-sop"],
      }),
    ]);
    const r = retrieve({}, {}, reg);
    expect(ids(r.applicable)).toContain("ev-coco-dryback-sop");

    const note = r.conflicts.find((c) => c.evidenceId === "ev-nutrient-b-dryback-note");
    expect(note).toBeDefined();
    // Visible...
    expect(note?.claim).toBeTruthy();
    // ...and explicitly out of scope, in the same vocabulary `excluded`
    // uses, with the product it is confined to.
    expect(note?.excludedFromApplicable).toBe(true);
    expect(note?.exclusionReasons).toContain("product_scope_not_matched");
    expect(note?.productIds).toEqual(["prod-nutrient-b"]);
    expect(note?.limitations.map((l) => l.code)).toContain("product_specific_instruction");
  });

  it("leaves exclusion reasons empty for a genuinely applicable counter-claim", () => {
    const reg = registry([
      ...EVIDENCE_FIXTURES.filter((r) => r.evidenceId !== "ev-vpd-flower-band-contested"),
      record({
        evidenceId: "ev-vpd-flower-band-contested",
        tier: "controlled_cannabis_research",
        sourceDocumentType: "journal_article",
        species: "cannabis",
        citation: {
          title: "Contrary finding",
          publisher: "Controlled Environment Research Letters",
          year: 2025,
          locator: "10.5678/cerl.2025.0001",
          url: null,
        },
        growSettings: [],
        media: [],
        irrigationArchitectures: [],
        stages: ["flower"],
        metrics: ["vpd_kpa"],
        agnosticAxes: ["growSettings", "media", "irrigationArchitectures"],
        applicabilityConditions: [],
        limitations: [],
        status: "verified",
      }),
    ]);
    const r = retrieve({}, {}, reg);
    const note = r.conflicts.find((c) => c.evidenceId === "ev-vpd-flower-band-contested");
    expect(note).toBeDefined();
    expect(note?.excludedFromApplicable).toBe(false);
    expect(note?.exclusionReasons).toEqual([]);
  });

  it("still reports why a retired counter-claim is not applicable", () => {
    const r = retrieve();
    const note = r.conflicts.find((c) => c.evidenceId === "ev-vpd-flower-band-contested");
    expect(note?.exclusionReasons).toContain("status_not_verified");
  });
});
