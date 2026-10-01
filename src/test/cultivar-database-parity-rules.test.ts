import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CULTIVAR_SOURCES,
  VERDANT_CULTIVARS,
  getCultivarGuideSections,
  getCultivarSources,
} from "@/constants/strainReferenceLibrary";
import {
  auditCultivarDatabaseParity,
  cultivarParityExitCode,
  type CultivarParityReport,
} from "@/lib/cultivarDatabaseParityRules";
import type {
  CultivarDatabaseRow,
  CultivarDatabaseSnapshot,
} from "@/lib/cultivarDatabaseReadModel";
import {
  CULTIVAR_SEED_PAYLOAD_TAG,
  buildCultivarDatabaseSeedPayload,
  cultivarSeedPayloadToSnapshot,
  extractCultivarSeedPayloadFromMigration,
  serializeCultivarSeedPayload,
} from "@/lib/cultivarDatabaseSeedPayloadRules";

const MIGRATION_PATH =
  "supabase/migrations/20261001160000_strain_reference_library_v1_1_parity.sql";
const MIGRATION_SQL = readFileSync(resolve(process.cwd(), MIGRATION_PATH), "utf8");

const bundledPayload = () =>
  buildCultivarDatabaseSeedPayload({
    profiles: VERDANT_CULTIVARS,
    sources: CULTIVAR_SOURCES,
    sectionsFor: getCultivarGuideSections,
  });

type MutableSnapshot = Record<keyof CultivarDatabaseSnapshot, Record<string, unknown>[]>;
const freshSnapshot = (): MutableSnapshot =>
  structuredClone(cultivarSeedPayloadToSnapshot(bundledPayload())) as MutableSnapshot;

function audit(snapshot: CultivarDatabaseSnapshot | MutableSnapshot): CultivarParityReport {
  return auditCultivarDatabaseParity({
    bundledProfiles: VERDANT_CULTIVARS,
    bundledSources: CULTIVAR_SOURCES,
    bundledSectionsFor: getCultivarGuideSections,
    bundledSourcesFor: getCultivarSources,
    snapshot: snapshot as CultivarDatabaseSnapshot,
  });
}

const cultivarRow = (snapshot: MutableSnapshot, slug: string) => {
  const row = snapshot.cultivars.find((item) => item.slug === slug);
  if (!row) throw new Error(`no ${slug}`);
  return row;
};
const sectionRow = (snapshot: MutableSnapshot, slug: string, key: string) => {
  const row = snapshot.cultivar_guide_sections.find((item) => item.id === `section:${slug}:${key}`);
  if (!row) throw new Error(`no ${slug}/${key}`);
  return row as { content: Record<string, unknown> } & Record<string, unknown>;
};
const claimRows = (snapshot: MutableSnapshot, slug: string, trait: string) =>
  snapshot.cultivar_claims.filter(
    (item) => item.cultivar_id === cultivarRow(snapshot, slug).id && item.trait_key === trait,
  );
const paths = (report: CultivarParityReport) =>
  report.issues.map((issue) => `${issue.kind} ${issue.slug ?? "*"} ${issue.path}`);

