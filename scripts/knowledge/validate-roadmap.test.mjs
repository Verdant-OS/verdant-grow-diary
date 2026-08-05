import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CONVERSION_PROMISES,
  IMMUTABLE_ROADMAP_ALLOCATION_FIELDS,
  NO_PRODUCT_CTA_PROMISE,
  PRODUCT_TRUTH_SOURCE_ROLE,
  SAFETY_NO_PRODUCT_CTA_PROMISE,
  EXPECTED_PILLARS,
  collectCanonicalPillarNames,
  collectCanonicalSiteMapPillarPaths,
  collectCurrentRegistryPaths,
  collectPostV1PublicRouteCohortPaths,
  stableIdentityDigest,
  validateRoadmap,
} from "./validate-roadmap.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "..");
const roadmapPath = path.join(root, "docs", "knowledge-library", "roadmap-500.json");
const baseline = JSON.parse(readFileSync(roadmapPath, "utf8"));
const registryPaths = collectCurrentRegistryPaths(root);
const postV1RegistryPaths = collectPostV1PublicRouteCohortPaths(root);
const siteMapPillarPaths = collectCanonicalSiteMapPillarPaths(root);
const v1LivePaths = new Set(
  baseline.pages.filter((target) => target.routeStatus === "live").map((target) => target.path),
);
const symptomGuidePaths = [
  "/guides/cannabis-burnt-crispy-leaf-tips",
  "/guides/cannabis-leaf-spots-lesions",
  "/guides/cannabis-leaf-symptoms",
  "/guides/cannabis-leaves-turning-yellow",
];

function cloneRoadmap() {
  return structuredClone(baseline);
}

function page(roadmap, id) {
  const match = roadmap.pages.find((candidate) => candidate.id === id);
  assert.ok(match, `fixture page ${id} must exist`);
  return match;
}

function addAuthoredGrowJournalBrief(target) {
  target.briefStatus = "draft";
  target.linkBriefStatus = "draft";
  target.searchBriefStatus = "draft";
  target.readerOutcome =
    "After this page, the reader can produce one complete grow journal setup checklist and identify every missing record field before beginning daily entries.";
  target.nonProductNextStep =
    "Next, write one grow journal entry with a timestamp, plant context, observation, action, reason, and follow-up question before changing anything.";
  target.brief = {
    decision:
      "Use this grow journal page to decide which identity, observation, action, evidence, and follow-up fields belong in the first entry.",
    applicability:
      "Applies when a grower is starting a new record or repairing an incomplete daily logging routine.",
    informationGain:
      "Separates the minimum reconstructable journal record from optional detail so missing context remains visible instead of being guessed later.",
    assetMethod:
      "Build a grow journal setup card that traces one observation through its action and follow-up",
    assetInputs: [
      "plant and room identity fields",
      "timestamped observation and action",
      "reason and expected outcome",
      "evidence and follow-up references",
    ],
    assetOutput:
      "A grow journal setup card with required, optional, missing, and follow-up fields for one complete entry",
  };
  target.originalAsset = `${target.brief.assetMethod}. Inputs: ${target.brief.assetInputs.join("; ")}. Output: ${target.brief.assetOutput}.`;
  target.relatedPaths = ["/guides/what-to-log-in-a-grow-journal", "/guides/grow-journal-template"];
  target.searchBrief = {
    queryFamily: ["start a grow journal", "first cannabis grow journal entry"],
    serpIntent:
      "Learn how to start a grow journal with enough context to reconstruct decisions without collecting unnecessary or unverifiable detail.",
    distinctInformationGain:
      "Provides a minimum reconstructable first-entry contract and a field-by-field setup card rather than another generic list of suggested grow notes.",
    competingCanonical: {
      path: "/guides/grow-diary-app",
      relationship: "hub_child",
      rationale:
        "The pillar owns the complete plant-memory lifecycle while this child is limited to creating the first usable grow journal record.",
    },
    consolidationTrigger:
      "Consolidate this page if it expands into the complete plant-memory lifecycle instead of retaining its narrower first-record setup decision.",
  };
}

function assertInvalid(roadmap, pattern, options = {}) {
  assert.throws(
    () => validateRoadmap(roadmap, { registryPaths, postV1RegistryPaths, ...options }),
    pattern,
  );
}

