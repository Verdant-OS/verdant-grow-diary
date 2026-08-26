import assert from "node:assert/strict";
import test from "node:test";

import {
  runtimeGuideDigest,
  validateCorpusReviewPacket,
} from "./validate-corpus-review-packet.mjs";

const PATHS = Object.freeze([
  "/guides/cannabis-burnt-crispy-leaf-tips",
  "/guides/cannabis-leaf-spots-lesions",
  "/guides/cannabis-leaf-symptoms",
  "/guides/cannabis-leaves-turning-yellow",
]);
const PROVENANCE_ID = "source:pr-627-route-cohort-provenance";
const EVIDENCE_SOURCE_IDS = Object.freeze(["source:extension-b", "source:peer-a"]);

function clone(value) {
  return structuredClone(value);
}

function resolvedGuide(path) {
  return {
    path,
    publishedOn: "2026-08-01",
    modifiedOn: "2026-08-01",
    material: [{ key: "body", text: `Bounded material for ${path}`, sha256: "a".repeat(64) }],
    internalLinks: [{ location: "body", path: "/guides" }],
    externalSources: [],
    relatedPaths: [],
  };
}

function source(id, sourceType, overrides = {}) {
  const isProvenance = sourceType === "cohort_provenance";
  const url = isProvenance
    ? "https://github.com/Verdant-OS/verdant-grow-diary/pull/627"
    : `https://example.edu/${id.split(":")[1]}`;
  return {
    id,
    sourceType,
    title: isProvenance ? "Verdant route cohort pull request" : `Evidence source ${id}`,
    url,
    publisher: isProvenance
      ? "Verdant-OS"
      : id === "source:peer-a"
        ? "Peer Journal"
        : "University Extension",
    authors: [],
    evidenceTier: id === "source:peer-a" ? "A" : "B",
    publishedOn: "2026-08-01",
    versionDate: null,
    accessedOn: "2026-08-26",
    stableIdentifier: url,
    archiveLocator: null,
    license: "Link and independent paraphrase only",
    limitations: ["This source does not establish a diagnosis by itself."],
    ...overrides,
  };
}

function applicability() {
  return {
    evidenceBasis: "authoritative_synthesis",
    speciesOrPopulation: "Cannabis sativa L. and general plant-diagnostic context",
    cultivarPopulation: "No cultivar-specific conclusion",
    stageScope: "All stages require stage-specific interpretation",
    propagationMethod: "Not evaluated as an independent causal factor",
    mediumScope: "Medium changes interpretation and must be recorded",
    facilityScope: "Indoor, greenhouse, and field transfer is not assumed",
    methodScope: "Observation pattern and history before intervention",
    unitScope: "No numeric threshold is asserted",
    evidenceDateScope: "Linked source versions accessed 2026-08-26",
    sampleSize: "Source-specific sample sizes are not pooled in this draft.",
    replication: "Source-specific replication designs are not pooled in this draft.",
    environmentalContext: {
      temperature: "Must be recorded; no universal threshold asserted",
      humidity: "Must be recorded; no universal threshold asserted",
      light: "Must be recorded; no universal threshold asserted",
      co2: "Not independently evaluated",
      irrigation: "Must be recorded as a confounder",
      pathogen: "Symptoms alone do not establish pathogen identity",
    },
    scopeNote: "A cautious evidence-check workflow, not a diagnosis",
    transferLimits: ["Controlled-study observations do not transfer universally."],
  };
}

function claim(path) {
  const slug = path.slice("/guides/".length);
  return {
    id: `claim:${slug}:bounded-evidence-check`,
    path,
    claimType: "diagnostic_boundary",
    wordingState: "bounded",
    evidenceState: "sourced_pending_review",
    riskClass: "R2",
    riskDomains: ["standard"],
    text: "A visible symptom should trigger evidence gathering rather than a single-cause diagnosis.",
    sourceLinks: EVIDENCE_SOURCE_IDS.map((sourceId) => ({
      sourceId,
      roles: sourceId === "source:peer-a" ? ["limits", "supports"] : ["supports"],
      locator: "Diagnostic method and limitations section",
    })),
    applicability: applicability(),
    confounders: ["Stage, medium, root-zone, light, and recent changes can overlap."],
    uncertainty: ["Visible appearance alone is not specific."],
    prohibitedConclusions: ["Do not identify a nutrient, pest, or pathogen from one sign."],
    limitations: ["This draft has not completed evidence or cultivation review."],
    authorId: null,
    evidenceReviewerIds: [],
    cultivationReviewerIds: [],
    approvalDecision: "pending",
    approvedOn: null,
    invalidationTriggers: ["Material copy, source, or product behavior changes."],
    nextReviewOn: null,
    materialKeys: ["body"],
  };
}

