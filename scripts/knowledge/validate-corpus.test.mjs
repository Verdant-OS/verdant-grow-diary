import assert from "node:assert/strict";
import test from "node:test";

import { EDGE_CONTRACTS } from "./validate-schemas.mjs";
import { projectResolvedGuide, sha256Text, validateRepositoryCorpus } from "./validate-corpus.mjs";

const PAGE_PATH = "/guides/alpha";
const COHORT_ID = "PV1-SYNTHETIC-VALIDATOR-PROOF";
const SOURCE_ID = "source:approval-pr-999";
const OTHER_SOURCE_ID = "source:other";
const PAGE_SOURCE_ID = "source:page-evidence";
const SECOND_PAGE_SOURCE_ID = "source:page-evidence-two";
const REVIEWER_ID = "reviewer:cheek";
const APPROVAL_URL = "https://github.com/Verdant-OS/verdant-grow-diary/pull/999";
const PAGE_SOURCE_URL = "https://example.com/evidence";

function clone(value) {
  return structuredClone(value);
}

function routeNode(id, path, label) {
  return {
    id,
    type: "Topic",
    label,
    description: `${label} synthetic validation node.`,
    status: "active",
    route: { path, publicationStatus: "published", indexing: "index" },
  };
}

function registryNode(id, type, label) {
  return {
    id,
    type,
    label,
    description: `${label} synthetic validation node.`,
    status: "active",
  };
}

function edge(id, type, sourceId, sourceType, targetId, targetType, provenance) {
  const contract = EDGE_CONTRACTS[type];
  assert.ok(contract, `test fixture uses known edge type ${type}`);
  return {
    id,
    type,
    sourceId,
    sourceType,
    targetId,
    targetType,
    cardinality: contract.cardinality,
    symmetric: contract.symmetric,
    status: "active",
    effectiveFrom: null,
    effectiveThrough: null,
    provenance,
  };
}

function editorialEdge(id, type, sourceId, targetId) {
  return edge(id, type, sourceId, "Topic", targetId, "Topic", {
    claimIds: [],
    sourceIds: [],
    reviewerIds: [REVIEWER_ID],
    limitations: ["Synthetic validator proof only."],
  });
}

function supportedByEdge(id, claimId, sourceId = SOURCE_ID) {
  return edge(id, "supported_by", claimId, "Claim", sourceId, "EvidenceSource", {
    claimIds: [claimId],
    sourceIds: [sourceId],
    reviewerIds: [],
    limitations: ["Synthetic validator proof only."],
  });
}

function addOtherSource(corpus) {
  corpus.nodes.push(registryNode(OTHER_SOURCE_ID, "EvidenceSource", "Other source"));
  corpus.sources.push({
    nodeId: OTHER_SOURCE_ID,
    url: "https://example.com/other-source",
    evidenceTier: "B",
    accessedOn: "2026-08-26",
    stableIdentifier: "OTHER-1",
    limitations: ["Synthetic validator proof; not approval evidence."],
  });
  corpus.nodes.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  corpus.sources.sort((left, right) =>
    left.nodeId < right.nodeId ? -1 : left.nodeId > right.nodeId ? 1 : 0,
  );
}