test("the 500-page roadmap separates metadata backlog from authored seed briefs", () => {
  const report = validateRoadmap(cloneRoadmap(), { registryPaths, postV1RegistryPaths });

  assert.equal(report.status, "pass");
  assert.equal(report.totalPages, 500);
  assert.equal("publishedCount" in report, false);
  assert.equal(report.liveCount, registryPaths.size);
  assert.equal(
    report.plannedCount,
    500 - baseline.pages.filter((target) => target.routeStatus === "live").length,
  );
  assert.equal(report.postV1PublicRouteCount, postV1RegistryPaths.size);
  assert.deepEqual([...postV1RegistryPaths].sort(), symptomGuidePaths);
  assert.equal(report.orphanCount, 0);
  assert.equal(report.siteMapPillarCount, 10);
  for (const statusCounts of [
    report.briefStatuses,
    report.linkBriefStatuses,
    report.searchBriefStatuses,
  ]) {
    assert.equal(
      Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
      500,
    );
  }
  assert.deepEqual(report.intentStatuses, { provisional: 500 });
  assert.deepEqual(report.routeStatuses, {
    live: v1LivePaths.size,
    planned: 500 - v1LivePaths.size,
  });
  assert.deepEqual(report.libraryReadiness, {
    unassessed: 11,
    backlog: 465,
    blocked_parent: 24,
  });
  assert.deepEqual(report.priorityLanes, {
    foundation: 10,
    current_route_remediation: v1LivePaths.size - 3,
    high_consequence_safety: 12,
    core_coverage: 500 - 10 - (v1LivePaths.size - 3) - 12,
  });
  assert.deepEqual(report.pageFamilies, {
    pillar: 10,
    protocol: 88,
    reference: 296,
    diagnostic: 45,
    comparison: 12,
    "worked-example": 29,
    entity: 20,
  });
  assert.deepEqual(report.conversionModes, {
    optional_product_cta: 116,
    safety_only: 30,
    non_product_only: 354,
  });
  assert.deepEqual(report.productTruthScopes, {
    shipped_behavior: 130,
    none: 370,
  });
  assert.ok(report.warnings.every((warning) => warning.code === "live_route_blocked_parent"));
  assert.equal(report.blockedParentCount, 24);
  assert.equal(report.warnings.length, 24);
});

test("the roadmap is explicitly a candidate contract, not an authored corpus or SEO ranking", () => {
  const roadmap = cloneRoadmap();

  assert.equal(roadmap.artifactType, "content_roadmap_contract");
  assert.match(roadmap.artifactScope, /prioritized page candidates/i);
  assert.match(roadmap.artifactScope, /briefStatus=draft\|reviewed/i);
  assert.match(roadmap.artifactScope, /editorial brief/i);
  assert.equal(roadmap.priorityModel.basis, "dependency_risk_current_route_sequence");
  assert.equal(roadmap.priorityModel.searchDemand, "unknown");
  assert.equal(roadmap.priorityModel.measuredDemandClaimed, false);
  assert.match(roadmap.priorityModel.note, /not (?:an? )?SEO|not a search/i);
  assert.equal(
    roadmap.stableIdentityDigest,
    "6e26d211cb82fda321e55aa8e4d4f815c7e00c131a3dbc7a26a79d6c1cf2a324",
  );
  assert.match(roadmap.publicationRule, /not publication approval/i);
  assert.match(roadmap.publicationRule, /human-reviewed/i);
});

test("rejects a false publication rule", () => {
  const roadmap = cloneRoadmap();
  roadmap.publicationRule = "Every roadmap candidate is ready to publish automatically.";
  assertInvalid(roadmap, /publicationRule must deny automatic publication/);
});

test("pillar names stay byte-for-byte aligned with the canonical pillar-page headings", () => {
  const canonicalNames = collectCanonicalPillarNames(root);
  assert.deepEqual(
    EXPECTED_PILLARS.map((pillar) => pillar.name),
    canonicalNames,
  );
  for (const target of baseline.pages) {
    assert.equal(
      target.pillarName,
      EXPECTED_PILLARS.find((pillar) => pillar.key === target.pillar).name,
      target.id,
    );
  }
});

test("uses canonical page families and removes the overloaded legacy fields", () => {
  const allowed = new Set([
    "pillar",
    "cluster",
    "reference",
    "protocol",
    "diagnostic",
    "comparison",
    "worked-example",
    "entity",
    "glossary",
  ]);

  for (const target of baseline.pages) {
    assert.ok(allowed.has(target.pageFamily), `${target.id}: ${target.pageFamily}`);
    assert.equal("template" in target, false, target.id);
    assert.equal("status" in target, false, target.id);
  }
  assert.equal(page(baseline, "KL-017").pageFamily, "entity");
  assert.equal(page(baseline, "KL-041").pageFamily, "worked-example");
  assert.equal(page(baseline, "KL-011").pageFamily, "protocol");
});