function page(path, guide) {
  const claimId = claim(path).id;
  const isHub = path === "/guides/cannabis-leaf-symptoms";
  return {
    path,
    pageFamily: isHub ? "cluster" : "diagnostic",
    riskClass: "R2",
    runtimeMaterialSha256: runtimeGuideDigest(guide),
    claimIds: [claimId],
    nonClaimMaterial: [],
    proposedVisibleSourceIds: [...EVIDENCE_SOURCE_IDS],
    proposedLinks: isHub
      ? [
          {
            location: "body",
            path: "/guides/cannabis-leaves-turning-yellow",
            slot: "next_step",
            status: "proposed",
          },
        ]
      : [
          {
            location: "body",
            path: "/guides/cannabis-leaf-symptoms",
            slot: "contextual_lateral",
            status: "proposed",
          },
        ],
    searchResearchReceiptId: null,
    originalAssetReviewId: null,
  };
}

function makeFixture() {
  const resolvedGuides = PATHS.map(resolvedGuide);
  return {
    cohortRegistry: {
      cohorts: [
        {
          id: "PV1-SYMPTOM-EVIDENCE-GUIDES",
          sourcePullRequest: 627,
          paths: [...PATHS],
        },
      ],
    },
    resolvedGuides,
    packet: {
      version: 1,
      artifactType: "knowledge_corpus_review_packet",
      revisionId: "pv1-symptom-evidence-guides:draft-001",
      createdOn: "2026-08-26",
      evidenceScope: "resolved_runtime_material_and_draft_claim_map",
      cohort: {
        id: "PV1-SYMPTOM-EVIDENCE-GUIDES",
        registrySourcePullRequest: 627,
        cohortProvenanceSourceId: PROVENANCE_ID,
        paths: [...PATHS],
        sourceRouteState: "registered_public",
        editorialState: "sourced",
        publicationReadiness: "BLOCKED",
      },
      statusEvidence: {
        publicationStatus: "NOT_MEASURED",
        renderedCrawlStatus: "NOT_MEASURED",
      },
      assignments: {
        managingEditorId: null,
        authorIds: [],
        evidenceReviewerIds: [],
        cultivationReviewerIds: [],
      },
      aiAssistance: {
        tool: "Codex",
        usedOn: "2026-08-26",
        uses: ["Draft claim organization", "Source discovery"],
        humanVerifierId: null,
      },
      sources: [
        source("source:extension-b", "evidence"),
        source("source:peer-a", "evidence"),
        source(PROVENANCE_ID, "cohort_provenance"),
      ],
      claims: PATHS.map(claim).sort((left, right) => left.id.localeCompare(right.id)),
      pages: PATHS.map((path, index) => page(path, resolvedGuides[index])),
    },
  };
}

function assertInvalid(mutator, pattern) {
  const fixture = makeFixture();
  mutator(fixture);
  assert.throws(() => validateCorpusReviewPacket(fixture), pattern);
}

test("accepts a structurally valid sourced draft while preserving BLOCKED readiness", () => {
  const result = validateCorpusReviewPacket(makeFixture());
  assert.equal(result.contractStatus, "pass");
  assert.equal(result.editorialState, "sourced");
  assert.equal(result.publicationReadiness, "BLOCKED");
  assert.equal(result.publicationStatus, "NOT_MEASURED");
  assert.equal(result.renderedCrawlStatus, "NOT_MEASURED");
  assert.equal(result.pageCount, 4);
  assert.equal(result.claimCount, 4);
  assert.ok(result.blockers.some((blocker) => blocker.code === "AUTHOR_UNASSIGNED"));
  assert.ok(result.blockers.some((blocker) => blocker.code === "VISIBLE_SOURCES_NOT_RENDERED"));
  assert.ok(result.blockers.some((blocker) => blocker.code === "DIFFERENTIAL_LINKS_UNREVIEWED"));
});

test("pins the exact cohort and exact resolved runtime material", () => {
  assertInvalid(({ packet }) => {
    packet.cohort.paths.pop();
  }, /must exactly equal the registered route cohort/);
  assertInvalid(({ resolvedGuides }) => {
    resolvedGuides[0].material[0].sha256 = "b".repeat(64);
  }, /runtime material changed without review-packet refresh/);
  assertInvalid(({ packet }) => {
    packet.pages[0].claimIds = [];
  }, /claimIds must be an array with at least 1 item/);
});

test("requires complete, exact material classifications", () => {
  assertInvalid(({ packet }) => {
    packet.claims[0].materialKeys = ["unknown"];
  }, /material coverage diverges/);
  assertInvalid(({ packet }) => {
    packet.pages[0].nonClaimMaterial.push({
      keys: ["body"],
      classification: "heading",
      reason: "This is a presentation heading, not a factual claim.",
    });
  }, /material coverage must be unique/);
});