describe("cultivar database parity — approved content", () => {
  it("is ready with exact 10-profile coverage when the database matches the bundled library", () => {
    const report = audit(freshSnapshot());
    expect(report.status).toBe("ready");
    expect(report.issues).toEqual([]);
    expect(report.expectedSlugs).toEqual([
      "blue-cookies",
      "blue-dream",
      "do-si-dos",
      "gg4",
      "jack-herer",
      "lemon-cherry-gelato",
      "og-kush",
      "oreoz",
      "sour-diesel",
      "sour-stomper",
    ]);
    expect(report.matchedSlugs).toEqual(report.expectedSlugs);
    expect(report.counts).toEqual({
      profiles: { expected: 10, database: 10 },
      aliases: { expected: 16, database: 16 },
      terpeneClaims: { expected: 30, database: 30 },
      cannabinoidClaims: { expected: 9, database: 9 },
      profileSources: { expected: 50, database: 50 },
      guideSections: { expected: 140, database: 140 },
      sources: { expected: 14, database: 14 },
    });
  });

  it("the checked-in V1.1 migration payload is exactly the payload of the approved library", () => {
    const extraction = extractCultivarSeedPayloadFromMigration(MIGRATION_SQL);
    expect(extraction.ok).toBe(true);
    if (!extraction.ok) return;
    // Drift guard: editing the bundled library without a new migration turns this red.
    expect(serializeCultivarSeedPayload(extraction.payload)).toBe(
      serializeCultivarSeedPayload(bundledPayload()),
    );
    expect(audit(cultivarSeedPayloadToSnapshot(extraction.payload)).status).toBe("ready");
  });

  it("is deterministic and independent of row order", () => {
    const first = audit(freshSnapshot());
    const shuffled = freshSnapshot();
    for (const rows of Object.values(shuffled)) rows.reverse();
    expect(audit(shuffled)).toEqual(first);

    const broken = freshSnapshot();
    cultivarRow(broken, "gg4").lineage_text = "Changed lineage";
    const reversedBroken = structuredClone(broken);
    for (const rows of Object.values(reversedBroken)) rows.reverse();
    expect(audit(reversedBroken)).toEqual(audit(broken));
  });
});