test("product behavior scope is explicit and backed by current code or test evidence", () => {
  for (const target of baseline.pages) {
    const expectedScope =
      target.primaryCta !== null || target.routeStatus === "live" || target.id === "KL-210"
        ? "shipped_behavior"
        : "none";
    assert.equal(target.productTruthScope, expectedScope, target.id);
    assert.equal(
      target.sourceRoles.includes(PRODUCT_TRUTH_SOURCE_ROLE),
      expectedScope === "shipped_behavior",
      target.id,
    );
  }

  for (const id of ["KL-061", "KL-110", "KL-120", "KL-210", "KL-481"]) {
    assert.equal(page(baseline, id).productTruthScope, "shipped_behavior", id);
  }
  for (const id of ["KL-100", "KL-130", "KL-413", "KL-438", "KL-473"]) {
    assert.equal(page(baseline, id).productTruthScope, "none", id);
  }
});

test("rejects unsupported or unevidenced product behavior claims", async (t) => {
  await t.test("missing shipped-code role", () => {
    const roadmap = cloneRoadmap();
    const target = page(roadmap, "KL-061");
    target.sourceRoles = target.sourceRoles.filter((role) => role !== PRODUCT_TRUTH_SOURCE_ROLE);
    assertInvalid(
      roadmap,
      /KL-061 shipped product behavior requires current product test or shipped code/,
    );
  });
  await t.test("explicit Verdant boundary demoted to product-free", () => {
    const roadmap = cloneRoadmap();
    const target = page(roadmap, "KL-210");
    target.productTruthScope = "none";
    target.sourceRoles = target.sourceRoles.filter((role) => role !== PRODUCT_TRUTH_SOURCE_ROLE);
    assertInvalid(roadmap, /KL-210 productTruthScope must be shipped_behavior/);
  });
  await t.test("planned educational topic promoted without review", () => {
    const roadmap = cloneRoadmap();
    const target = page(roadmap, "KL-413");
    target.productTruthScope = "shipped_behavior";
    target.sourceRoles.push(PRODUCT_TRUTH_SOURCE_ROLE);
    assertInvalid(roadmap, /KL-413 productTruthScope must be none/);
  });
  await t.test("product evidence role attached to a product-free page", () => {
    const roadmap = cloneRoadmap();
    page(roadmap, "KL-413").sourceRoles.push(PRODUCT_TRUTH_SOURCE_ROLE);
    assertInvalid(roadmap, /KL-413 product-free scope must not claim current product evidence/);
  });
});

test("rejects reintroducing legacy status or template fields", async (t) => {
  await t.test("status", () => {
    const roadmap = cloneRoadmap();
    page(roadmap, "KL-011").status = "published";
    assertInvalid(roadmap, /KL-011 must not include legacy status/);
  });
  await t.test("template", () => {
    const roadmap = cloneRoadmap();
    page(roadmap, "KL-011").template = "how_to";
    assertInvalid(roadmap, /KL-011 must not include legacy template/);
  });
  await t.test("published boolean", () => {
    const roadmap = cloneRoadmap();
    page(roadmap, "KL-011").published = true;
    assertInvalid(roadmap, /KL-011 must not include legacy published/);
  });
});

test("separates pending metadata from authored brief states", () => {
  for (const target of baseline.pages) {
    if (target.briefStatus === "needs_editorial_brief") {
      for (const field of [
        "readerOutcome",
        "nonProductNextStep",
        "originalAsset",
        "brief",
        "priorityRationale",
        "relatedPaths",
        "searchBrief",
      ]) {
        assert.equal(field in target, false, `${target.id} must omit ${field}`);
      }
      assert.equal(target.linkBriefStatus, "needs_review", target.id);
      assert.equal(target.searchBriefStatus, "needs_research", target.id);
    } else {
      assert.ok(["draft", "reviewed"].includes(target.briefStatus), target.id);
      assert.ok(["draft", "reviewed"].includes(target.linkBriefStatus), target.id);
      assert.ok(["draft", "validated"].includes(target.searchBriefStatus), target.id);
      assert.equal(target.relatedPaths.length, 2, target.id);
    }
  }
});

test("allows editorial briefs to advance without rewriting immutable allocation", () => {
  const reviewedSeed = cloneRoadmap();
  const seed = page(reviewedSeed, "KL-001");
  seed.briefStatus = "reviewed";
  seed.linkBriefStatus = "reviewed";
  seed.searchBriefStatus = "validated";
  assert.equal(stableIdentityDigest(reviewedSeed.pages), baseline.stableIdentityDigest);
  assert.equal(validateRoadmap(reviewedSeed, { registryPaths }).status, "pass");

  const draftedCandidate = cloneRoadmap();
  addAuthoredGrowJournalBrief(page(draftedCandidate, "KL-011"));
  assert.equal(stableIdentityDigest(draftedCandidate.pages), baseline.stableIdentityDigest);
  assert.equal(validateRoadmap(draftedCandidate, { registryPaths }).status, "pass");
});