function makeFixture() {
  const cohortRationale = "Synthetic approved cohort used only to prove validator behavior.";
  const materialText = "Synthetic evidence-first guidance.";
  const resolvedGuide = {
    slug: "alpha",
    title: "Alpha evidence reference",
    h1: materialText,
    description: "A synthetic guide used only to prove repository-corpus validation.",
    intro: "Compare recorded evidence before changing a plant-care decision.",
    publishedOn: "2026-08-26",
    modifiedOn: "2026-08-26",
    sections: [
      {
        heading: "Compare the evidence",
        body: "Use more than one recorded signal before choosing a next step.",
        links: [
          { label: "Start with the guide library", to: "/guides" },
          { label: "Compare beta evidence", to: "/guides/beta" },
          { label: "Compare gamma evidence", to: "/guides/gamma" },
        ],
      },
    ],
    faq: [
      {
        question: "What should I verify first?",
        answer: "Verify the recorded environment and diary evidence before changing anything.",
      },
    ],
    sources: [
      {
        label: "Synthetic evidence source",
        href: PAGE_SOURCE_URL,
        note: "Supports only the synthetic page claim in this validator proof.",
      },
    ],
    related: ["delta"],
  };
  const projectedGuide = projectResolvedGuide(resolvedGuide);
  const cohortClaimId = "claim:cohort-alpha";
  const pageClaimId = "claim:page-alpha";
  const corpus = {
    version: 1,
    artifactType: "knowledge_repository_corpus",
    artifactScope: "Synthetic validator proof; not publication evidence.",
    rootNodeId: "topic:guides",
    nodes: [
      registryNode(cohortClaimId, "Claim", "Cohort approval claim"),
      registryNode(pageClaimId, "Claim", "Page material claim"),
      registryNode(REVIEWER_ID, "Reviewer", "Final reviewer"),
      registryNode(SOURCE_ID, "EvidenceSource", "Approval source"),
      registryNode(PAGE_SOURCE_ID, "EvidenceSource", "Page evidence source"),
      routeNode("topic:alpha", PAGE_PATH, "Alpha guide"),
      routeNode("topic:beta", "/guides/beta", "Beta guide"),
      routeNode("topic:delta", "/guides/delta", "Delta guide"),
      routeNode("topic:gamma", "/guides/gamma", "Gamma guide"),
      routeNode("topic:guides", "/guides", "Guide library"),
    ],
    sources: [
      {
        nodeId: SOURCE_ID,
        url: APPROVAL_URL,
        evidenceTier: "A",
        accessedOn: "2026-08-26",
        stableIdentifier: APPROVAL_URL,
        limitations: ["Synthetic validator proof; not real editorial evidence."],
      },
      {
        nodeId: PAGE_SOURCE_ID,
        url: PAGE_SOURCE_URL,
        evidenceTier: "B",
        accessedOn: "2026-08-26",
        stableIdentifier: "SYNTHETIC-PAGE-EVIDENCE-1",
        limitations: ["Synthetic validator proof; page evidence only."],
      },
    ],
    cohorts: [
      {
        id: COHORT_ID,
        sourcePullRequest: 999,
        paths: [PAGE_PATH],
        sourceIds: [SOURCE_ID],
        materialClaimIds: [cohortClaimId],
      },
    ],
    claims: [
      {
        nodeId: cohortClaimId,
        scope: { type: "cohort", id: COHORT_ID },
        summary: "The synthetic cohort has a traceable approval rationale.",
        riskClass: "R0",
        riskDomains: ["standard"],
        evidenceState: "supported",
        sourceIds: [SOURCE_ID],
        limitations: ["Synthetic validator proof only."],
        material: [{ key: "cohort.rationale", sha256: sha256Text(cohortRationale) }],
      },
      {
        nodeId: pageClaimId,
        scope: { type: "page", id: "topic:alpha" },
        summary: "The synthetic page material is explicitly claim-covered.",
        riskClass: "R1",
        riskDomains: ["standard"],
        evidenceState: "supported",
        sourceIds: [PAGE_SOURCE_ID],
        limitations: ["Synthetic validator proof only."],
        material: projectedGuide.material.map(({ key, sha256 }) => ({ key, sha256 })),
      },
    ],
    pages: [
      {
        nodeId: "topic:alpha",
        cohortId: COHORT_ID,
        path: PAGE_PATH,
        slug: "alpha",
        pageFamily: "reference",
        riskClass: "R1",
        riskDomains: ["standard"],
        publishedOn: "2026-08-26",
        modifiedOn: "2026-08-26",
        slots: {
          breadcrumb: {
            status: "required",
            edgeIds: ["edge:root-alpha-parent"],
            receiptId: null,
          },
          prerequisite: {
            status: "required",
            edgeIds: ["edge:alpha-guides-requires"],
            receiptId: null,
          },
          contextualLateral: {
            status: "required",
            edgeIds: ["edge:alpha-beta-related", "edge:alpha-gamma-related"],
            receiptId: null,
          },
          nextStep: {
            status: "required",
            edgeIds: ["edge:alpha-delta-next"],
            receiptId: null,
          },
          differential: {
            status: "not_applicable",
            edgeIds: [],
            receiptId: "receipt:alpha-differential",
          },
        },
        claimIds: [pageClaimId],
        linkDecisions: [
          {
            location: "sections.0.links.0",
            path: "/guides",
            edgeId: "edge:alpha-guides-requires",
            slot: "prerequisite",
          },
          {
            location: "sections.0.links.1",
            path: "/guides/beta",
            edgeId: "edge:alpha-beta-related",
            slot: "contextual_lateral",
          },
          {
            location: "sections.0.links.2",
            path: "/guides/gamma",
            edgeId: "edge:alpha-gamma-related",
            slot: "contextual_lateral",
          },
          {
            location: "related.0",
            path: "/guides/delta",
            edgeId: "edge:alpha-delta-next",
            slot: "next_step",
          },
        ],
        sourceDecisions: [
          {
            location: "sources.0",
            href: PAGE_SOURCE_URL,
            sourceId: PAGE_SOURCE_ID,
            claimIds: [pageClaimId],
          },
        ],
      },
    ],
    applicabilityReceipts: [
      {
        id: "receipt:alpha-differential",
        pageId: "topic:alpha",
        slot: "differential",
        reason: "This reference fixture is not a diagnostic page.",
        reviewerId: REVIEWER_ID,
        reviewedOn: "2026-08-26",
      },
    ],
    edges: [
      editorialEdge("edge:alpha-beta-related", "related_to", "topic:alpha", "topic:beta"),
      editorialEdge("edge:alpha-delta-next", "next_step", "topic:alpha", "topic:delta"),
      editorialEdge("edge:alpha-gamma-related", "related_to", "topic:alpha", "topic:gamma"),
      editorialEdge("edge:alpha-guides-requires", "requires", "topic:alpha", "topic:guides"),
      supportedByEdge("edge:cohort-source", cohortClaimId),
      supportedByEdge("edge:page-source", pageClaimId, PAGE_SOURCE_ID),
      editorialEdge("edge:root-alpha-parent", "parent_of", "topic:guides", "topic:alpha"),
    ],
  };
  const cohortRegistry = {
    cohorts: [
      {
        id: COHORT_ID,
        sourcePullRequest: 999,
        rationale: cohortRationale,
        paths: [PAGE_PATH],
      },
    ],
  };
  const registryPaths = [PAGE_PATH, "/guides/beta", "/guides/delta", "/guides/gamma"];
  const publishedPaths = [...registryPaths];
  return { corpus, cohortRegistry, resolvedGuides: [resolvedGuide], registryPaths, publishedPaths };
}