describe("cultivar database parity — blocked content", () => {
  it("reproduces the V1 seed gaps as blocked findings", () => {
    const snapshot = freshSnapshot();
    // The V1 seed rated Sour Stomper intermediate, lacked an OG Kush alias,
    // and stored no reported tendencies or profile-level source join.
    cultivarRow(snapshot, "sour-stomper").difficulty = "intermediate";
    const ogId = cultivarRow(snapshot, "og-kush").id;
    snapshot.cultivar_aliases = snapshot.cultivar_aliases.filter(
      (row) => !(row.cultivar_id === ogId && row.alias === "Original Gangster Kush"),
    );
    sectionRow(snapshot, "blue-dream", "vegetative").content.reported_tendencies = [];
    const sdId = cultivarRow(snapshot, "sour-diesel").id;
    snapshot.cultivar_profile_sources = snapshot.cultivar_profile_sources.filter(
      (row) => !(row.cultivar_id === sdId && row.sort_order === 4),
    );

    const report = audit(snapshot);
    expect(report.status).toBe("blocked");
    expect(paths(report)).toEqual(
      expect.arrayContaining([
        "changed sour-stomper profile.difficulty",
        "missing og-kush profile.aliases[1]",
        "missing og-kush aliasNormalization[1]",
        "missing blue-dream guideSections[3].reportedTendencies[0]",
        "missing sour-diesel profile.sourceKeys[4]",
        "missing sour-diesel profileSources[4]",
      ]),
    );
    expect(report.matchedSlugs).not.toContain("sour-stomper");
  });

  it("keeps null as null: a value where the approved profile has none is blocked", () => {
    const snapshot = freshSnapshot();
    cultivarRow(snapshot, "oreoz").thc_pct_min = 0;
    cultivarRow(snapshot, "oreoz").thc_pct_max = 0;
    const report = audit(snapshot);
    expect(report.status).toBe("blocked");
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        slug: "oreoz",
        path: "profile.thcPctMin",
        expected: null,
        actual: 0,
      }),
    );
  });

  it("fails reordered terpenes", () => {
    const snapshot = freshSnapshot();
    const [first, second] = claimRows(snapshot, "jack-herer", "terpene");
    const firstRank = (first.value_jsonb as { rank: number }).rank;
    (first.value_jsonb as { rank: number }).rank = (second.value_jsonb as { rank: number }).rank;
    (second.value_jsonb as { rank: number }).rank = firstRank;
    const report = audit(snapshot);
    expect(report.status).toBe("blocked");
    expect(paths(report)).toContain("changed jack-herer profile.terpeneClaims[0].terpene");
  });

  it("fails a missing terpene claim", () => {
    const snapshot = freshSnapshot();
    const last = claimRows(snapshot, "gg4", "terpene").find(
      (row) => (row.value_jsonb as { rank: number }).rank === 3,
    );
    snapshot.cultivar_claims = snapshot.cultivar_claims.filter((row) => row !== last);
    const report = audit(snapshot);
    expect(report.status).toBe("blocked");
    expect(paths(report)).toContain("missing gg4 profile.terpeneClaims[2]");
  });

  it("fails a changed claim source, confidence, method, or variability note", () => {
    const snapshot = freshSnapshot();
    const [thc] = claimRows(snapshot, "blue-dream", "reported_thc_pct");
    thc.confidence = "high";
    (thc.context_jsonb as Record<string, unknown>).variability_note = "Always identical.";
    const [terpene] = claimRows(snapshot, "og-kush", "terpene");
    (terpene.context_jsonb as Record<string, unknown>).analytical_method = "gc_ms";
    const report = audit(snapshot);
    expect(paths(report)).toEqual(
      expect.arrayContaining([
        "changed blue-dream profile.cannabinoidClaims[0].confidence",
        "changed blue-dream profile.cannabinoidClaims[0].context.variabilityNote",
        "changed og-kush profile.terpeneClaims[0].context.analyticalMethod",
      ]),
    );
  });

  it("fails a changed caution or missing-information state", () => {
    const snapshot = freshSnapshot();
    sectionRow(snapshot, "sour-stomper", "training").content.cautions = ["Defoliate heavily."];
    sectionRow(snapshot, "oreoz", "missing_information").content.missing_information = [];
    const report = audit(snapshot);
    expect(report.status).toBe("blocked");
    expect(paths(report)).toEqual(
      expect.arrayContaining([
        "changed sour-stomper guideSections[8].cautions[0]",
        "missing oreoz guideSections[13].missingInformation[0]",
      ]),
    );
  });

  it("fails a changed source citation", () => {
    const snapshot = freshSnapshot();
    const source = snapshot.cultivar_sources.find(
      (row) => row.source_key === "watts-2021-terpene-genetics",
    );
    if (!source) throw new Error("source");
    source.title = "Retitled";
    const report = audit(snapshot);
    expect(report.status).toBe("blocked");
    expect(paths(report)).toContain("changed * sources.watts-2021-terpene-genetics.title");
  });

  it("fails a missing, wrong, or unreadable alias source", () => {
    const aliasOf = (snapshot: MutableSnapshot, slug: string, alias: string) => {
      const found = snapshot.cultivar_aliases.find(
        (item) => item.cultivar_id === cultivarRow(snapshot, slug).id && item.alias === alias,
      );
      if (!found) throw new Error(`${slug}/${alias}`);
      return found;
    };

    const missing = freshSnapshot();
    aliasOf(missing, "gg4", "GG4").source_id = null;
    const missingReport = audit(missing);
    expect(missingReport.status).toBe("blocked");
    expect(missingReport.issues).toContainEqual(
      expect.objectContaining({
        slug: "gg4",
        kind: "changed",
        path: "aliasNormalization[0].sourceKey",
        expected: "gg4-public-profile",
        actual: null,
      }),
    );

    const wrong = freshSnapshot();
    const watts = wrong.cultivar_sources.find(
      (item) => item.source_key === "watts-2021-terpene-genetics",
    );
    aliasOf(wrong, "gg4", "GG4").source_id = watts?.id;
    expect(paths(audit(wrong))).toContain("changed gg4 aliasNormalization[0].sourceKey");

    const unreadable = freshSnapshot();
    aliasOf(unreadable, "gg4", "GG4").source_id = "not-a-readable-source";
    const unreadableReport = audit(unreadable);
    expect(unreadableReport.status).toBe("invalid");
    expect(paths(unreadableReport)).toContain("malformed gg4 cultivar_aliases.source_id");
  });

  it("fails drifted guide metadata, section metadata, and link support notes", () => {
    const snapshot = freshSnapshot();
    const guide = snapshot.cultivar_guides.find(
      (item) => item.cultivar_id === cultivarRow(snapshot, "gg4").id,
    );
    if (!guide) throw new Error("guide");
    guide.title = "Renamed guide";
    guide.published_at = "2026-09-01T00:00:00Z";
    sectionRow(snapshot, "gg4", "missing_information").sort_order = 150;
    const link = snapshot.cultivar_guide_section_sources.find(
      (item) => item.guide_section_id === "section:gg4:overview",
    );
    if (!link) throw new Error("link");
    link.support_note = "Edited note.";
    const report = audit(snapshot);
    expect(report.status).toBe("blocked");
    expect(paths(report)).toEqual(
      expect.arrayContaining([
        "changed gg4 guideMetadata.title",
        "changed gg4 guideMetadata.publishedAt",
        "changed gg4 sectionMetadata.missing_information.sortOrder",
        "changed gg4 sectionMetadata.overview.sourceNotes.gg4-public-profile",
      ]),
    );
  });

  it("fails auxiliary claims that cite the wrong source", () => {
    const snapshot = freshSnapshot();
    const watts = snapshot.cultivar_sources.find(
      (item) => item.source_key === "watts-2021-terpene-genetics",
    );
    claimRows(snapshot, "og-kush", "chemotype")[0].source_id = watts?.id;
    claimRows(snapshot, "og-kush", "reported_dominant_terpenes")[0].source_id = watts?.id;
    const report = audit(snapshot);
    expect(report.status).toBe("blocked");
    expect(paths(report)).toEqual(
      expect.arrayContaining([
        "changed og-kush claims.chemotype.sourceKey",
        "changed og-kush claims.reported_dominant_terpenes.sourceKey",
      ]),
    );
  });

  it("fails auxiliary claims whose provenance metadata drifted", () => {
    const snapshot = freshSnapshot();
    const chemotype = claimRows(snapshot, "og-kush", "chemotype")[0];
    chemotype.confidence = "high";
    chemotype.verified_at = "2026-09-01T00:00:00Z";
    const dominant = claimRows(snapshot, "og-kush", "reported_dominant_terpenes")[0];
    (dominant.context_jsonb as Record<string, unknown>).analytical_method = "gc_ms";
    dominant.unit = "%";
    const report = audit(snapshot);
    expect(report.status).toBe("blocked");
    expect(paths(report)).toEqual(
      expect.arrayContaining([
        "changed og-kush claims.chemotype.metadata.confidence",
        "changed og-kush claims.chemotype.metadata.verifiedAt",
        "changed og-kush claims.reported_dominant_terpenes.metadata.context.analytical_method",
        "changed og-kush claims.reported_dominant_terpenes.metadata.unit",
      ]),
    );
  });

  it("fails an extra readable source outside the approved catalog", () => {
    const snapshot = freshSnapshot();
    snapshot.cultivar_sources.push({
      ...snapshot.cultivar_sources[0],
      id: "51000000-0000-4000-8000-000000000999",
      source_key: "unapproved-extra-source",
    });
    const report = audit(snapshot);
    expect(report.status).toBe("blocked");
    expect(report.counts.sources).toEqual({ expected: 14, database: 15 });
    expect(paths(report)).toContain("unexpected * sources.unapproved-extra-source");
  });

  it("fails an extra or stale section source link", () => {
    const snapshot = freshSnapshot();
    const watts = snapshot.cultivar_sources.find(
      (row) => row.source_key === "watts-2021-terpene-genetics",
    );
    snapshot.cultivar_guide_section_sources.push({
      guide_section_id: "section:gg4:germination",
      source_id: watts?.id,
      support_note: "Stale association.",
    });
    const report = audit(snapshot);
    expect(report.status).toBe("blocked");
    expect(paths(report)).toContain("unexpected gg4 sectionSourceLinks.germination");
  });

  it("is invalid when a cited tendency loses its section source link", () => {
    const snapshot = freshSnapshot();
    snapshot.cultivar_guide_section_sources = snapshot.cultivar_guide_section_sources.filter(
      (row) => row.guide_section_id !== "section:lemon-cherry-gelato:environment",
    );
    const report = audit(snapshot);
    expect(report.status).toBe("invalid");
    expect(paths(report)).toContain(
      "malformed lemon-cherry-gelato cultivar_guide_section_sources[environment]",
    );
    expect(report.matchedSlugs).not.toContain("lemon-cherry-gelato");
  });

  it("fails publication, verification, origin, schema-version, and verified-date drift", () => {
    const snapshot = freshSnapshot();
    cultivarRow(snapshot, "blue-cookies").verification_status = "verified";
    cultivarRow(snapshot, "blue-cookies").data_origin = "editorial";
    cultivarRow(snapshot, "blue-cookies").last_verified_at = "2026-09-01T00:00:00Z";
    const guide = snapshot.cultivar_guides.find(
      (row) => row.cultivar_id === cultivarRow(snapshot, "blue-cookies").id,
    );
    if (!guide) throw new Error("guide");
    guide.content_schema_version = 2;
    const report = audit(snapshot);
    expect(paths(report)).toEqual(
      expect.arrayContaining([
        "changed blue-cookies profile.verificationStatus",
        "changed blue-cookies profile.dataOrigin",
        "changed blue-cookies profile.lastVerifiedAt",
        "changed blue-cookies profile.contentSchemaVersion",
      ]),
    );
  });

  it("fails pheno-hunt focus and sample-reference drift", () => {
    const snapshot = freshSnapshot();
    cultivarRow(snapshot, "do-si-dos").pheno_hunt_focus = ["Yield"];
    (cultivarRow(snapshot, "do-si-dos").sample_phenos as Record<string, string>[])[0].yield_note =
      "Huge yields";
    const report = audit(snapshot);
    expect(paths(report)).toEqual(
      expect.arrayContaining([
        "changed do-si-dos profile.phenoHuntFocus[0]",
        "changed do-si-dos profile.samplePhenos[0].yieldNote",
      ]),
    );
  });

  it("fails stored chemotype or dominant-terpene claims that disagree with the profile", () => {
    const snapshot = freshSnapshot();
    claimRows(snapshot, "og-kush", "chemotype")[0].value_text = "type_iii";
    claimRows(snapshot, "og-kush", "reported_dominant_terpenes")[0].value_jsonb = ["linalool"];
    const report = audit(snapshot);
    expect(paths(report)).toEqual(
      expect.arrayContaining([
        "changed og-kush claims.chemotype",
        "changed og-kush claims.reported_dominant_terpenes[0]",
      ]),
    );
  });

  it("reports missing and unexpected profiles and unapproved claim traits", () => {
    const snapshot = freshSnapshot();
    snapshot.cultivars = snapshot.cultivars.filter((row) => row.slug !== "jack-herer");
    const extra = { ...cultivarRow(snapshot, "gg4"), id: "extra-id", slug: "gg4-extra" };
    snapshot.cultivars.push(extra);
    for (const table of [
      "cultivar_guides",
      "cultivar_profile_sources",
      "cultivar_claims",
    ] as const) {
      for (const row of snapshot[table].filter(
        (item) => item.cultivar_id === cultivarRow(snapshot, "gg4").id,
      )) {
        snapshot[table].push({ ...row, cultivar_id: "extra-id", id: `extra-${String(row.id)}` });
      }
    }
    for (const row of snapshot.cultivar_guide_sections.filter((item) =>
      String(item.id).startsWith("section:gg4:"),
    )) {
      const guide = snapshot.cultivar_guides.find((item) => item.cultivar_id === "extra-id");
      snapshot.cultivar_guide_sections.push({
        ...row,
        id: `extra-${String(row.id)}`,
        guide_id: guide?.id,
      });
    }
    for (const link of snapshot.cultivar_guide_section_sources.filter((item) =>
      String(item.guide_section_id).startsWith("section:gg4:"),
    )) {
      snapshot.cultivar_guide_section_sources.push({
        ...link,
        guide_section_id: `extra-${String(link.guide_section_id)}`,
      });
    }
    snapshot.cultivar_claims.push({
      ...claimRows(snapshot, "sour-diesel", "chemotype")[0],
      id: "yield-claim",
      trait_key: "reported_yield",
      value_text: "huge",
    });
    const report = audit(snapshot);
    expect(paths(report)).toEqual(
      expect.arrayContaining([
        "missing jack-herer profile",
        "unexpected gg4-extra profile",
        "unexpected sour-diesel claims.reported_yield",
      ]),
    );
  });
});