test("requires reviewed briefs to carry reviewed links and validated search evidence", () => {
  for (const incompleteState of [
    { linkBriefStatus: "draft", searchBriefStatus: "validated" },
    { linkBriefStatus: "reviewed", searchBriefStatus: "draft" },
  ]) {
    const roadmap = cloneRoadmap();
    const seed = page(roadmap, "KL-001");
    seed.briefStatus = "reviewed";
    Object.assign(seed, incompleteState);
    assertInvalid(roadmap, /reviewed brief requires reviewed links and validated search evidence/);
  }
});

test("rejects semantic prose on a pending editorial record", async (t) => {
  for (const [field, value] of [
    ["readerOutcome", "After this page, the reader can make a measurable choice."],
    ["nonProductNextStep", "Next, make a source inventory before changing the room."],
    ["originalAsset", "A fabricated asset that has not been editorially authored."],
    ["brief", {}],
    ["priorityRationale", "This prose was generated before editorial research."],
  ]) {
    await t.test(field, () => {
      const roadmap = cloneRoadmap();
      page(roadmap, "KL-011")[field] = value;
      assertInvalid(roadmap, new RegExp(`KL-011 pending editorial record must omit ${field}`));
    });
  }
});

test("rejects adjacency and search briefs that pretend a pending record was reviewed", async (t) => {
  await t.test("relatedPaths", () => {
    const roadmap = cloneRoadmap();
    page(roadmap, "KL-011").relatedPaths = [
      "/guides/grow-diary-app",
      "/guides/grow-room-vpd-tracker",
    ];
    assertInvalid(roadmap, /KL-011 pending link brief must omit relatedPaths/);
  });
  await t.test("searchBrief", () => {
    const roadmap = cloneRoadmap();
    page(roadmap, "KL-011").searchBrief = {};
    assertInvalid(roadmap, /KL-011 pending search brief must omit searchBrief/);
  });
});

test("rejects incomplete authored pillar semantics", async (t) => {
  for (const [field, pattern] of [
    ["readerOutcome", /KL-001 readerOutcome must be measurable/],
    ["nonProductNextStep", /KL-001 nonProductNextStep must be specific/],
    ["originalAsset", /KL-001 requires a page-specific originalAsset/],
    ["brief", /KL-001 requires a structured brief/],
  ]) {
    await t.test(field, () => {
      const roadmap = cloneRoadmap();
      delete page(roadmap, "KL-001")[field];
      assertInvalid(roadmap, pattern);
    });
  }
});

test("rejects a copied non-product next step that lacks pillar context", () => {
  const roadmap = cloneRoadmap();
  page(roadmap, "KL-007").nonProductNextStep =
    "Next, record one complete irrigation event with medium, container, timestamp, delivered volume, input EC and pH, runoff method, and observed crop response.";
  assertInvalid(roadmap, /KL-007 nonProductNextStep must be specific/);
});

test("authored original assets are rendered from their structured briefs", () => {
  for (const target of baseline.pages.filter((candidate) => candidate.briefStatus === "draft")) {
    const rendered = `${target.brief.assetMethod}. Inputs: ${target.brief.assetInputs.join("; ")}. Output: ${target.brief.assetOutput}.`;
    assert.equal(target.originalAsset, rendered, target.id);
    assert.doesNotMatch(JSON.stringify(target.brief), /topic-specific|separateing/i, target.id);
  }
});

test("rejects an incomplete pillar search brief", async (t) => {
  for (const field of [
    "queryFamily",
    "serpIntent",
    "distinctInformationGain",
    "competingCanonical",
    "consolidationTrigger",
  ]) {
    await t.test(field, () => {
      const roadmap = cloneRoadmap();
      delete page(roadmap, "KL-001").searchBrief[field];
      assertInvalid(roadmap, new RegExp(`KL-001 searchBrief requires ${field}`));
    });
  }
});

test("rejects a search brief copied from another pillar", () => {
  const roadmap = cloneRoadmap();
  page(roadmap, "KL-002").searchBrief = structuredClone(page(roadmap, "KL-001").searchBrief);
  assertInvalid(roadmap, /KL-002 searchBrief must be page-specific/);
});

test("rejects invalid controlled vocabularies", async (t) => {
  for (const [field, value] of [
    ["pageFamily", "how_to"],
    ["searchIntent", "browse-ish"],
    ["funnelStage", "purchase-now"],
    ["routeStatus", "published"],
    ["libraryReadiness", "ready"],
    ["intentStatus", "approved"],
    ["briefStatus", "generated"],
    ["linkBriefStatus", "approved"],
    ["searchBriefStatus", "complete"],
    ["productTruthScope", "marketing_claim"],
    ["priorityLane", "seo_demand"],
    ["conversionMode", "hard-sell"],
    ["riskDomain", "extreme-ish"],
    ["claimRiskClass", "R9"],
  ]) {
    await t.test(field, () => {
      const roadmap = cloneRoadmap();
      page(roadmap, "KL-011")[field] = value;
      assertInvalid(roadmap, new RegExp(`KL-011 has invalid ${field}`));
    });
  }
});