function makeAllRequiredFixture() {
  const fixture = makeFixture();
  const { corpus, publishedPaths, registryPaths, resolvedGuides } = fixture;
  const differentials = [
    ["condition:a", "/guides/condition-a", "Condition A"],
    ["condition:b", "/guides/condition-b", "Condition B"],
    ["condition:c", "/guides/condition-c", "Condition C"],
  ];

  corpus.pages[0].pageFamily = "diagnostic";
  corpus.pages[0].slots.differential = {
    status: "required",
    edgeIds: differentials.map(([id]) => `edge:alpha-${id.split(":")[1]}-differential`),
    receiptId: null,
  };
  corpus.applicabilityReceipts = [];

  for (const [index, [nodeId, path, label]] of differentials.entries()) {
    corpus.nodes.push({ ...routeNode(nodeId, path, label), type: "Condition" });
    corpus.edges.push(
      edge(
        `edge:alpha-${nodeId.split(":")[1]}-differential`,
        "differential_of",
        "topic:alpha",
        "Topic",
        nodeId,
        "Condition",
        {
          claimIds: [],
          sourceIds: [],
          reviewerIds: [REVIEWER_ID],
          limitations: ["Synthetic validator proof only."],
        },
      ),
    );
    resolvedGuides[0].sections[0].links.push({
      label: `Compare ${label}`,
      to: path,
    });
    corpus.pages[0].linkDecisions.push({
      location: `sections.0.links.${index + 3}`,
      path,
      edgeId: `edge:alpha-${nodeId.split(":")[1]}-differential`,
      slot: "differential",
    });
    registryPaths.push(path);
    publishedPaths.push(path);
  }

  const projectedGuide = projectResolvedGuide(resolvedGuides[0]);
  corpus.claims[1].material = projectedGuide.material.map(({ key, sha256 }) => ({ key, sha256 }));
  corpus.nodes.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  corpus.edges.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  return fixture;
}

function refreshPageMaterial(fixture) {
  const projectedGuide = projectResolvedGuide(fixture.resolvedGuides[0]);
  const pageClaim = fixture.corpus.claims.find((claim) => claim.scope.type === "page");
  pageClaim.material = projectedGuide.material.map(({ key, sha256 }) => ({ key, sha256 }));
}

function sortFixture(fixture) {
  fixture.corpus.nodes.sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  fixture.corpus.sources.sort((left, right) =>
    left.nodeId < right.nodeId ? -1 : left.nodeId > right.nodeId ? 1 : 0,
  );
  fixture.corpus.edges.sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  fixture.registryPaths.sort();
  fixture.publishedPaths.sort();
}

function reindexSectionLinkDecisions(fixture) {
  const links = fixture.resolvedGuides[0].sections[0].links;
  for (const decision of fixture.corpus.pages[0].linkDecisions) {
    if (!decision.location.startsWith("sections.0.links.")) continue;
    const index = links.findIndex((link) => link.to === decision.path);
    assert.notEqual(index, -1, `test fixture keeps rendered link ${decision.path}`);
    decision.location = `sections.0.links.${index}`;
  }
}

function addApplicabilityReceipt(fixture, slotName, idSuffix) {
  fixture.corpus.applicabilityReceipts.push({
    id: `receipt:alpha-${idSuffix}`,
    pageId: "topic:alpha",
    slot: slotName,
    reason: `Synthetic coherent ${slotName} waiver used only to prove family requirements.`,
    reviewerId: REVIEWER_ID,
    reviewedOn: "2026-08-26",
  });
}

function coherentlyWaiveContextualLateral(fixture) {
  const page = fixture.corpus.pages[0];
  const selectedEdgeIds = new Set(page.slots.contextualLateral.edgeIds);
  const destinationIds = new Set(
    fixture.corpus.edges
      .filter((candidate) => selectedEdgeIds.has(candidate.id))
      .map((candidate) =>
        candidate.sourceId === page.nodeId ? candidate.targetId : candidate.sourceId,
      ),
  );
  const destinationPaths = new Set(
    fixture.corpus.nodes
      .filter((node) => destinationIds.has(node.id))
      .map((node) => node.route.path),
  );

  page.slots.contextualLateral = {
    status: "not_applicable",
    edgeIds: [],
    receiptId: "receipt:alpha-contextual-lateral",
  };
  page.linkDecisions = page.linkDecisions.filter(
    (decision) => decision.slot !== "contextual_lateral",
  );
  fixture.resolvedGuides[0].sections[0].links = fixture.resolvedGuides[0].sections[0].links.filter(
    (link) => !destinationPaths.has(link.to),
  );
  fixture.corpus.edges = fixture.corpus.edges.filter(
    (candidate) => !selectedEdgeIds.has(candidate.id),
  );
  fixture.corpus.nodes = fixture.corpus.nodes.filter((node) => !destinationIds.has(node.id));
  fixture.registryPaths = fixture.registryPaths.filter((path) => !destinationPaths.has(path));
  fixture.publishedPaths = fixture.publishedPaths.filter((path) => !destinationPaths.has(path));
  addApplicabilityReceipt(fixture, "contextualLateral", "contextual-lateral");
  reindexSectionLinkDecisions(fixture);
  refreshPageMaterial(fixture);
  sortFixture(fixture);
}