test("requires sample-size and replication scope for every claim", () => {
  assertInvalid(({ packet }) => {
    delete packet.claims[0].applicability.sampleSize;
  }, /applicability\.sampleSize/);
  assertInvalid(({ packet }) => {
    delete packet.claims[0].applicability.replication;
  }, /applicability\.replication/);
});

test("never lets pending data impersonate approval", () => {
  assertInvalid(({ packet }) => {
    packet.cohort.sourceRouteState = "published";
  }, /sourceRouteState must record current public-source registry membership/);
  assertInvalid(({ packet }) => {
    packet.cohort.publicationReadiness = "READY";
  }, /publicationReadiness must remain BLOCKED/);
  assertInvalid(({ packet }) => {
    packet.claims[0].approvalDecision = "approved";
  }, /must remain pending with null approval and review dates/);
  assertInvalid(({ packet }) => {
    packet.claims[0].authorId = "author:invented";
  }, /authorId must remain null/);
  assertInvalid(({ packet }) => {
    packet.claims[0].evidenceReviewerIds = ["reviewer:invented"];
  }, /cannot claim evidence review/);
});

test("keeps PR 627 as cohort provenance instead of scientific evidence", () => {
  assertInvalid(({ packet }) => {
    packet.claims[0].sourceLinks[0].sourceId = PROVENANCE_ID;
    packet.claims[0].sourceLinks.sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  }, /cannot use cohort provenance as scientific evidence/);
  assertInvalid(({ packet }) => {
    packet.sources.find((candidate) => candidate.id === PROVENANCE_ID).url += "/files";
  }, /must use the exact registered pull-request URL/);
});

test("requires canonical, located, independently identified evidence sources", () => {
  assertInvalid(({ packet }) => {
    packet.claims[0].sourceLinks[0].locator = "";
  }, /locator must be a string/);
  assertInvalid(({ packet }) => {
    packet.sources[0].url = "http://example.edu/evidence";
  }, /must use HTTPS/);
  assertInvalid(({ packet }) => {
    packet.sources[1].stableIdentifier = packet.sources[0].stableIdentifier;
  }, /repeat stableIdentifier/);
});

test("derives an R2 source-mix blocker without turning a draft contract into a false failure", () => {
  const fixture = makeFixture();
  const peer = fixture.packet.sources.find((sourceEntry) => sourceEntry.id === "source:peer-a");
  peer.evidenceTier = "B";
  peer.publisher = "University Extension";
  const result = validateCorpusReviewPacket(fixture);
  assert.equal(result.contractStatus, "pass");
  assert.ok(result.blockers.some((blocker) => blocker.code === "R2_SOURCE_MIX_UNREVIEWED"));
});

test("derives missing source-metadata blockers without inventing publication evidence", () => {
  const fixture = makeFixture();
  const evidenceSource = fixture.packet.sources.find(
    (sourceEntry) => sourceEntry.id === "source:extension-b",
  );
  evidenceSource.authors = [];
  evidenceSource.publishedOn = null;
  evidenceSource.license = "not_assessed";
  const result = validateCorpusReviewPacket(fixture);
  const sourceBlockerCodes = result.blockers
    .filter((blocker) => blocker.scopeId === "source:extension-b")
    .map((blocker) => blocker.code);
  assert.deepEqual(sourceBlockerCodes, [
    "SOURCE_AUTHORSHIP_UNVERIFIED",
    "SOURCE_DATE_UNVERIFIED",
    "SOURCE_LICENSE_UNASSESSED",
  ]);
});

test("keeps review-packet edges proposed and page-family semantics honest", () => {
  assertInvalid(({ packet }) => {
    packet.pages[0].proposedLinks[0].status = "active";
  }, /links must remain proposed/);
  assertInvalid(({ packet }) => {
    packet.pages.find(
      (pageEntry) => pageEntry.path === "/guides/cannabis-leaf-symptoms",
    ).pageFamily = "diagnostic";
  }, /symptom hub must retain pageFamily cluster/);
  assertInvalid(({ packet }) => {
    packet.pages[0].pageFamily = "cluster";
  }, /focused symptom page .* pageFamily diagnostic/);
});

test("requires runtime and packet route sets to remain equal", () => {
  assertInvalid(({ resolvedGuides }) => {
    resolvedGuides.push(resolvedGuide("/guides/extra"));
  }, /resolved runtime guides must exactly equal/);
  assertInvalid(({ packet }) => {
    packet.pages.reverse();
  }, /page paths must be sorted/);
});