test("stable IDs remain decoupled from contiguous v1 priority", () => {
  assert.notEqual(baseline.pages[10].id, "KL-011");
  assert.deepEqual(
    baseline.pages.map((target) => target.priority),
    Array.from({ length: 500 }, (_, index) => index + 1),
  );

  const roadmap = cloneRoadmap();
  roadmap.pages[10].priority = 99;
  assertInvalid(roadmap, /priority sequence breaks/);
});

test("rejects moving stable IDs onto different canonical paths", () => {
  const roadmap = cloneRoadmap();
  const first = page(roadmap, "KL-018");
  const second = page(roadmap, "KL-019");
  [first.id, second.id] = [second.id, first.id];
  assertInvalid(roadmap, /stable ID-to-path mapping does not match/);
});

test("the immutable digest covers exact v1 identity and allocation fields", () => {
  assert.deepEqual(IMMUTABLE_ROADMAP_ALLOCATION_FIELDS, [
    "id",
    "path",
    "priority",
    "wave",
    "pillar",
    "pillarRank",
    "parentPath",
    "pageFamily",
  ]);
  assert.deepEqual(baseline.stableIdentityFields, IMMUTABLE_ROADMAP_ALLOCATION_FIELDS);

  for (const field of IMMUTABLE_ROADMAP_ALLOCATION_FIELDS.slice(2)) {
    const reallocated = cloneRoadmap();
    page(reallocated, "KL-012")[field] = `changed-${field}`;
    assert.notEqual(stableIdentityDigest(reallocated.pages), baseline.stableIdentityDigest, field);
  }

  const reordered = cloneRoadmap();
  const leftIndex = reordered.pages.findIndex((target) => target.id === "KL-012");
  const rightIndex = reordered.pages.findIndex((target) => target.id === "KL-014");
  const left = reordered.pages[leftIndex];
  const right = reordered.pages[rightIndex];
  [left.priority, right.priority] = [right.priority, left.priority];
  [reordered.pages[leftIndex], reordered.pages[rightIndex]] = [right, left];
  assertInvalid(reordered, /v1 identity and allocation snapshot/);

  const researchOnly = cloneRoadmap();
  page(researchOnly, "KL-012").prioritySignals.searchDemand = "reviewed-later";
  page(researchOnly, "KL-012").priorityLane = "reviewed-later";
  page(researchOnly, "KL-001").searchBrief.observedIntent = "A later research interpretation.";
  page(researchOnly, "KL-001").intentStatus = "researched";
  assert.equal(stableIdentityDigest(researchOnly.pages), baseline.stableIdentityDigest);
});

test("orders foundations, current-route remediation, high-consequence safety, live routes, then backlog", () => {
  const category = (target) => {
    if (target.pageFamily === "pillar") return 0;
    if (target.routeStatus === "live" && target.claimRiskClass === "R2") return 1;
    if (target.routeStatus === "planned" && target.claimRiskClass === "R3") return 2;
    if (target.routeStatus === "live") return 3;
    return 4;
  };
  const categories = baseline.pages.map(category);
  assert.deepEqual(
    categories,
    [...categories].sort((left, right) => left - right),
  );
  assert.ok(
    baseline.pages
      .filter((target) => target.routeStatus === "live")
      .every((target) => target.wave === 1),
  );
  assert.ok(
    baseline.pages
      .filter((target) => target.claimRiskClass === "R3")
      .every((target) => target.wave === 1),
  );
});

test("rejects a live route or R3 record outside Wave 1", async (t) => {
  for (const id of ["KL-011", "KL-102"]) {
    await t.test(id, () => {
      const roadmap = cloneRoadmap();
      const target = page(roadmap, id);
      target.priority = 101;
      target.wave = 2;
      assertInvalid(roadmap, /priority sequence breaks|must remain in Wave 1/);
    });
  }
});

test("route status exactly mirrors the current registry", () => {
  for (const target of baseline.pages) {
    assert.equal(
      target.routeStatus,
      registryPaths.has(target.path) ? "live" : "planned",
      target.id,
    );
  }

  const driftedRegistry = new Set(registryPaths);
  driftedRegistry.delete(page(baseline, "KL-011").path);
  assertInvalid(cloneRoadmap(), /roadmap marks non-registry routes live/, {
    registryPaths: driftedRegistry,
  });
});

test("requires every post-v1 public route to have explicit cohort ownership", () => {
  assertInvalid(
    cloneRoadmap(),
    /missing from immutable roadmap live routes or approved post-v1 cohorts/,
    { postV1RegistryPaths: new Set() },
  );
});