function coherentlyWaiveNextStep(fixture) {
  const page = fixture.corpus.pages[0];
  page.slots.nextStep = {
    status: "not_applicable",
    edgeIds: [],
    receiptId: "receipt:alpha-next-step",
  };
  page.linkDecisions = page.linkDecisions.filter((decision) => decision.slot !== "next_step");
  fixture.corpus.edges = fixture.corpus.edges.filter(
    (candidate) => candidate.id !== "edge:alpha-delta-next",
  );
  fixture.corpus.nodes = fixture.corpus.nodes.filter((node) => node.id !== "topic:delta");
  fixture.registryPaths = fixture.registryPaths.filter((path) => path !== "/guides/delta");
  fixture.publishedPaths = fixture.publishedPaths.filter((path) => path !== "/guides/delta");

  fixture.corpus.nodes.push(routeNode("topic:epsilon", "/guides/epsilon", "Epsilon guide"));
  fixture.corpus.edges.push(
    editorialEdge("edge:alpha-epsilon-related", "related_to", "topic:alpha", "topic:epsilon"),
  );
  fixture.resolvedGuides[0].related = ["epsilon"];
  page.linkDecisions.push({
    location: "related.0",
    path: "/guides/epsilon",
    edgeId: "edge:alpha-epsilon-related",
    slot: "supplemental",
  });
  fixture.registryPaths.push("/guides/epsilon");
  fixture.publishedPaths.push("/guides/epsilon");
  addApplicabilityReceipt(fixture, "nextStep", "next-step");
  refreshPageMaterial(fixture);
  sortFixture(fixture);
}

function addSecondPageEvidenceSource(fixture) {
  const pageClaim = fixture.corpus.claims.find((claim) => claim.scope.type === "page");
  fixture.resolvedGuides[0].sources.push({
    label: "Second synthetic evidence source",
    href: "https://example.com/evidence-two",
    note: "Supports the same synthetic page claim for ordered-receipt proofs.",
  });
  fixture.corpus.nodes.push(
    registryNode(SECOND_PAGE_SOURCE_ID, "EvidenceSource", "Second page evidence source"),
  );
  fixture.corpus.sources.push({
    nodeId: SECOND_PAGE_SOURCE_ID,
    url: "https://example.com/evidence-two",
    evidenceTier: "B",
    accessedOn: "2026-08-26",
    stableIdentifier: "SYNTHETIC-PAGE-EVIDENCE-2",
    limitations: ["Synthetic validator proof; second page evidence only."],
  });
  pageClaim.sourceIds.push(SECOND_PAGE_SOURCE_ID);
  pageClaim.sourceIds.sort();
  fixture.corpus.pages[0].sourceDecisions.push({
    location: "sources.1",
    href: "https://example.com/evidence-two",
    sourceId: SECOND_PAGE_SOURCE_ID,
    claimIds: [pageClaim.nodeId],
  });
  fixture.corpus.edges.push(
    supportedByEdge("edge:page-source-two", pageClaim.nodeId, SECOND_PAGE_SOURCE_ID),
  );
  refreshPageMaterial(fixture);
  sortFixture(fixture);
}

function assertInvalid(mutator, expected) {
  const fixture = makeFixture();
  mutator(fixture);
  assert.throws(() => validateRepositoryCorpus(fixture), expected);
}

test("accepts one connected nonempty synthetic corpus", () => {
  const result = validateRepositoryCorpus(makeFixture());
  assert.deepEqual(result, {
    status: "pass",
    evidenceScope: "semantic_contract_only",
    publicationStatus: "NOT_MEASURED",
    renderedCrawlStatus: "NOT_MEASURED",
    cohortCount: 1,
    pageCount: 1,
    nodeCount: 10,
    edgeCount: 7,
    claimCount: 2,
    sourceCount: 2,
    materialProseCount: 13,
    renderedInternalLinkCount: 4,
    renderedExternalSourceCount: 1,
    maximumRootDepth: 1,
  });
});