describe("cultivar database parity — invalid read model", () => {
  it("is invalid when a guide section is missing", () => {
    const snapshot = freshSnapshot();
    snapshot.cultivar_guide_sections = snapshot.cultivar_guide_sections.filter(
      (row) => row.id !== "section:blue-dream:harvest",
    );
    const report = audit(snapshot);
    expect(report.status).toBe("invalid");
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        slug: "blue-dream",
        kind: "malformed",
        path: "cultivar_guide_sections",
      }),
    );
    expect(report.matchedSlugs).not.toContain("blue-dream");
  });

  it("is invalid for malformed rows and never reports them as also missing", () => {
    const snapshot = freshSnapshot();
    cultivarRow(snapshot, "gg4").data_origin = "ai_draft";
    const report = audit(snapshot);
    expect(report.status).toBe("invalid");
    expect(paths(report)).toContain("malformed gg4 cultivars.data_origin");
    expect(paths(report)).not.toContain("missing gg4 profile");
  });

  it("orders tied malformed issues identically regardless of row order", () => {
    const snapshot = freshSnapshot();
    snapshot.cultivar_sources[0].url = "http://insecure.example/a";
    snapshot.cultivar_sources[1].url = "http://insecure.example/b";
    const reversed = structuredClone(snapshot);
    for (const rows of Object.values(reversed)) rows.reverse();
    const forward = audit(snapshot);
    expect(forward.status).toBe("invalid");
    expect(audit(reversed)).toEqual(forward);
  });

  it("is invalid when a table is absent from the snapshot", () => {
    const snapshot = freshSnapshot() as Partial<MutableSnapshot>;
    delete snapshot.cultivar_profile_sources;
    expect(audit(snapshot as MutableSnapshot).status).toBe("invalid");
  });

  it("strict mode exits nonzero unless ready; report mode never fails", () => {
    const ready = audit(freshSnapshot());
    const blockedSnapshot = freshSnapshot();
    cultivarRow(blockedSnapshot, "gg4").description = "Changed";
    const blocked = audit(blockedSnapshot);
    expect(cultivarParityExitCode(ready, true)).toBe(0);
    expect(cultivarParityExitCode(blocked, true)).toBe(1);
    expect(cultivarParityExitCode(blocked, false)).toBe(0);
  });
});