test("rejects a post-v1 cohort path that duplicates immutable roadmap ownership", () => {
  assertInvalid(
    cloneRoadmap(),
    /post-v1 public registry paths must not overlap immutable roadmap paths/,
    { postV1RegistryPaths: new Set([page(baseline, "KL-011").path]) },
  );
});

test("rejects a post-v1 cohort path that is not currently public", () => {
  assertInvalid(cloneRoadmap(), /post-v1 public registry paths missing from the current registry/, {
    postV1RegistryPaths: new Set(["/guides/not-a-shipped-guide"]),
  });
});

test("library readiness is derived from route and canonical-parent state", () => {
  for (const target of baseline.pages) {
    const parent = baseline.pages.find((candidate) => candidate.path === target.parentPath);
    const expected =
      target.routeStatus === "planned"
        ? "backlog"
        : target.pageFamily !== "pillar" && parent?.routeStatus === "planned"
          ? "blocked_parent"
          : "unassessed";
    assert.equal(target.libraryReadiness, expected, target.id);
  }

  const roadmap = cloneRoadmap();
  page(roadmap, "KL-011").libraryReadiness = "backlog";
  assertInvalid(roadmap, /KL-011 libraryReadiness must be unassessed/);
});

test("intent remains provisional until real validation exists", () => {
  const roadmap = cloneRoadmap();
  page(roadmap, "KL-011").intentStatus = "validated";
  assertInvalid(roadmap, /v1 intentStatus must remain provisional/);
});

test("rejects a dangling, self-referential, or later prerequisite", async (t) => {
  await t.test("dangling", () => {
    const roadmap = cloneRoadmap();
    page(roadmap, "KL-011").prerequisite = "/guides/not-a-real-page";
    assertInvalid(roadmap, /KL-011 prerequisite target does not exist/);
  });
  await t.test("self", () => {
    const roadmap = cloneRoadmap();
    const target = page(roadmap, "KL-011");
    target.prerequisite = target.path;
    assertInvalid(roadmap, /KL-011 prerequisite cannot reference itself/);
  });
  await t.test("later", () => {
    const roadmap = cloneRoadmap();
    const target = page(roadmap, "KL-011");
    const later = baseline.pages.find(
      (candidate) => candidate.pillar === target.pillar && candidate.priority > target.priority,
    );
    target.prerequisite = later.path;
    assertInvalid(
      roadmap,
      /KL-011 prerequisite must have an earlier priority|must be its same-pillar canonical parent/,
    );
  });
});

test("rejects a page detached from its canonical same-pillar parent", () => {
  const roadmap = cloneRoadmap();
  page(roadmap, "KL-011").parentPath = page(roadmap, "KL-002").path;
  assertInvalid(roadmap, /KL-011 parentPath must be its same-pillar canonical parent/);
});

test("rejects canonical pillar drift between site map and roadmap", () => {
  const roadmap = cloneRoadmap();
  const driftedPaths = new Set(siteMapPillarPaths);
  driftedPaths.delete(page(roadmap, "KL-002").path);
  driftedPaths.add("/guides/invented-environment-pillar");
  assertInvalid(roadmap, /site-map canonical pillars must match roadmap exactly/, {
    siteMapPillarPaths: driftedPaths,
  });
});

test("collision declarations are reciprocal and carry an editorial decision", () => {
  const byId = new Map(baseline.pages.map((target) => [target.id, target]));
  for (const target of baseline.pages) {
    for (const peerId of target.prioritySignals.collisionWith) {
      assert.ok(
        byId.get(peerId).prioritySignals.collisionWith.includes(target.id),
        `${target.id} -> ${peerId}`,
      );
    }
    assert.equal(
      target.prioritySignals.collisionWith.length === 0,
      target.collisionResolution === "clear",
      target.id,
    );
  }
});

test("pins the manual EcoWitt and vendor collision decisions", () => {
  const roadmap = cloneRoadmap();
  for (const [left, right, decision] of [
    ["KL-140", "KL-443", "differentiate"],
    ["KL-110", "KL-453", "needs_review"],
    ["KL-120", "KL-463", "needs_review"],
  ]) {
    assert.ok(page(roadmap, left).prioritySignals.collisionWith.includes(right));
    assert.ok(page(roadmap, right).prioritySignals.collisionWith.includes(left));
    assert.equal(page(roadmap, left).collisionResolution, decision);
    assert.equal(page(roadmap, right).collisionResolution, decision);
  }
});

test("the general calibration hub explicitly excludes metric-specific procedures", () => {
  const target = page(baseline, "KL-013");
  assert.equal(target.collisionResolution, "hub_child");
  assert.ok(target.scopeExclusions.length >= 5);
  assert.match(target.scopeExclusions.join(" "), /temperature/i);
  assert.match(target.scopeExclusions.join(" "), /humidity/i);
  assert.match(target.scopeExclusions.join(" "), /leaf-temperature/i);
  assert.match(target.scopeExclusions.join(" "), /pH/i);
  assert.match(target.scopeExclusions.join(" "), /EC/i);
});