test("projects every dynamic visible guide field into deterministic material receipts", () => {
  const projected = projectResolvedGuide({
    slug: "projection-proof",
    title: "Projection title",
    h1: "Projection heading",
    description: "Projection description",
    intro: "Projection introduction",
    publishedOn: "2026-08-26",
    modifiedOn: "2026-08-26",
    cta: {
      label: "Open the checklist",
      to: "/guides/delta",
      heading: "Record before changing",
      description: "Preserve the baseline first.",
      prompts: ["Environment", "Watering"],
    },
    sections: [
      {
        heading: "Compare evidence",
        body: "Use more than one signal.",
        links: [{ label: "Read beta", to: "/guides/beta" }],
      },
    ],
    faq: [{ question: "What should I compare?", answer: "Compare recorded evidence." }],
    sources: [
      {
        label: "Primary source",
        href: "https://example.com/source",
        note: "Bound to this narrow claim only.",
      },
    ],
    evidenceTable: {
      heading: "Evidence states",
      description: "Distinguish usable from untrusted inputs.",
      ariaLabel: "Evidence-state comparison",
      rows: [
        {
          evidence: "Recorded observation",
          usable: "Timestamped entry",
          conditional: "Needs context",
          untrusted: "Guessed value",
        },
      ],
    },
    referenceTable: {
      caption: "Symptom evidence lookup",
      rows: [
        {
          symptomId: "yellowing",
          visibleSign: "Yellow leaf tissue",
          compareFirst: "Water and root-zone notes",
          whatToLogNext: "Leaf position and timing",
          doNotAssume: "A single nutrient cause",
        },
      ],
    },
    related: ["delta"],
  });

  assert.deepEqual(
    projected.material.map(({ key }) => key),
    [
      "title",
      "h1",
      "description",
      "intro",
      "cta.label",
      "cta.heading",
      "cta.description",
      "cta.prompts.0",
      "cta.prompts.1",
      "sections.0.heading",
      "sections.0.body",
      "sections.0.links.0.label",
      "faq.0.question",
      "faq.0.answer",
      "sources.0.label",
      "sources.0.note",
      "evidenceTable.heading",
      "evidenceTable.description",
      "evidenceTable.ariaLabel",
      "evidenceTable.rows.0.evidence",
      "evidenceTable.rows.0.usable",
      "evidenceTable.rows.0.conditional",
      "evidenceTable.rows.0.untrusted",
      "referenceTable.caption",
      "referenceTable.rows.0.visibleSign",
      "referenceTable.rows.0.compareFirst",
      "referenceTable.rows.0.whatToLogNext",
      "referenceTable.rows.0.doNotAssume",
    ],
  );
  assert.deepEqual(projected.internalLinks, [
    { location: "cta", path: "/guides/delta" },
    { location: "sections.0.links.0", path: "/guides/beta" },
    { location: "related.0", path: "/guides/delta" },
  ]);
  assert.deepEqual(projected.externalSources, [
    { location: "sources.0", href: "https://example.com/source" },
  ]);
  assert.equal(projected.material[0].sha256, sha256Text("Projection title"));
});

test("rejects an empty or partial page corpus", () => {
  assertInvalid(({ corpus }) => {
    corpus.pages = [];
  }, /pages must be an array with at least 1/);
  assertInvalid(({ corpus }) => {
    corpus.cohorts[0].paths = [];
  }, /cover every approved cohort path/);
});

test("rejects unapproved, unsorted, and stale cohort declarations", () => {
  assertInvalid(({ corpus }) => {
    corpus.cohorts[0].sourcePullRequest = 998;
  }, /source pull request/);
  assertInvalid(({ corpus, cohortRegistry }) => {
    corpus.cohorts[0].paths = ["/guides/beta", PAGE_PATH];
    cohortRegistry.cohorts[0].paths = [PAGE_PATH, "/guides/beta"];
  }, /paths must be sorted/);
  assertInvalid(({ corpus }) => {
    corpus.cohorts[0].sourceIds.push(SOURCE_ID);
  }, /sourceIds must be unique/);
  assertInvalid(({ corpus }) => {
    corpus.sources[0].url = "https://github.com/Verdant-OS/verdant-grow-diary/pull/998";
  }, /requires exactly one globally exact approval source/);
  assertInvalid(({ corpus }) => {
    addOtherSource(corpus);
    corpus.claims[0].sourceIds = [OTHER_SOURCE_ID];
    const edge = corpus.edges.find((candidate) => candidate.id === "edge:cohort-source");
    edge.targetId = OTHER_SOURCE_ID;
    edge.provenance.sourceIds = [OTHER_SOURCE_ID];
  }, /material claim .* must use its exact approving PR source/);
});

test("rejects alternate approval identities and globally duplicated source identities", () => {
  for (const url of [
    `${APPROVAL_URL}/`,
    `${APPROVAL_URL}?review=1`,
    `${APPROVAL_URL}#approval`,
    "https://github.com:8443/Verdant-OS/verdant-grow-diary/pull/999",
    "https://github.com/Other-Org/verdant-grow-diary/pull/999",
    "https://github.com/Verdant-OS/other-repo/pull/999",
    "https://github.com/Verdant-OS/verdant-grow-diary/pull/%39%39%39",
  ]) {
    assertInvalid(({ corpus }) => {
      corpus.sources[0].url = url;
    }, /requires exactly one globally exact approval source/);
  }
  assertInvalid(({ corpus }) => {
    corpus.sources[0].url = APPROVAL_URL.replace("https:", "http:");
  }, /must use HTTPS/);
  assertInvalid(({ corpus }) => {
    corpus.sources[0].url = APPROVAL_URL.replace("https://", "https://user:secret@");
  }, /must not contain credentials/);
  assertInvalid(({ corpus }) => {
    corpus.sources[0].stableIdentifier = "PR-999";
  }, /must use stableIdentifier https:\/\/github\.com\/Verdant-OS/);
  assertInvalid(({ corpus }) => {
    addOtherSource(corpus);
    corpus.sources.find((source) => source.nodeId === OTHER_SOURCE_ID).url = APPROVAL_URL;
  }, /repeat canonical URL/);
  assertInvalid(({ corpus }) => {
    addOtherSource(corpus);
    corpus.sources.find((source) => source.nodeId === OTHER_SOURCE_ID).stableIdentifier =
      APPROVAL_URL;
  }, /repeat stableIdentifier/);
  assertInvalid(({ corpus }) => {
    addOtherSource(corpus);
    corpus.cohorts[0].sourceIds.push(OTHER_SOURCE_ID);
  }, /sourceIds must exactly equal its material-claim sources; extra: source:other/);
});