describe("cultivar seed payload extraction", () => {
  const tag = `$${CULTIVAR_SEED_PAYLOAD_TAG}$`;

  it("rejects a migration without exactly one well-formed payload", () => {
    expect(extractCultivarSeedPayloadFromMigration("select 1;").ok).toBe(false);
    expect(extractCultivarSeedPayloadFromMigration(`${tag}{not json${tag}`)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/not valid JSON/),
    });
    expect(
      extractCultivarSeedPayloadFromMigration(`${tag}{"payload_version":2}${tag}`),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/payload_version/) });
    const body = serializeCultivarSeedPayload(bundledPayload());
    expect(
      extractCultivarSeedPayloadFromMigration(`${tag}${body}${tag} ${tag}${body}${tag}`).ok,
    ).toBe(false);
  });

  it("uses stable, unique identifiers", () => {
    const payload = bundledPayload();
    expect(bundledPayload()).toEqual(payload);
    const ids = [
      ...payload.sources.map((source) => source.id),
      ...payload.cultivars.map((cultivar) => cultivar.id),
      ...payload.cultivars.map((cultivar) => cultivar.guide.id),
      ...payload.cultivars.flatMap((cultivar) => cultivar.claims.map((claim) => claim.id)),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^5[1-7]000000-0000-4000-8000-\d{12}$/);
    // V1 seed identities are preserved for the rows it already created.
    expect(payload.cultivars.find((c) => c.slug === "sour-diesel")?.id).toBe(
      "54000000-0000-4000-8000-000000000001",
    );
    expect(payload.sources.find((s) => s.source_key === "sour-stomper-product-info")?.id).toBe(
      "51000000-0000-4000-8000-000000000110",
    );
  });

  it("snapshot rows carry no private or grow-scoped columns", () => {
    const snapshot = cultivarSeedPayloadToSnapshot(bundledPayload());
    const columns = new Set(
      Object.values(snapshot).flatMap((rows: readonly CultivarDatabaseRow[]) =>
        rows.flatMap((row) => Object.keys(row)),
      ),
    );
    for (const forbidden of ["user_id", "grow_id", "tent_id", "plant_id", "created_by"]) {
      expect(columns.has(forbidden)).toBe(false);
    }
  });
});