test("rejects a one-way collision or a clear decision on a nonempty collision", async (t) => {
  await t.test("one-way", () => {
    const roadmap = cloneRoadmap();
    const left = page(roadmap, "KL-140");
    left.prioritySignals.collisionWith = left.prioritySignals.collisionWith.filter(
      (id) => id !== "KL-443",
    );
    left.prioritySignals.collisionRisk = left.prioritySignals.collisionWith.length
      ? "medium"
      : "low";
    left.collisionResolution = left.prioritySignals.collisionWith.length ? "needs_review" : "clear";
    assertInvalid(
      roadmap,
      /collision declarations must be reciprocal|manual collision KL-140.*KL-443/,
    );
  });
  await t.test("clear", () => {
    const roadmap = cloneRoadmap();
    page(roadmap, "KL-140").collisionResolution = "clear";
    assertInvalid(roadmap, /KL-140 collisionResolution cannot be clear/);
  });
});

test("rejects replacing a reviewed pillar link brief with unrelated copied links", () => {
  const roadmap = cloneRoadmap();
  page(roadmap, "KL-001").relatedPaths = [...page(roadmap, "KL-002").relatedPaths];
  assertInvalid(roadmap, /KL-001 relatedPaths must match its reviewed v1 link brief/);
});

test("all specialized-risk records are safety-only with no product CTA", () => {
  for (const target of baseline.pages.filter((candidate) => candidate.riskDomain !== "standard")) {
    assert.equal(target.primaryCta, null, target.id);
    assert.equal(target.conversionMode, "safety_only", target.id);
    assert.equal(target.conversionPromise, SAFETY_NO_PRODUCT_CTA_PROMISE, target.id);
    assert.match(target.requiredSafetyNextStep, /^Next, /, target.id);
  }
  for (const id of ["KL-327", "KL-406", "KL-464"])
    assert.equal(page(baseline, id).primaryCta, null);
});

test("specialized-risk safety steps are natural and preserve domain evidence boundaries", () => {
  const domainEvidence = {
    pathogen: [
      /isolate/i,
      /contain/i,
      /lineage/i,
      /(accredited laboratory|biosecurity protocol)/i,
      /clearance/i,
    ],
    biosecurity: [
      /isolate/i,
      /contain/i,
      /movement/i,
      /lineage/i,
      /authoritative biosecurity protocol/i,
      /clearance/i,
    ],
    hvac_safety: [
      /controlling code/i,
      /refrigerant/i,
      /electrical/i,
      /qualified HVAC professional/i,
    ],
    co2_safety: [
      /sensor/i,
      /ventilation/i,
      /alarm|interlock/i,
      /controlling code/i,
      /qualified (?:safety|HVAC) professional/i,
    ],
    chemical_safety: [/safety data sheet|SDS/i, /PPE/i, /storage|spill/i, /controlling authority/i],
    electrical: [/load/i, /electrical code/i, /qualified electrician/i],
    pesticide: [
      /product label/i,
      /jurisdictional authority/i,
      /(re-entry|pre-harvest|application|applicator)/i,
    ],
  };

  for (const target of baseline.pages.filter((candidate) => candidate.riskDomain !== "standard")) {
    assert.doesNotMatch(
      target.requiredSafetyNextStep,
      /evidence boundary|hvac sizing questions an indoor|re entry interval evidence|pre harvest interval evidence|topic-specific|separateing/i,
      target.id,
    );
    for (const pattern of domainEvidence[target.riskDomain]) {
      assert.match(target.requiredSafetyNextStep, pattern, target.id);
    }
  }
});

test("rejects product conversion on any specialized-risk page", () => {
  const roadmap = cloneRoadmap();
  const target = page(roadmap, "KL-327");
  target.primaryCta = "/cultivars";
  target.conversionMode = "optional_product_cta";
  target.conversionPromise = CONVERSION_PROMISES["/cultivars"];
  assertInvalid(roadmap, /KL-327 biosecurity pages must not include a product CTA/);
});

test("rejects a specialized-risk record without its required safety next step", () => {
  const roadmap = cloneRoadmap();
  delete page(roadmap, "KL-406").requiredSafetyNextStep;
  assertInvalid(roadmap, /KL-406 pathogen requiredSafetyNextStep must be an operational sentence/);
});

test("rejects keyword-salad safety copy that merely contains required tokens", () => {
  const roadmap = cloneRoadmap();
  page(roadmap, "KL-400").requiredSafetyNextStep =
    "Next, load electrical code qualified electrician.";
  assertInvalid(
    roadmap,
    /KL-400 electrical requiredSafetyNextStep must be an operational sentence/,
  );
});