test("rejects nondeterministic registries", () => {
  assertInvalid(({ corpus }) => {
    [corpus.nodes[0], corpus.nodes[1]] = [corpus.nodes[1], corpus.nodes[0]];
  }, /node IDs must be sorted/);
  assertInvalid(({ corpus }) => {
    [corpus.edges[0], corpus.edges[1]] = [corpus.edges[1], corpus.edges[0]];
  }, /edge IDs must be sorted/);
});

test("rejects duplicate identities", () => {
  assertInvalid(({ corpus }) => {
    corpus.nodes.splice(1, 0, clone(corpus.nodes[0]));
  }, /repeats node/);
  assertInvalid(({ corpus }) => {
    corpus.claims.splice(1, 0, clone(corpus.claims[0]));
  }, /repeats claim/);
  assertInvalid(({ corpus }) => {
    corpus.edges.splice(1, 0, clone(corpus.edges[0]));
  }, /repeats edge/);
});

test("rejects dangling or type-confused graph endpoints", () => {
  assertInvalid(({ corpus }) => {
    corpus.edges[0].targetId = "topic:missing";
  }, /missing target node/);
  assertInvalid(({ corpus }) => {
    corpus.edges[0].targetType = "Condition";
  }, /endpoint type does not match/);
  assertInvalid(({ corpus }) => {
    corpus.nodes.find((node) => node.id === "topic:beta").id = "claim:beta";
  }, /ID prefix does not match declared type Topic/);
});

test("rejects reversed symmetric edges and invalid effective dates", () => {
  assertInvalid(({ corpus }) => {
    const relation = corpus.edges[0];
    [relation.sourceId, relation.targetId] = [relation.targetId, relation.sourceId];
  }, /smaller node first/);
  assertInvalid(({ corpus }) => {
    corpus.edges[1].effectiveFrom = "2026-08-27";
    corpus.edges[1].effectiveThrough = "2026-08-26";
  }, /effectiveThrough precedes/);
});

test("rejects a parent cycle and an orphan page", () => {
  assertInvalid(({ corpus }) => {
    corpus.edges.splice(
      4,
      0,
      editorialEdge("edge:alpha-root-parent", "parent_of", "topic:alpha", "topic:guides"),
    );
  }, /parent_of graph contains a cycle/);
  assertInvalid(({ corpus }) => {
    corpus.edges.pop();
  }, /orphaned from the library root/);
});

test("rejects missing, empty, or contradictory slots", () => {
  assertInvalid(({ corpus }) => {
    corpus.pages[0].slots.nextStep.edgeIds = [];
  }, /required slot nextStep is empty/);
  assertInvalid(({ corpus }) => {
    corpus.pages[0].slots.differential.edgeIds = ["edge:alpha-delta-next"];
  }, /N\/A slot differential cannot select edges/);
  assertInvalid(({ corpus }) => {
    corpus.pages[0].slots.contextualLateral.edgeIds.pop();
  }, /requires exactly two contextual-lateral/);
});

test("keeps the foundation slot model inside its reviewed page families", () => {
  assertInvalid(({ corpus }) => {
    corpus.pages[0].pageFamily = "pillar";
  }, /outside the foundation slot model/);
  assertInvalid(({ corpus }) => {
    corpus.pages[0].pageFamily = "diagnostic";
  }, /diagnostic page .* mandatory slot differential/);
  assertInvalid(({ corpus }) => {
    corpus.pages[0].slots.productAction = {
      status: "not_applicable",
      edgeIds: [],
      receiptId: "receipt:product-action",
    };
  }, /declares unsupported foundation slots: productAction/);
});

test("rejects coherent waivers of mandatory family slots", () => {
  for (const [family, makeFamilyFixture] of [
    ["reference", makeFixture],
    ["diagnostic", makeAllRequiredFixture],
  ]) {
    const contextualFixture = makeFamilyFixture();
    coherentlyWaiveContextualLateral(contextualFixture);
    assert.throws(
      () => validateRepositoryCorpus(contextualFixture),
      new RegExp(`${family} page .* mandatory slot contextualLateral`),
    );

    const nextStepFixture = makeFamilyFixture();
    coherentlyWaiveNextStep(nextStepFixture);
    assert.throws(
      () => validateRepositoryCorpus(nextStepFixture),
      new RegExp(`${family} page .* mandatory slot nextStep`),
    );
  }
});

test("rejects slot edges with the wrong relationship or direction", () => {
  assertInvalid(({ corpus }) => {
    corpus.pages[0].slots.nextStep.edgeIds = ["edge:alpha-beta-related"];
  }, /uses ineligible edge/);
  assertInvalid(({ corpus }) => {
    corpus.edges.splice(
      4,
      0,
      editorialEdge("edge:beta-gamma-parent", "parent_of", "topic:beta", "topic:gamma"),
    );
    corpus.pages[0].slots.breadcrumb.edgeIds = ["edge:beta-gamma-parent"];
  }, /breadcrumb edge .* must target the page/);
});

test("rejects destination reuse across mandatory slots", () => {
  assertInvalid(({ corpus }) => {
    corpus.edges[1] = editorialEdge(
      "edge:alpha-delta-next",
      "next_step",
      "topic:alpha",
      "topic:beta",
    );
  }, /reuses topic:beta across mandatory slots/);
});

test("rejects missing, stale, duplicate, or unknown material-claim coverage", () => {
  assertInvalid(({ corpus }) => {
    corpus.pages[0].claimIds = [];
  }, /requires material claims/);
  assertInvalid(({ corpus }) => {
    corpus.claims[1].material[0].sha256 = "0".repeat(64);
  }, /changed without claim review/);
  assertInvalid(({ resolvedGuides }) => {
    resolvedGuides[0].h1 = "Changed raw guide text with an unchanged reviewed receipt.";
  }, /changed without claim review/);
  assertInvalid(({ corpus }) => {
    corpus.claims[1].material.push(clone(corpus.claims[1].material[0]));
  }, /material keys must be unique/);
  assertInvalid(({ corpus }) => {
    corpus.claims[1].material[0].key = "unknown";
  }, /covers unknown material/);
});

test("rejects claim-risk understatements", () => {
  assertInvalid(({ corpus }) => {
    corpus.pages[0].riskClass = "R0";
  }, /highest material-claim risk/);
  assertInvalid(({ corpus }) => {
    corpus.claims[1].riskDomains.push("pathogen");
  }, /omits claim risk domains/);
});

test("rejects broken claim/source reciprocity and unused sources", () => {
  assertInvalid(({ corpus }) => {
    corpus.edges.splice(4, 1);
  }, /supported_by edge/);
  assertInvalid(({ corpus }) => {
    corpus.claims[1].evidenceState = "unknown";
    corpus.claims[1].sourceIds = [];
  }, /undeclared supported_by edges/);
  assertInvalid(({ corpus }) => {
    corpus.edges.find((edge) => edge.id === "edge:cohort-source").provenance.claimIds = [
      "claim:page-alpha",
    ];
  }, /provenance must exactly match its claim\/source endpoints/);
  assertInvalid(({ corpus }) => {
    addOtherSource(corpus);
    corpus.edges.find((edge) => edge.id === "edge:page-source").provenance.sourceIds = [
      OTHER_SOURCE_ID,
    ];
  }, /provenance must exactly match its claim\/source endpoints/);
});

test("accepts a non-vacuous ordered rendered-source witness", () => {
  const fixture = makeFixture();
  addSecondPageEvidenceSource(fixture);
  const result = validateRepositoryCorpus(fixture);
  assert.equal(result.status, "pass");
  assert.equal(result.renderedExternalSourceCount, 2);
});

test("rejects rendered-source and source-decision divergence", () => {
  for (const rawHref of [
    "https://EXAMPLE.com/evidence",
    "https://example.com:443/evidence",
    "https://example.com/a/../evidence",
  ]) {
    assertInvalid(({ resolvedGuides }) => {
      resolvedGuides[0].sources[0].href = rawHref;
    }, /href must use its canonical HTTPS serialization/);
  }
  assertInvalid(({ corpus, resolvedGuides }) => {
    resolvedGuides[0].sources[0].href = "https://example.com";
    corpus.pages[0].sourceDecisions[0].href = "https://example.com/";
    corpus.sources.find((source) => source.nodeId === PAGE_SOURCE_ID).url = "https://example.com/";
  }, /href must use its canonical HTTPS serialization/);
  assertInvalid(({ resolvedGuides }) => {
    resolvedGuides[0].sources[0].href = "https://example.com/changed-render";
  }, /must exactly match rendered source/);
  assertInvalid(({ corpus }) => {
    corpus.pages[0].sourceDecisions[0].href = "https://example.com/changed-decision";
  }, /must exactly match rendered source/);
  assertInvalid(({ corpus, resolvedGuides }) => {
    resolvedGuides[0].sources[0].href = "https://example.com/changed-together";
    corpus.pages[0].sourceDecisions[0].href = "https://example.com/changed-together";
  }, /href must equal source .* URL/);
  assertInvalid(({ corpus }) => {
    corpus.pages[0].sourceDecisions = [];
  }, /must exactly cover 1 rendered source/);
  assertInvalid(({ corpus }) => {
    corpus.pages[0].sourceDecisions[0].location = "sources.1";
  }, /must exactly match rendered source/);
  assertInvalid(({ corpus }) => {
    corpus.pages[0].sourceDecisions[0].sourceId = "source:missing";
  }, /references missing EvidenceSource source:missing/);
});