test("requires domain-specific asset inputs before an R3 brief can become draft", async (t) => {
  for (const id of ["KL-202", "KL-400", "KL-102", "KL-426", "KL-235"]) {
    await t.test(id, () => {
      const roadmap = cloneRoadmap();
      const target = page(roadmap, id);
      target.briefStatus = "draft";
      target.linkBriefStatus = "draft";
      target.searchBriefStatus = "draft";
      target.readerOutcome = `After this page, the reader can complete one documented ${target.title.toLowerCase()} safety decision and identify every missing evidence field.`;
      target.nonProductNextStep = `Next, document the current ${target.title.toLowerCase()} evidence, operating conditions, source records, uncertainty, and authoritative review boundary before any operational change.`;
      target.brief = {
        decision: `Use this page to decide whether ${target.title.toLowerCase()} evidence is complete enough for governed review.`,
        applicability: `Applies when ${target.title.toLowerCase()} requires a documented boundary before any operational change.`,
        informationGain: `Resolves which ${target.title.toLowerCase()} facts are verified and which require authoritative review.`,
        assetMethod: `Build a page-specific ${target.title.toLowerCase()} evidence matrix for governed review`,
        assetInputs: [
          "current observed condition",
          "equipment identity and timestamp",
          "documented operator observation",
        ],
        assetOutput: `A governed evidence matrix for ${target.title.toLowerCase()} review`,
      };
      target.originalAsset = `${target.brief.assetMethod}. Inputs: ${target.brief.assetInputs.join("; ")}. Output: ${target.brief.assetOutput}.`;
      target.relatedPaths = [page(roadmap, "KL-001").path, page(roadmap, "KL-003").path];
      target.searchBrief = structuredClone(page(roadmap, "KL-001").searchBrief);
      target.searchBrief.queryFamily = [`${target.slug} safety`, `${target.slug} evidence`];
      target.searchBrief.competingCanonical.path = null;
      target.searchBrief.competingCanonical.relationship = "none_identified";
      assertInvalid(roadmap, new RegExp(`${id} ${target.riskDomain} draft assetInputs`));
    });
  }
});

test("keeps risk classes and authoritative source roles for consequential pages", () => {
  for (const [id, expected] of [
    ["KL-012", "R2"],
    ["KL-317", "R2"],
    ["KL-327", "R2"],
    ["KL-380", "R3"],
    ["KL-102", "R3"],
    ["KL-426", "R3"],
  ])
    assert.equal(page(baseline, id).claimRiskClass, expected, id);

  const roadmap = cloneRoadmap();
  page(roadmap, "KL-400").sourceRoles = ["method_or_technical_manual", "bounded_field_observation"];
  assertInvalid(roadmap, /KL-400 electrical evidence requires tier A/);
});

test("authored consequential pillar decisions remain at least R2", () => {
  for (const id of ["KL-002", "KL-003", "KL-008", "KL-009"]) {
    assert.equal(page(baseline, id).claimRiskClass, "R2", id);
    assert.equal(page(baseline, id).prioritySignals.safetyImpact, "high", id);
    assert.equal(page(baseline, id).riskDomain, "standard", id);
  }
});

test("rejects fabricated search demand and incomplete priority signals", async (t) => {
  await t.test("demand", () => {
    const roadmap = cloneRoadmap();
    page(roadmap, "KL-011").prioritySignals.searchDemand = 1200;
    assertInvalid(roadmap, /KL-011 prioritySignals\.searchDemand must be unknown/);
  });
  await t.test("signal", () => {
    const roadmap = cloneRoadmap();
    delete page(roadmap, "KL-011").prioritySignals.evidenceFeasibility;
    assertInvalid(roadmap, /KL-011 prioritySignals requires evidenceFeasibility/);
  });
});

test("rejects a conversion promise that does not match the CTA", () => {
  const roadmap = cloneRoadmap();
  const target = page(roadmap, "KL-011");
  target.conversionPromise = CONVERSION_PROMISES["/tools/vpd-calculator"];
  assertInvalid(roadmap, /KL-011 conversionPromise does not match/);
});

test("allows a standard-risk page to omit its optional CTA truthfully", () => {
  const roadmap = cloneRoadmap();
  const target = page(roadmap, "KL-011");
  target.primaryCta = null;
  target.conversionMode = "non_product_only";
  target.conversionPromise = NO_PRODUCT_CTA_PROMISE;
  target.prioritySignals.productRelevance = "low";
  assert.doesNotThrow(() => validateRoadmap(roadmap, { registryPaths }));
});

test("rejects inconsistent wave metadata", () => {
  const roadmap = cloneRoadmap();
  roadmap.waves[0].priorities = "1-99";
  assertInvalid(roadmap, /wave 1 priorities must be 1-100/);
});