test("rejects rendered-source claim/source witness drift", () => {
  assertInvalid(({ corpus }) => {
    corpus.pages[0].sourceDecisions[0].claimIds = [];
  }, /requires at least one claim/);
  assertInvalid(({ corpus }) => {
    corpus.pages[0].sourceDecisions[0].claimIds = ["claim:page-alpha", "claim:page-alpha"];
  }, /claimIds must be unique/);
  assertInvalid(({ corpus }) => {
    corpus.pages[0].sourceDecisions[0].claimIds = ["claim:page-alpha", "claim:cohort-alpha"];
  }, /claimIds must be sorted/);
  assertInvalid(({ corpus }) => {
    corpus.pages[0].sourceDecisions[0].claimIds = ["claim:cohort-alpha"];
  }, /references foreign claim claim:cohort-alpha/);
  assertInvalid(({ corpus, resolvedGuides }) => {
    resolvedGuides[0].sources[0].href = APPROVAL_URL;
    corpus.pages[0].sourceDecisions[0].href = APPROVAL_URL;
    corpus.pages[0].sourceDecisions[0].sourceId = SOURCE_ID;
  }, /invents claim\/source pair claim:page-alpha\|source:approval-pr-999/);
  assertInvalid((fixture) => {
    addSecondPageEvidenceSource(fixture);
    fixture.corpus.pages[0].sourceDecisions.pop();
  }, /must exactly cover 2 rendered source/);
  assertInvalid((fixture) => {
    fixture.corpus.edges.push(
      supportedByEdge("edge:page-source-duplicate", "claim:page-alpha", PAGE_SOURCE_ID),
    );
    sortFixture(fixture);
  }, /requires exactly one supported_by edge/);
});

test("rejects reordered or duplicated rendered-source identities", () => {
  assertInvalid((fixture) => {
    addSecondPageEvidenceSource(fixture);
    fixture.corpus.pages[0].sourceDecisions.reverse();
  }, /must exactly match rendered source/);
  assertInvalid((fixture) => {
    addSecondPageEvidenceSource(fixture);
    fixture.corpus.pages[0].sourceDecisions[1].location = "sources.0";
  }, /source-decision locations must be unique/);
  assertInvalid((fixture) => {
    addSecondPageEvidenceSource(fixture);
    fixture.corpus.pages[0].sourceDecisions[1].sourceId = PAGE_SOURCE_ID;
  }, /source-decision source IDs must be unique/);
  assertInvalid((fixture) => {
    addSecondPageEvidenceSource(fixture);
    fixture.resolvedGuides[0].sources[1].href = PAGE_SOURCE_URL;
  }, /rendered external-source URLs must be unique/);
});

test("rejects missing or unreviewed applicability receipts", () => {
  assertInvalid(({ corpus }) => {
    corpus.applicabilityReceipts.shift();
  }, /references missing receipt/);
  assertInvalid(({ corpus }) => {
    corpus.applicabilityReceipts[0].reviewerId = "reviewer:missing";
  }, /requires a Reviewer/);
});

test("rejects rendered links without exact decisions and edges", () => {
  assertInvalid(({ corpus }) => {
    corpus.pages[0].linkDecisions.pop();
  }, /ungoverned rendered links/);
  assertInvalid(({ corpus }) => {
    corpus.pages[0].linkDecisions[0].path = "/guides/delta";
  }, /is not rendered/);
  assertInvalid(({ corpus }) => {
    corpus.pages[0].linkDecisions[0].edgeId = "edge:alpha-gamma-related";
  }, /is not backed by edge/);
  assertInvalid(({ corpus }) => {
    corpus.pages[0].linkDecisions.forEach((decision) => {
      decision.slot = "supplemental";
    });
  }, /supplemental link .* cannot substitute for selected/);
});

test("accepts an all-required corpus with zero applicability receipts", () => {
  const fixture = makeAllRequiredFixture();
  const result = validateRepositoryCorpus(fixture);
  assert.equal(result.status, "pass");
  assert.equal(fixture.corpus.applicabilityReceipts.length, 0);
  assert.equal(result.renderedInternalLinkCount, 7);
});

test("rejects related-module order drift and duplicate destinations", () => {
  assertInvalid(({ resolvedGuides }) => {
    resolvedGuides[0].related = ["beta"];
  }, /is not rendered|related-module ordering/);
  assertInvalid(({ resolvedGuides }) => {
    resolvedGuides[0].related = ["delta", "delta"];
  }, /related destinations/);
});

test("rejects route nodes that are absent, unapproved, or unused", () => {
  assertInvalid(({ corpus }) => {
    corpus.nodes.find((node) => node.id === "topic:alpha").route.indexing = "noindex";
  }, /published and indexable/);
  assertInvalid(({ corpus, publishedPaths }) => {
    publishedPaths.splice(publishedPaths.indexOf(PAGE_PATH), 1);
  }, /not an approved published path/);
  assertInvalid(({ corpus, registryPaths, publishedPaths }) => {
    corpus.nodes.push(routeNode("topic:epsilon", "/guides/epsilon", "Epsilon guide"));
    corpus.nodes.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    registryPaths.push("/guides/epsilon");
    publishedPaths.push("/guides/epsilon");
  }, /unused route nodes/);
});

test("rejects empty registry evidence and registry/published divergence", () => {
  assertInvalid((fixture) => {
    fixture.registryPaths = [];
  }, /requires nonempty current and published/);
  assertInvalid(({ registryPaths }) => {
    registryPaths.splice(registryPaths.indexOf(PAGE_PATH), 1);
  }, /published path .* absent from the current registry/);
});
