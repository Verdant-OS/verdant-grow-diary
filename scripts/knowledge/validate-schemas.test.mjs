import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  compileSchemaDocuments,
  deriveCultivarHealthDisposition,
  EDGE_CONTRACTS,
  loadSchemaDocuments,
  SENSOR_METRIC_CONTRACTS,
  validateGraphEdgeSemantics,
  validateCultivarHealthSemantics,
  validateCultivarHistoryAppendOnly,
  validatePageIdentitySemantics,
  validateSensorPageSemantics,
  validateSensorVerificationHistoryAppendOnly,
  validateSchemaDocuments,
} from "./validate-schemas.mjs";

const CANONICAL_SCHEMA_BASE = "https://verdantgrowdiary.com/schemas/knowledge/";
const BASELINE_DOCUMENTS = loadSchemaDocuments();
const BASELINE_COMPILED = compileSchemaDocuments(BASELINE_DOCUMENTS);

function getValidator(schemaPath) {
  const validator = BASELINE_COMPILED.ajv.getSchema(`${CANONICAL_SCHEMA_BASE}${schemaPath}`);
  assert.equal(typeof validator, "function", `missing compiled validator ${schemaPath}`);
  return validator;
}

function edgeBranch(common, edgeType) {
  const branch = common.$defs.graphEdge.oneOf.find(
    (candidate) => candidate.properties?.type?.const === edgeType,
  );
  assert.ok(branch, `missing graph-edge branch ${edgeType}`);
  return branch;
}

function activeEdgeFixture(edgeType) {
  const contract = EDGE_CONTRACTS[edgeType];
  const empirical = contract.provenanceClass === "empirical";
  return {
    id: `edge:test:${edgeType}:1`,
    type: edgeType,
    sourceId: "topic:source",
    sourceType: contract.sourceTypes[0],
    targetId: "topic:target",
    targetType: contract.targetTypes[0],
    cardinality: contract.cardinality,
    symmetric: contract.symmetric,
    status: "active",
    effectiveFrom: null,
    effectiveThrough: null,
    provenance: {
      claimIds: empirical ? ["claim:test:1"] : [],
      sourceIds: empirical ? ["source:test:1"] : [],
      reviewerIds: empirical ? [] : ["reviewer:test:1"],
      limitations: ["Bounded test evidence."],
    },
  };
}

function freshDocuments() {
  return new Map(
    [...loadSchemaDocuments()].map(([fileName, schema]) => [fileName, structuredClone(schema)]),
  );
}

function markdownTableRows(section) {
  return section
    .split(/\r?\n/)
    .filter((line) => /^\| `[^`]+`\s+\|/.test(line))
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
}

function sensorEdge(type, sourceId, sourceType, targetId, targetType) {
  return {
    type,
    sourceId,
    sourceType,
    targetId,
    targetType,
    status: "active",
  };
}

function personRef(nodeId) {
  return {
    nodeId,
    profileSubjectId: nodeId,
    displayName: "Named reviewer",
    roleSummary: "Knowledge Library reviewer",
    experienceStatement: "Reviews evidence within the declared scope of competence.",
    credentials: [],
    profilePath: null,
  };
}

function pageIdentityFixture() {
  const pageId = "topic:test-page";
  const parentId = "topic:test-pillar";
  const authorId = "author:test-author";
  const reviewerId = "reviewer:test-reviewer";
  return {
    slug: "test-page",
    identity: { equipmentNodeId: pageId },
    pageManifest: {
      metadata: {
        id: pageId,
        slug: "test-page",
        path: "/guides/test-page",
      },
      graph: {
        node: { id: pageId, type: "Topic" },
        parentId,
        edges: [
          sensorEdge("authored_by", pageId, "Topic", authorId, "Author"),
          sensorEdge("reviewed_by", pageId, "Topic", reviewerId, "Reviewer"),
        ],
      },
      seo: {
        canonicalPath: "/guides/test-page",
        breadcrumbNodeIds: ["topic:guides-root", parentId, pageId],
      },
    },
    editorial: {
      author: personRef(authorId),
      signoffs: {
        evidence: { reviewer: personRef(reviewerId) },
        cultivation: null,
        productTruth: null,
        copyAccessibility: null,
        seoTechnical: null,
        safety: null,
      },
    },
  };
}

function directSensorMeasurement(metricKey) {
  const contract = SENSOR_METRIC_CONTRACTS[metricKey];
  return {
    metricKey,
    metricId: contract.metricId,
    unitId: contract.unitId,
    directOrDerived: "direct",
    vpdBasis: "not_applicable",
    authorityStatus: "authoritative",
    resolution: "Documented resolution",
    accuracy: "Verified against the current reference",
    operatingRange: "Documented operating range",
    derivation: null,
  };
}

function derivationInput(metricKey, capturedAt = "2026-08-01T12:04:00Z") {
  const contract = SENSOR_METRIC_CONTRACTS[metricKey];
  return {
    metricId: contract.metricId,
    unitId: contract.unitId,
    observationId: `observation:sensor:${metricKey}:1`,
    capturedAt,
    source: "live",
    qualityState: "ok",
    freshnessAgeSeconds: 60,
    visibility: "page_measurement",
  };
}

function derivedVpdMeasurement(metricKey) {
  const contract = SENSOR_METRIC_CONTRACTS[metricKey];
  const leaf = metricKey === "leaf_vpd_kpa";
  return {
    metricKey,
    metricId: contract.metricId,
    unitId: contract.unitId,
    directOrDerived: "derived",
    vpdBasis: leaf ? "leaf" : "air",
    authorityStatus: "authoritative",
    resolution: null,
    accuracy: "Bounded by input and method uncertainty",
    operatingRange: "Valid only inside the verified input ranges",
    derivation: {
      methodId: leaf ? "method:leaf-vpd:v1" : "method:air-vpd:v1",
      formulaVersion: "1.0.0",
      formulaExpression: leaf
        ? "svp(leaf temperature) - avp(air temperature, relative humidity)"
        : "svp(air temperature) - avp(air temperature, relative humidity)",
      computedAt: "2026-08-01T12:05:00Z",
      maxInputAgeSeconds: 120,
      maxTimestampSkewSeconds: 15,
      inputs: [
        derivationInput("air_temp_c"),
        derivationInput("humidity_pct"),
        ...(leaf ? [derivationInput("leaf_temp_c")] : []),
      ],
      inputQualityRequirements: [
        "Every input is quality-ok.",
        "Every input is inside the freshness window.",
      ],
      uncertaintyStatement: "Uncertainty combines the verified input and method limits.",
      vendorMethodSourceId: null,
      limitations: ["Valid only for the recorded operating conditions."],
    },
  };
}

function sensorSemanticFixture() {
  const sensorId = "sensor:reference:canopy-1";
  const integrationId = "integration:reference-read-only";
  const measurements = [
    directSensorMeasurement("air_temp_c"),
    directSensorMeasurement("humidity_pct"),
    directSensorMeasurement("leaf_temp_c"),
    derivedVpdMeasurement("vpd_kpa"),
    derivedVpdMeasurement("leaf_vpd_kpa"),
  ];
  const edges = [];
  for (const measurement of measurements) {
    edges.push(sensorEdge("uses_unit", measurement.metricId, "Metric", measurement.unitId, "Unit"));
    if (measurement.directOrDerived === "direct") {
      edges.push(sensorEdge("measured_by", measurement.metricId, "Metric", sensorId, "Sensor"));
    } else {
      edges.push(
        sensorEdge(
          "uses_method",
          measurement.metricId,
          "Metric",
          measurement.derivation.methodId,
          "Method",
        ),
      );
      for (const input of measurement.derivation.inputs) {
        edges.push(
          sensorEdge("derived_from", measurement.metricId, "Metric", input.metricId, "Metric"),
        );
      }
    }
  }
  edges.push(
    sensorEdge("has_capability", sensorId, "Sensor", "capability:native-sensing", "Capability"),
    sensorEdge("integrates_with", sensorId, "Sensor", integrationId, "Integration"),
    sensorEdge(
      "exposes_capability",
      integrationId,
      "Integration",
      "capability:verdant-read-only-ingest",
      "Capability",
    ),
  );

  const verificationId = "verification:sensor:2026-08-01";
  return {
    deviceIdentity: {
      sensorNodeId: sensorId,
      manualSourceId: "source:device-manual:1",
    },
    measurements,
    pageManifest: {
      graph: {
        node: { id: sensorId },
        edges,
      },
    },
    calibration: {
      verificationStatus: "current",
      currentVerificationId: verificationId,
      verificationHistory: [
        {
          verificationId,
          verifiedAt: "2026-08-01T11:00:00Z",
          nextDueOn: "2027-08-01",
          methodId: "method:sensor-comparison:v1",
          referenceInstrumentId: "sensor:reference:traceable-1",
          results: [
            {
              metricId: "metric:air-temperature",
              unitId: "unit:celsius",
              disposition: "pass",
            },
            {
              metricId: "metric:relative-humidity",
              unitId: "unit:percent-relative-humidity",
              disposition: "pass",
            },
            {
              metricId: "metric:leaf-temperature",
              unitId: "unit:celsius",
              disposition: "pass",
            },
          ],
          sourceIds: ["source:calibration-report:1"],
          reviewerId: "reviewer:metrology:1",
          supersedesVerificationId: null,
          limitations: ["Evidence is bounded to the recorded operating conditions."],
        },
      ],
      highRhCheck: {
        verificationId,
        targetRelativeHumidityPct: 80,
        methodId: "method:high-rh-comparison:v1",
        referenceInstrumentId: "sensor:reference:traceable-1",
        checkedAt: "2026-08-01T11:15:00Z",
        referenceRelativeHumidityPct: 80,
        deviceAsFoundRelativeHumidityPct: 78,
        asFoundDeviationPctPoints: -2,
        adjustmentPerformed: false,
        deviceAsLeftRelativeHumidityPct: null,
        asLeftDeviationPctPoints: null,
        uncertaintyPctPoints: 1,
        acceptanceCriteria: "Pass within the documented comparison tolerance.",
        disposition: "pass",
        limitations: ["The comparison is valid only at the recorded operating point."],
      },
      leafTemperatureBasis: {
        methodId: "method:leaf-temperature-offset:v1",
        referenceInstrumentId: "sensor:reference:infrared-1",
        measuredAt: "2026-08-01T11:30:00Z",
        airTemperatureC: 25,
        leafTemperatureC: 23.5,
        offsetC: -1.5,
        sampleCount: 6,
        samplingLocations: ["Upper canopy", "Center canopy"],
        lightState: "on_stable",
        uncertaintyC: 0.4,
        applications: ["context_only_for_air_vpd", "formula_input_for_leaf_vpd"],
        evidenceSourceIds: ["source:leaf-temperature-record:1"],
        limitations: ["Recheck after meaningful lighting or canopy changes."],
      },
    },
    transport: {
      integrationId,
      mode: "read_only_live",
      protocol: "local_bridge",
      status: "verified_read_only",
      readOnly: true,
      directDeviceControl: false,
      verifiedOn: "2026-08-01",
      verifiedVersions: ["bridge-1.0.0"],
      evidenceSourceIds: ["source:integration-test:1"],
      credentialBoundary: "Credentials remain outside public knowledge records.",
      limitations: ["No device-control route exists."],
    },
    capabilities: [
      {
        capabilityId: "capability:native-sensing",
        name: "Native sensing",
        owner: "native_device",
        status: "verified",
        supportedMetricIds: ["metric:air-temperature"],
        evidenceSourceIds: ["source:device-manual:1"],
        readOnly: true,
        verdantMayInvoke: false,
        limitations: ["Native capability only."],
      },
      {
        capabilityId: "capability:verdant-read-only-ingest",
        name: "Read-only ingest",
        owner: "verdant_integration",
        status: "verified",
        supportedMetricIds: ["metric:air-temperature", "metric:relative-humidity"],
        evidenceSourceIds: ["source:integration-test:1"],
        readOnly: true,
        verdantMayInvoke: false,
        limitations: ["No device-control route exists."],
      },
    ],
    sources: [
      { nodeId: "source:device-manual:1" },
      { nodeId: "source:integration-test:1" },
      { nodeId: "source:calibration-report:1" },
      { nodeId: "source:leaf-temperature-record:1" },
    ],
  };
}

function batchHealthScope(batchId = "batch-public-1") {
  return {
    subjectType: "batch",
    accessionId: "accession-public-1",
    batchId,
    plantId: null,
  };
}

function screeningEvent(result, eventId, overrides = {}) {
  const definitive = result !== "not_tested";
  return {
    eventId,
    scope: batchHealthScope(),
    sampleId: definitive ? `sample-${eventId.split(":").at(-1)}` : null,
    target: "Hop latent viroid",
    targetNodeId: "condition:hop-latent-viroid",
    result,
    collectedOn: definitive ? "2026-08-01" : null,
    resultedOn: definitive ? "2026-08-02" : null,
    recordedOn: "2026-08-02T12:00:00Z",
    laboratory: definitive ? "Accredited laboratory" : null,
    methodId: definitive ? "method:hlvd-assay:v1" : null,
    sourceLinks: definitive
      ? [
          {
            sourceId: "source:lab-report:1",
            roles: ["supports"],
            locator: "Result table",
          },
        ]
      : [],
    supersedesEventId: null,
    retestOfEventIds: [],
    recordedBy: "author:genetics-editor:1",
    correctionReason: null,
    limitations: ["The result is limited to this subject, sample, target, and date."],
    ...overrides,
  };
}

function quarantineEvent(action, eventId, overrides = {}) {
  return {
    eventId,
    episodeId: "quarantine:episode:1",
    scope: batchHealthScope(),
    target: "Hop latent viroid",
    action,
    occurredOn:
      action === "open"
        ? "2026-07-31T12:00:00Z"
        : action === "reopen"
          ? "2026-08-04T12:00:00Z"
          : "2026-08-03T12:00:00Z",
    reason:
      action === "override"
        ? "Authorized exception retained as an explicit non-clearance state."
        : "Document the quarantine evidence and transition.",
    screeningEventIds: action === "release" ? ["screening:hlvd:negative-1"] : [],
    isOverride: action === "override",
    recordedBy: "reviewer:biosecurity:1",
    sourceLinks: [],
    limitations: ["This transition applies only to the recorded scope and target."],
    ...overrides,
  };
}

function cultivarHealthFixture({
  screenings = [screeningEvent("negative", "screening:hlvd:negative-1")],
  quarantines = [
    quarantineEvent("open", "quarantine:event:open-1"),
    quarantineEvent("release", "quarantine:event:release-1"),
  ],
  healthSubjects = [
    {
      scope: batchHealthScope(),
      target: "Hop latent viroid",
    },
  ],
} = {}) {
  const record = {
    identity: {
      provenance: {
        healthSubjects,
        screeningHistory: screenings,
        quarantineHistory: quarantines,
        currentHealthDisposition: {
          derivedOn: "2026-08-03T13:00:00Z",
          methodId: "method:genetics-health-disposition:v1",
          subjects: [],
          limitations: [
            "A current disposition is a derived scoped summary, not a pathogen-free claim.",
          ],
        },
      },
    },
    sources: [{ nodeId: "source:lab-report:1" }, { nodeId: "source:quarantine-record:1" }],
  };
  record.identity.provenance.currentHealthDisposition.subjects =
    deriveCultivarHealthDisposition(record);
  return record;
}

test("accepts the reviewed Knowledge Library schema-contract set", () => {
  const result = validateSchemaDocuments(freshDocuments());
  assert.equal(result.status, "pass");
  assert.equal(result.validationMode, "draft-2020-12+structural-contract");
  assert.equal(result.templateCount, 4);
});

test("keeps documented graph nodes, edges, and endpoint types aligned with the schemas", () => {
  const documents = freshDocuments();
  const common = documents.get("common.schema.json");
  const markdown = readFileSync(
    new URL("../../docs/knowledge-library/knowledge-graph.md", import.meta.url),
    "utf8",
  );
  const nodeSection = markdown
    .split("## Node types")[1]
    .split("## Canonical sensor metric and unit identities")[0];
  const edgeSection = markdown
    .split("## Edge vocabulary and endpoint contract")[1]
    .split("## Edge provenance")[0];
  const nodeRows = markdownTableRows(nodeSection);
  const edgeRows = markdownTableRows(edgeSection);
  const documentedNodes = nodeRows.map(([name]) => name.slice(1, -1));
  const documentedEdges = edgeRows.map(([name]) => name.slice(1, -1));

  assert.equal(common.$defs.nodeType.enum.length, 26);
  assert.equal(common.$defs.edgeType.enum.length, 34);
  assert.deepEqual(new Set(documentedNodes), new Set(common.$defs.nodeType.enum));
  assert.deepEqual(new Set(documentedEdges), new Set(common.$defs.edgeType.enum));

  const allowedNodeTypes = new Set(common.$defs.nodeType.enum);
  for (const [edgeName, endpointCell, cardinality, symmetric] of edgeRows) {
    const canonicalEdgeName = edgeName.slice(1, -1);
    const endpointTypes = [...endpointCell.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    if (["related_to", "supersedes"].includes(canonicalEdgeName)) {
      assert.match(endpointCell, /defined node type|same type/);
    } else {
      assert.ok(endpointTypes.length >= 2, `${edgeName} must declare source and target types`);
    }
    for (const endpointType of endpointTypes) {
      assert.ok(
        allowedNodeTypes.has(endpointType),
        `${edgeName} uses undefined endpoint type ${endpointType}`,
      );
    }
    assert.match(cardinality, /`(?:0:1|1:1|1:N|M:N|N:1)`/);
    assert.match(symmetric, /^(?:yes|no)$/);
  }
});

test("keeps next-step and editorial differential endpoints directional and bounded", () => {
  const markdown = readFileSync(
    new URL("../../docs/knowledge-library/knowledge-graph.md", import.meta.url),
    "utf8",
  );
  const edgeSection = markdown
    .split("## Edge vocabulary and endpoint contract")[1]
    .split("## Edge provenance")[0];
  const rows = new Map(
    markdownTableRows(edgeSection).map(([name, endpoints, cardinality, symmetric, meaning]) => [
      name.slice(1, -1),
      { endpoints, cardinality, symmetric, meaning },
    ]),
  );

  assert.deepEqual(
    [...rows.get("next_step").endpoints.matchAll(/`([^`]+)`/g)].map((m) => m[1]),
    ["Topic", "Cultivar", "Sensor", "Condition", "Protocol", "Equipment", "Method"],
  );
  assert.equal(rows.get("next_step").symmetric, "no");
  assert.deepEqual(
    [...rows.get("differential_of").endpoints.matchAll(/`([^`]+)`/g)].map((m) => m[1]),
    ["Topic", "Condition", "Condition"],
  );
  assert.equal(rows.get("differential_of").symmetric, "no");
  assert.equal(rows.get("mimics").symmetric, "yes");
  assert.match(rows.get("differential_of").meaning, /editorial/i);
  assert.match(rows.get("mimics").meaning, /biological|observational/i);
});

test("keeps roadmap content pillars separate from risk and hazard domains", () => {
  const documents = freshDocuments();
  const common = documents.get("common.schema.json");
  const roadmap = JSON.parse(
    readFileSync(new URL("../../docs/knowledge-library/roadmap-500.json", import.meta.url), "utf8"),
  );
  const roadmapContentDomains = new Set(roadmap.pages.map((page) => page.pillar));
  const roadmapRiskDomains = new Set(roadmap.pages.map((page) => page.riskDomain));
  const schemaContentDomains = new Set(common.$defs.contentDomain.enum);
  const schemaRiskDomains = new Set(common.$defs.riskDomain.enum);

  assert.deepEqual(roadmapContentDomains, schemaContentDomains);
  assert.ok(
    [...roadmapRiskDomains].every((domain) => schemaRiskDomains.has(domain)),
    "every roadmap risk domain must be allowed by the common schema",
  );
  assert.equal(
    [...schemaContentDomains].filter((domain) => schemaRiskDomains.has(domain)).length,
    0,
    "content and hazard taxonomies must remain disjoint",
  );
});

test("rejects a broken cross-file reference", () => {
  const documents = freshDocuments();
  documents.get("sensor.schema.json").properties.editorial.$ref =
    "missing.schema.json#/$defs/editorial";

  assert.throws(
    () => validateSchemaDocuments(documents),
    /references missing schema missing\.schema\.json/,
  );
});

test("rejects a reference to a missing JSON pointer", () => {
  const documents = freshDocuments();
  documents.get("sensor.schema.json").properties.editorial.$ref =
    "common.schema.json#/$defs/not-present";

  assert.throws(() => validateSchemaDocuments(documents), /references missing JSON pointer/);
});

test("rejects a required key that has no property contract", () => {
  const documents = freshDocuments();
  documents.get("sensor.schema.json").required.push("undeclaredField");

  assert.throws(
    () => validateSchemaDocuments(documents),
    /requires missing property undeclaredField/,
  );
});

test("rejects duplicate required keys", () => {
  const documents = freshDocuments();
  documents.get("sensor.schema.json").required.push("slug");

  assert.throws(() => validateSchemaDocuments(documents), /repeats a required key/);
});

test("rejects an open object contract outside a conditional overlay", () => {
  const documents = freshDocuments();
  documents.get("sensor.schema.json").properties.unsafeOpenObject = {
    type: "object",
    properties: { value: { type: "string" } },
  };

  assert.throws(
    () => validateSchemaDocuments(documents),
    /unsafeOpenObject must set additionalProperties to false/,
  );
});

test("rejects missing object types in every specialized page-manifest overlay", () => {
  for (const fileName of [
    "cultivar.schema.json",
    "sensor.schema.json",
    "deficiency.schema.json",
    "equipment.schema.json",
  ]) {
    const documents = freshDocuments();
    delete documents.get(fileName).allOf[0].properties.pageManifest.type;

    assert.throws(
      () => validateSchemaDocuments(documents),
      new RegExp(
        `${fileName.replaceAll(".", "\\.")}.*uses object keywords without explicit object type`,
      ),
    );
  }
});

test("rejects a missing array type on a conditional contains overlay", () => {
  const documents = freshDocuments();
  const sensor = documents.get("sensor.schema.json");
  const humidityConditional = sensor.allOf.find((entry) =>
    JSON.stringify(entry.if ?? {}).includes('"humidity_pct"'),
  );
  delete humidityConditional.if.properties.measurements.type;

  assert.throws(
    () => validateSchemaDocuments(documents),
    /sensor\.schema\.json.*uses array keywords without explicit array type/,
  );
});

test("rejects removal of a base page-manifest block", () => {
  const documents = freshDocuments();
  const pageManifest = documents.get("common.schema.json").$defs.pageManifest;
  pageManifest.required = pageManifest.required.filter((key) => key !== "graph");

  assert.throws(() => validateSchemaDocuments(documents), /common pageManifest must require graph/);
});

test("enforces revision-specific conditional content-block applicability receipts", () => {
  const decisionValidator = getValidator("common.schema.json#/$defs/applicabilityDecision");
  const blockValidator = getValidator("common.schema.json#/$defs/blockApplicability");
  const required = {
    status: "required",
    reason: null,
    reviewerId: "reviewer:editorial:1",
    reviewedOn: "2026-08-01",
  };
  const notApplicable = {
    status: "not_applicable",
    reason: "This page family contains no operational procedure.",
    reviewerId: "reviewer:editorial:1",
    reviewedOn: "2026-08-01",
  };

  assert.equal(decisionValidator(required), true, JSON.stringify(decisionValidator.errors));
  assert.equal(decisionValidator(notApplicable), true, JSON.stringify(decisionValidator.errors));
  assert.equal(decisionValidator({ ...required, reason: "Not needed." }), false);
  assert.equal(decisionValidator({ ...notApplicable, reason: "Too short" }), false);
  assert.equal(decisionValidator({ ...notApplicable, reviewerId: "" }), false);
  assert.equal(decisionValidator({ ...notApplicable, reviewedOn: "today" }), false);

  const receipt = {
    procedureOrComparison: notApplicable,
    confoundersOrDifferentials: required,
    stopAndFollowUp: required,
  };
  assert.equal(blockValidator(receipt), true, JSON.stringify(blockValidator.errors));
  assert.equal(blockValidator({ ...receipt, stopAndFollowUp: undefined }), false);
  assert.equal(blockValidator({ ...receipt, inventedBlock: required }), false);
});

test("rejects weakening the conditional content-block applicability contract", () => {
  {
    const documents = freshDocuments();
    const pageManifest = documents.get("common.schema.json").$defs.pageManifest;
    pageManifest.required = pageManifest.required.filter((key) => key !== "blockApplicability");
    assert.throws(
      () => validateSchemaDocuments(documents),
      /common pageManifest must require blockApplicability/,
    );
  }
  {
    const documents = freshDocuments();
    const decision = documents.get("common.schema.json").$defs.applicabilityDecision;
    const notApplicableBranch = decision.oneOf.find(
      (branch) => branch.properties?.status?.const === "not_applicable",
    );
    notApplicableBranch.properties.reason.minLength = 0;
    assert.throws(
      () => validateSchemaDocuments(documents),
      /common not-applicable block applicability must require a recorded reason/,
    );
  }
});

test("binds prerequisite, lateral, and differential links to applicability receipts", () => {
  const linkValidator = getValidator("common.schema.json#/$defs/linkApplicability");
  const required = {
    status: "required",
    reason: null,
    reviewerId: "reviewer:editorial:1",
    reviewedOn: "2026-08-01",
  };
  const notApplicable = {
    status: "not_applicable",
    reason: "This page family has no genuine link for this conditional slot.",
    reviewerId: "reviewer:editorial:1",
    reviewedOn: "2026-08-01",
  };
  const receipt = {
    prerequisite: notApplicable,
    contextualLateral: required,
    differential: notApplicable,
  };
  assert.equal(linkValidator(receipt), true, JSON.stringify(linkValidator.errors));
  assert.equal(linkValidator({ ...receipt, differential: undefined }), false);
  assert.equal(linkValidator({ ...receipt, inventedSlot: required }), false);

  const gates = [
    {
      validator: getValidator("common.schema.json#/$defs/pageManifest/allOf/0"),
      slot: "prerequisite",
      graphField: "prerequisiteIds",
      validIds: ["topic:required-foundation"],
    },
    {
      validator: getValidator("common.schema.json#/$defs/pageManifest/allOf/1"),
      slot: "contextualLateral",
      graphField: "lateralIds",
      validIds: ["topic:lateral-one", "topic:lateral-two"],
    },
    {
      validator: getValidator("common.schema.json#/$defs/pageManifest/allOf/2"),
      slot: "differential",
      graphField: "differentialIds",
      validIds: ["condition:first", "condition:second", "condition:third"],
    },
  ];
  for (const { validator, slot, graphField, validIds } of gates) {
    assert.equal(
      validator({
        linkApplicability: { [slot]: required },
        graph: { [graphField]: validIds },
      }),
      true,
      `${slot} required positive: ${JSON.stringify(validator.errors)}`,
    );
    assert.equal(
      validator({
        linkApplicability: { [slot]: required },
        graph: { [graphField]: [] },
      }),
      false,
      `${slot} required empty`,
    );
    assert.equal(
      validator({
        linkApplicability: { [slot]: notApplicable },
        graph: { [graphField]: [] },
      }),
      true,
      `${slot} not-applicable empty: ${JSON.stringify(validator.errors)}`,
    );
    assert.equal(
      validator({
        linkApplicability: { [slot]: notApplicable },
        graph: { [graphField]: validIds },
      }),
      false,
      `${slot} not-applicable cannot hide links`,
    );
  }
});

test("rejects weakening the conditional link-applicability contract", () => {
  {
    const documents = freshDocuments();
    const pageManifest = documents.get("common.schema.json").$defs.pageManifest;
    pageManifest.required = pageManifest.required.filter((key) => key !== "linkApplicability");
    assert.throws(
      () => validateSchemaDocuments(documents),
      /common pageManifest must require linkApplicability/,
    );
  }
  {
    const documents = freshDocuments();
    const pageManifest = documents.get("common.schema.json").$defs.pageManifest;
    const lateralGate = pageManifest.allOf.find((entry) =>
      JSON.stringify(entry.if).includes('"contextualLateral"'),
    );
    lateralGate.then.properties.graph.properties.lateralIds.minItems = 1;
    assert.throws(
      () => validateSchemaDocuments(documents),
      /common pageManifest must bind contextualLateral applicability to lateralIds cardinality/,
    );
  }
});

test("binds page families to their required link-applicability decisions", () => {
  const common = freshDocuments().get("common.schema.json");
  const familyGates = common.$defs.pageManifest.allOf.slice(3);
  const diagnosticGate = BASELINE_COMPILED.ajv.compile(familyGates[0]);
  const pillarGate = BASELINE_COMPILED.ajv.compile(familyGates[1]);
  const lateralGate = BASELINE_COMPILED.ajv.compile(familyGates[2]);

  assert.equal(
    diagnosticGate({
      metadata: { pageFamily: "diagnostic" },
      linkApplicability: { differential: { status: "required" } },
    }),
    true,
    JSON.stringify(diagnosticGate.errors),
  );
  assert.equal(
    diagnosticGate({
      metadata: { pageFamily: "diagnostic" },
      linkApplicability: { differential: { status: "not_applicable" } },
    }),
    false,
  );
  assert.equal(
    pillarGate({
      metadata: { pageFamily: "pillar" },
      linkApplicability: { prerequisite: { status: "not_applicable" } },
    }),
    true,
    JSON.stringify(pillarGate.errors),
  );
  assert.equal(
    pillarGate({
      metadata: { pageFamily: "pillar" },
      linkApplicability: { prerequisite: { status: "required" } },
    }),
    false,
  );
  for (const pageFamily of [
    "reference",
    "protocol",
    "diagnostic",
    "comparison",
    "worked-example",
    "entity",
    "glossary",
  ]) {
    assert.equal(
      lateralGate({
        metadata: { pageFamily },
        linkApplicability: { contextualLateral: { status: "required" } },
      }),
      true,
      `${pageFamily}: ${JSON.stringify(lateralGate.errors)}`,
    );
    assert.equal(
      lateralGate({
        metadata: { pageFamily },
        linkApplicability: { contextualLateral: { status: "not_applicable" } },
      }),
      false,
      `${pageFamily} cannot waive contextual lateral links`,
    );
  }
});

test("rejects weakening page-family link-applicability gates", () => {
  {
    const documents = freshDocuments();
    const pageManifest = documents.get("common.schema.json").$defs.pageManifest;
    pageManifest.allOf = pageManifest.allOf.filter(
      (entry) => !JSON.stringify(entry.if).includes('"diagnostic"'),
    );
    assert.throws(
      () => validateSchemaDocuments(documents),
      /diagnostic page family must require the differential link slot/,
    );
  }
  {
    const documents = freshDocuments();
    const pageManifest = documents.get("common.schema.json").$defs.pageManifest;
    pageManifest.allOf = pageManifest.allOf.filter(
      (entry) => !JSON.stringify(entry.if).includes('"pillar"'),
    );
    assert.throws(
      () => validateSchemaDocuments(documents),
      /pillar page family must mark the prerequisite link slot not applicable/,
    );
  }
  {
    const documents = freshDocuments();
    const pageManifest = documents.get("common.schema.json").$defs.pageManifest;
    const lateralFamilyGate = pageManifest.allOf.find((entry) =>
      JSON.stringify(entry.if).includes('"worked-example"'),
    );
    lateralFamilyGate.if.properties.metadata.properties.pageFamily.enum = ["reference"];
    assert.throws(
      () => validateSchemaDocuments(documents),
      /instructional page families must require contextual lateral links/,
    );
  }
});

test("rejects removing the required page next-step slot", () => {
  const documents = freshDocuments();
  const pageGraph = documents.get("common.schema.json").$defs.pageGraph;
  pageGraph.required = pageGraph.required.filter((key) => key !== "nextStepIds");

  assert.throws(
    () => validateSchemaDocuments(documents),
    /common pageGraph must require nextStepIds/,
  );
});

test("rejects allowing a page without a next-step target", () => {
  const documents = freshDocuments();
  documents.get("common.schema.json").$defs.pageGraph.properties.nextStepIds.minItems = 0;

  assert.throws(
    () => validateSchemaDocuments(documents),
    /common pageGraph nextStepIds must be a unique node-ID array with minItems 1/,
  );
});

test("rejects a non-unique page differential slot", () => {
  const documents = freshDocuments();
  documents.get("common.schema.json").$defs.pageGraph.properties.differentialIds.uniqueItems =
    false;

  assert.throws(
    () => validateSchemaDocuments(documents),
    /common pageGraph differentialIds must be a unique node-ID array with minItems 0/,
  );
});

test("rejects a specialized template that no longer requires the base page manifest", () => {
  const documents = freshDocuments();
  const cultivar = documents.get("cultivar.schema.json");
  cultivar.required = cultivar.required.filter((key) => key !== "pageManifest");

  assert.throws(
    () => validateSchemaDocuments(documents),
    /cultivar\.schema\.json must require pageManifest/,
  );
});

test("rejects a specialized template wired to the wrong common definition", () => {
  const documents = freshDocuments();
  documents.get("equipment.schema.json").properties.pageManifest.$ref =
    "common.schema.json#/$defs/pageMetadata";

  assert.throws(
    () => validateSchemaDocuments(documents),
    /equipment\.schema\.json pageManifest must reference .*pageManifest/,
  );
});

test("pins each specialized template to its canonical page family", () => {
  const expectations = new Map([
    ["cultivar.schema.json", "entity"],
    ["sensor.schema.json", "entity"],
    ["deficiency.schema.json", "diagnostic"],
    ["equipment.schema.json", "entity"],
  ]);
  for (const [fileName, pageFamily] of expectations) {
    const documents = freshDocuments();
    const schema = documents.get(fileName);
    const familyPin = schema.allOf.find((entry) => JSON.stringify(entry).includes('"pageFamily"'));
    assert.equal(
      familyPin.properties.pageManifest.properties.metadata.properties.pageFamily.const,
      pageFamily,
    );
    familyPin.properties.pageManifest.properties.metadata.properties.pageFamily.const = "cluster";
    assert.throws(() => validateSchemaDocuments(documents), new RegExp(`pageFamily=${pageFamily}`));
  }
});

test("rejects removal of the VPD non-direct conditional", () => {
  const documents = freshDocuments();
  const sensor = documents.get("sensor.schema.json");
  sensor.properties.measurements.items.allOf = sensor.properties.measurements.items.allOf.filter(
    (entry) => !JSON.stringify(entry.if ?? {}).includes('"vpd_kpa"'),
  );

  assert.throws(() => validateSchemaDocuments(documents), /must prohibit direct VPD/);
});

test("rejects removal of the high-RH conditional", () => {
  const documents = freshDocuments();
  const sensor = documents.get("sensor.schema.json");
  sensor.allOf = sensor.allOf.filter(
    (entry) => !JSON.stringify(entry.if ?? {}).includes('"humidity_pct"'),
  );

  assert.throws(
    () => validateSchemaDocuments(documents),
    /humidity and VPD pages must require an actual high-RH check/,
  );
});

test("rejects removal of the leaf-VPD basis conditional", () => {
  const documents = freshDocuments();
  const sensor = documents.get("sensor.schema.json");
  sensor.allOf = sensor.allOf.filter(
    (entry) => !JSON.stringify(entry.then ?? {}).includes('"leafTemperatureBasis"'),
  );

  assert.throws(
    () => validateSchemaDocuments(documents),
    /VPD pages must require current verification and a structured leaf basis/,
  );
});

test("rejects removal of verified equipment evidence requirements", () => {
  const documents = freshDocuments();
  const equipment = documents.get("equipment.schema.json");
  equipment.allOf = equipment.allOf.filter(
    (entry) => !JSON.stringify(entry.if ?? {}).includes('"verified"'),
  );

  assert.throws(
    () => validateSchemaDocuments(documents),
    /must require dated, versioned evidence for verified compatibility/,
  );
});

test("rejects removal of verified cultivar provenance requirements", () => {
  const documents = freshDocuments();
  const cultivar = documents.get("cultivar.schema.json");
  cultivar.allOf = cultivar.allOf.filter(
    (entry) => !JSON.stringify(entry.if ?? {}).includes('"verified"'),
  );

  assert.throws(
    () => validateSchemaDocuments(documents),
    /must require lineage and provenance evidence when verified/,
  );
});

test("rejects removal of the deficiency escalation contract", () => {
  const documents = freshDocuments();
  const deficiency = documents.get("deficiency.schema.json");
  deficiency.required = deficiency.required.filter((key) => key !== "escalation");

  assert.throws(
    () => validateSchemaDocuments(documents),
    /deficiency schema must require escalation/,
  );
});

test("rejects a deficiency template without useful graph differential IDs", () => {
  const documents = freshDocuments();
  const deficiency = documents.get("deficiency.schema.json");
  const differentialIds =
    deficiency.allOf[0].properties.pageManifest.properties.graph.properties.differentialIds;
  differentialIds.minItems = 0;

  assert.throws(
    () => validateSchemaDocuments(documents),
    /deficiency schema must require at least three useful graph differential IDs/,
  );
});

test("rejects ontology vocabulary drift", () => {
  const documents = freshDocuments();
  documents.get("common.schema.json").$defs.nodeType.enum.push("UndefinedNode");

  assert.throws(() => validateSchemaDocuments(documents), /common nodeType must contain exactly/);
});

test("rejects removal of the next-step edge vocabulary", () => {
  const documents = freshDocuments();
  const edgeTypes = documents.get("common.schema.json").$defs.edgeType.enum;
  edgeTypes.splice(edgeTypes.indexOf("next_step"), 1);

  assert.throws(() => validateSchemaDocuments(documents), /common edgeType must contain exactly/);
});

test("enforces page-local canonical identity and author/reviewer graph reciprocity", () => {
  const fixture = pageIdentityFixture();
  assert.deepEqual(validatePageIdentitySemantics(fixture), {
    status: "pass",
    pageId: "topic:test-page",
    authorCount: 1,
    reviewerCount: 1,
  });

  for (const [label, mutate, pattern] of [
    [
      "canonical path",
      (page) => {
        page.pageManifest.seo.canonicalPath = "/guides/other-page";
      },
      /metadata path must match seo canonicalPath/,
    ],
    [
      "specialized slug",
      (page) => {
        page.slug = "other-page";
      },
      /path tail must match every page-local slug/,
    ],
    [
      "graph identity",
      (page) => {
        page.pageManifest.graph.node.id = "topic:other-page";
      },
      /metadata id must match the graph node id/,
    ],
    [
      "specialized identity",
      (page) => {
        page.identity.equipmentNodeId = "equipment:other-page";
      },
      /page-local specialized identity must match the graph node id/,
    ],
    [
      "breadcrumb parent",
      (page) => {
        page.pageManifest.seo.breadcrumbNodeIds[1] = "topic:other-pillar";
      },
      /breadcrumb parent must match graph parentId/,
    ],
    [
      "profile subject",
      (page) => {
        page.editorial.author.profileSubjectId = "author:someone-else";
      },
      /profile subject must match its person identity/,
    ],
    [
      "authorship edge",
      (page) => {
        page.pageManifest.graph.edges = page.pageManifest.graph.edges.filter(
          (edge) => edge.type !== "authored_by",
        );
      },
      /authored_by edges must exactly match the page author/,
    ],
    [
      "review edge",
      (page) => {
        page.pageManifest.graph.edges = page.pageManifest.graph.edges.filter(
          (edge) => edge.type !== "reviewed_by",
        );
      },
      /reviewed_by edges must exactly match the page reviewers/,
    ],
  ]) {
    const invalid = structuredClone(fixture);
    mutate(invalid);
    assert.throws(() => validatePageIdentitySemantics(invalid), pattern, label);
  }
});

test("requires an alternate-consumer evidence receipt when FAQPage is serialized", () => {
  const validator = getValidator("common.schema.json#/$defs/pageSeo");
  const base = {
    title: "A complete test page title",
    h1: "A complete test page heading",
    description:
      "A sufficiently descriptive summary of the complete test page and its bounded purpose.",
    canonicalPath: "/guides/test-page",
    indexing: "index",
    breadcrumbNodeIds: ["topic:test-pillar", "topic:test-page"],
    structuredDataTypes: ["WebPage", "BreadcrumbList"],
    faqPageReceipt: null,
  };
  assert.equal(validator(base), true, JSON.stringify(validator.errors));
  assert.equal(
    validator({ ...base, structuredDataTypes: [...base.structuredDataTypes, "FAQPage"] }),
    false,
  );
  const withReceipt = {
    ...base,
    structuredDataTypes: [...base.structuredDataTypes, "FAQPage"],
    faqPageReceipt: {
      consumerName: "Named alternate consumer",
      consumerPurpose: "Consume visible question and answer pairs outside a Google rich result.",
      consumerDocumentationSourceId: "source:alternate-consumer-docs:1",
      documentationVerifiedOn: "2026-08-01",
      contractVersion: "1.0.0",
      visibleQuestionIds: ["question:test:1"],
      googleRichResultExpected: false,
      limitations: ["The receipt does not claim Google FAQ rich-result eligibility."],
    },
  };
  assert.equal(validator(withReceipt), true, JSON.stringify(validator.errors));
  assert.equal(
    validator({
      ...withReceipt,
      faqPageReceipt: { ...withReceipt.faqPageReceipt, googleRichResultExpected: true },
    }),
    false,
  );

  const semantic = pageIdentityFixture();
  semantic.pageManifest.seo.faqPageReceipt = withReceipt.faqPageReceipt;
  semantic.sources = [{ nodeId: "source:alternate-consumer-docs:1" }];
  assert.equal(validatePageIdentitySemantics(semantic).status, "pass");
  semantic.sources.push({
    nodeId: "source:alternate-consumer-docs:1",
    label: "Ambiguous duplicate identity",
  });
  assert.throws(() => validatePageIdentitySemantics(semantic), /must not repeat a source node/);
  semantic.sources = [];
  assert.throws(
    () => validatePageIdentitySemantics(semantic),
    /must resolve its current-documentation source identity/,
  );
});

test("rejects widening next-step endpoints beyond the editorial contract", () => {
  const documents = freshDocuments();
  const common = documents.get("common.schema.json");
  edgeBranch(common, "next_step").properties.sourceType = { const: "Stage" };

  assert.throws(
    () => validateSchemaDocuments(documents),
    /next_step branch must match its endpoint\/cardinality\/symmetry contract/,
  );
});

test("rejects making editorial differentials symmetric like biological mimics", () => {
  const documents = freshDocuments();
  const common = documents.get("common.schema.json");
  edgeBranch(common, "differential_of").properties.symmetric.const = true;

  assert.throws(
    () => validateSchemaDocuments(documents),
    /differential_of branch must match its endpoint\/cardinality\/symmetry contract/,
  );
});

test("allows Metric to own the method used for a derived measurement", () => {
  const common = freshDocuments().get("common.schema.json");
  const usesMethod = edgeBranch(common, "uses_method");
  assert.ok(usesMethod.properties.sourceType.enum.includes("Metric"));
  assert.ok(EDGE_CONTRACTS.uses_method.sourceTypes.includes("Metric"));
  const edge = activeEdgeFixture("uses_method");
  edge.sourceId = "metric:vpd-air";
  edge.sourceType = "Metric";
  edge.targetId = "method:air-vpd:v1";
  edge.targetType = "Method";
  assert.equal(validateGraphEdgeSemantics(edge).status, "pass");
});

test("rejects material-claim risk-class vocabulary drift", () => {
  const documents = freshDocuments();
  documents.get("common.schema.json").$defs.riskClass.enum.splice(3, 1, "R4");

  assert.throws(() => validateSchemaDocuments(documents), /common riskClass must contain exactly/);
});

test("keeps routine crop biosecurity in R2 and reserves R3 for human, property, or legal hazards", () => {
  const graph = readFileSync(
    new URL("../../docs/knowledge-library/knowledge-graph.md", import.meta.url),
    "utf8",
  );
  const standards = readFileSync(
    new URL("../../docs/knowledge-library/content-standards.md", import.meta.url),
    "utf8",
  );
  const roadmapValidator = readFileSync(new URL("./validate-roadmap.mjs", import.meta.url), "utf8");
  const graphR2 = graph.split(/\r?\n/).find((line) => line.startsWith("| `R2`"));
  const graphR3 = graph.split(/\r?\n/).find((line) => line.startsWith("| `R3`"));
  const standardsR2 = standards
    .split(/\r?\n/)
    .find((line) => line.startsWith("| R2 — consequential cultivation"));
  const standardsR3 = standards
    .split(/\r?\n/)
    .find((line) => line.startsWith("| R3 — life/property/legal"));

  assert.match(graphR2 ?? "", /routine pathogen\/IPM screening and plant-containment records/i);
  assert.match(graphR3 ?? "", /human safety, property, or legal boundary/i);
  assert.match(standardsR2 ?? "", /pathogen\/IPM/i);
  assert.match(standardsR3 ?? "", /electrical|worker exposure|compliance/i);
  assert.match(roadmapValidator, /pathogen:\s*"R2"/);
  assert.match(roadmapValidator, /biosecurity:\s*"R2"/);
  assert.doesNotMatch(graphR3 ?? "", /routine pathogen\/IPM/i);
  assert.doesNotMatch(standardsR3 ?? "", /routine pathogen\/IPM/i);
});

test("keeps sensor and cultivar documentation aligned with machine-enforced truth contracts", () => {
  const graph = readFileSync(
    new URL("../../docs/knowledge-library/knowledge-graph.md", import.meta.url),
    "utf8",
  );
  const standards = readFileSync(
    new URL("../../docs/knowledge-library/content-standards.md", import.meta.url),
    "utf8",
  );
  const workflow = readFileSync(
    new URL("../../docs/knowledge-library/editorial-workflow.md", import.meta.url),
    "utf8",
  );
  const readme = readFileSync(
    new URL("../../docs/knowledge-library/README.md", import.meta.url),
    "utf8",
  );
  const pillars = readFileSync(
    new URL("../../docs/knowledge-library/pillar-pages.md", import.meta.url),
    "utf8",
  );
  const siteMap = readFileSync(
    new URL("../../docs/knowledge-library/site-map.md", import.meta.url),
    "utf8",
  );

  for (const [metricKey, { metricId, unitId }] of Object.entries(SENSOR_METRIC_CONTRACTS)) {
    const tupleRow = graph.split(/\r?\n/).find((line) => line.includes(`| \`${metricKey}\``));
    assert.ok(tupleRow, `missing documented metric tuple for ${metricKey}`);
    assert.ok(
      tupleRow.includes(`\`${metricId}\``) && tupleRow.includes(`\`${unitId}\``),
      `incorrect documented metric tuple for ${metricKey}`,
    );
  }

  assert.match(graph, /Calibration is an append-only verification history/i);
  assert.match(graph, /target and reference RH are at least 75%/i);
  assert.match(graph, /`context_only_for_air_vpd`/);
  assert.match(graph, /`formula_input_for_leaf_vpd`/);
  assert.match(graph, /`verdantMayInvoke` is false/);
  assert.match(standards, /every VPD page—even a VPD-only page/i);
  assert.match(standards, /actual high-RH comparison at operating conditions/i);
  assert.match(
    standards,
    /Native device capabilities and Verdant integration capabilities are separate claims/i,
  );

  assert.match(graph, /Cultivar health evidence is append-only and subject-scoped/i);
  assert.match(graph, /A correction adds a later-recorded event with `supersedesEventId`/i);
  assert.match(graph, /It may say `negative_scoped`.*never “clean” or “pathogen free,”/i);
  assert.match(standards, /A negative result is always `negative_scoped`/i);
  assert.match(
    standards,
    /An override is labeled as an override and never presented as laboratory clearance/i,
  );
  assert.match(workflow, /`validateSensorVerificationHistoryAppendOnly`/);
  assert.match(workflow, /`validateCultivarHistoryAppendOnly`/);
  assert.match(
    workflow,
    /\| `cultivation_review -> product_truth_review`\s+\| Product-truth reviewer[\s\S]*shipped-behavior verification/i,
  );
  assert.doesNotMatch(pillars, /protect clean stock|clean\/unknown\/positive status/i);
  assert.doesNotMatch(siteMap, /protect clean rooms/i);
  assert.match(
    pillars,
    /prerequisite is required only when a real knowledge or safety dependency exists/i,
  );

  assert.match(readme, /Each roadmap record also declares `productTruthScope`/i);
  assert.match(readme, /`current_product_test_or_shipped_code`/);
});

test("rejects content-domain vocabulary drift", () => {
  const documents = freshDocuments();
  documents.get("common.schema.json").$defs.contentDomain.enum.push("automation");

  assert.throws(
    () => validateSchemaDocuments(documents),
    /common contentDomain must contain exactly/,
  );
});

test("rejects risk-domain vocabulary drift", () => {
  const documents = freshDocuments();
  documents.get("common.schema.json").$defs.riskDomain.enum.push("automation");

  assert.throws(() => validateSchemaDocuments(documents), /common riskDomain must contain exactly/);
});

test("rejects conflating risk domains with content pillars", () => {
  const documents = freshDocuments();
  const common = documents.get("common.schema.json");
  common.$defs.riskDomain.enum = [...common.$defs.contentDomain.enum];

  assert.throws(() => validateSchemaDocuments(documents), /common riskDomain must contain exactly/);
});

test("rejects removal of material-claim risk metadata", () => {
  const documents = freshDocuments();
  const claim = documents.get("common.schema.json").$defs.claim;
  claim.required = claim.required.filter((key) => key !== "riskClass");

  assert.throws(() => validateSchemaDocuments(documents), /common claim must require riskClass/);
});

test("rejects removal of page-level risk-domain metadata", () => {
  const documents = freshDocuments();
  const pageMetadata = documents.get("common.schema.json").$defs.pageMetadata;
  pageMetadata.required = pageMetadata.required.filter((key) => key !== "riskDomains");

  assert.throws(
    () => validateSchemaDocuments(documents),
    /common pageMetadata must require riskDomains/,
  );
});

test("rejects removal of page-level content-domain metadata", () => {
  const documents = freshDocuments();
  const pageMetadata = documents.get("common.schema.json").$defs.pageMetadata;
  pageMetadata.required = pageMetadata.required.filter((key) => key !== "contentDomains");

  assert.throws(
    () => validateSchemaDocuments(documents),
    /common pageMetadata must require contentDomains/,
  );
});

test("rejects wiring page content domains to the risk-domain vocabulary", () => {
  const documents = freshDocuments();
  const pageMetadata = documents.get("common.schema.json").$defs.pageMetadata;
  pageMetadata.properties.contentDomains.items.$ref = "#/$defs/riskDomain";

  assert.throws(
    () => validateSchemaDocuments(documents),
    /common pageMetadata contentDomains items must reference .*contentDomain/,
  );
});

test("rejects a page risk class disconnected from the controlled vocabulary", () => {
  const documents = freshDocuments();
  documents.get("common.schema.json").$defs.pageMetadata.properties.riskClass = {
    type: "string",
  };

  assert.throws(
    () => validateSchemaDocuments(documents),
    /common pageMetadata riskClass must reference .*riskClass/,
  );
});

test("rejects non-unique claim risk domains", () => {
  const documents = freshDocuments();
  documents.get("common.schema.json").$defs.claim.properties.riskDomains.uniqueItems = false;

  assert.throws(
    () => validateSchemaDocuments(documents),
    /common claim riskDomains must be a nonempty unique array/,
  );
});

test("rejects wiring claim risk domains to the content-domain vocabulary", () => {
  const documents = freshDocuments();
  const claim = documents.get("common.schema.json").$defs.claim;
  claim.properties.riskDomains.items.$ref = "#/$defs/contentDomain";

  assert.throws(
    () => validateSchemaDocuments(documents),
    /common claim riskDomains items must reference .*riskDomain/,
  );
});

test("rejects editorial lifecycle drift", () => {
  const documents = freshDocuments();
  const states = documents.get("common.schema.json").$defs.editorial.properties.status.enum;
  states.splice(states.indexOf("blocked_evidence"), 1);

  assert.throws(
    () => validateSchemaDocuments(documents),
    /common editorial status must contain exactly/,
  );
});

test("rejects removal of a required editorial signoff lane", () => {
  const documents = freshDocuments();
  const signoffs = documents.get("common.schema.json").$defs.editorial.properties.signoffs;
  signoffs.required = signoffs.required.filter((role) => role !== "safety");

  assert.throws(
    () => validateSchemaDocuments(documents),
    /common editorial signoffs must require safety/,
  );
});

test("binds every editorial signoff lane to its exact reviewer role", () => {
  const validator = getValidator("common.schema.json#/$defs/editorial/properties/signoffs");
  const signoffs = {
    cultivation: reviewerFixture("cultivation", "approved"),
    evidence: reviewerFixture("evidence", "approved"),
    productTruth: reviewerFixture("product_truth", "approved"),
    copyAccessibility: reviewerFixture("copy_accessibility", "approved"),
    seoTechnical: reviewerFixture("seo_technical", "approved"),
    safety: reviewerFixture("safety", "approved"),
  };
  assert.equal(validator(signoffs), true, JSON.stringify(validator.errors));
  assert.equal(
    validator({ ...signoffs, productTruth: reviewerFixture("cultivation", "approved") }),
    false,
  );

  const weakened = freshDocuments();
  const productTruthSlot =
    weakened.get("common.schema.json").$defs.editorial.properties.signoffs.properties.productTruth;
  const roleConstraint = productTruthSlot.allOf.find((branch) => branch.then)?.then.properties.role;
  roleConstraint.const = "cultivation";
  assert.throws(
    () => validateSchemaDocuments(weakened),
    /productTruth signoff slot must require role product_truth/,
  );
});

test("rejects removal of the publication approval gate", () => {
  const documents = freshDocuments();
  documents.get("common.schema.json").$defs.editorial.allOf = [];

  assert.throws(
    () => validateSchemaDocuments(documents),
    /must require approved publication signoffs with bounded safety N\/A/,
  );
});

test("rejects a zero-product safety exception that still permits a product action", () => {
  const documents = freshDocuments();
  const conversion = documents.get("common.schema.json").$defs.conversion;
  const safetyBranch = conversion.oneOf.find(
    (branch) => branch.properties.mode.const === "safety_only",
  );
  safetyBranch.properties.productAction = { $ref: "#/$defs/productAction" };

  assert.throws(
    () => validateSchemaDocuments(documents),
    /safety-only conversion must require a reason and prohibit a product action/,
  );
});

test("rejects an ordinary zero-product conversion that permits a product action", () => {
  const documents = freshDocuments();
  const conversion = documents.get("common.schema.json").$defs.conversion;
  const nonProductBranch = conversion.oneOf.find(
    (branch) => branch.properties.mode.const === "non_product_only",
  );
  nonProductBranch.properties.productAction = { $ref: "#/$defs/productAction" };

  assert.throws(
    () => validateSchemaDocuments(documents),
    /non-product conversion must prohibit a product action/,
  );
});

test("rejects making the ordinary zero-product reason mandatory", () => {
  const documents = freshDocuments();
  const conversion = documents.get("common.schema.json").$defs.conversion;
  const nonProductBranch = conversion.oneOf.find(
    (branch) => branch.properties.mode.const === "non_product_only",
  );
  nonProductBranch.required.push("nonProductReason");

  assert.throws(
    () => validateSchemaDocuments(documents),
    /non-product conversion must prohibit a product action and keep its reason optional/,
  );
});

test("rejects a safety-only conversion without a required safety reason", () => {
  const documents = freshDocuments();
  const conversion = documents.get("common.schema.json").$defs.conversion;
  const safetyBranch = conversion.oneOf.find(
    (branch) => branch.properties.mode.const === "safety_only",
  );
  safetyBranch.required = safetyBranch.required.filter((key) => key !== "safetyReason");

  assert.throws(
    () => validateSchemaDocuments(documents),
    /safety-only conversion must require a reason and prohibit a product action/,
  );
});

test("rejects equipment sources represented as blanket global support", () => {
  const documents = freshDocuments();
  const allowedSources =
    documents.get("equipment.schema.json").properties.verdantDataPath.properties.allowedSources;
  delete allowedSources.type;
  delete allowedSources.minItems;
  delete allowedSources.items;
  delete allowedSources.uniqueItems;
  allowedSources.const = ["live", "manual", "csv", "demo", "stale", "invalid"];

  assert.throws(
    () => validateSchemaDocuments(documents),
    /equipment allowedSources must be a nonempty unique subset/,
  );
});

test("rejects unsupported equipment source labels", () => {
  const documents = freshDocuments();
  const allowedSources =
    documents.get("equipment.schema.json").properties.verdantDataPath.properties.allowedSources;
  allowedSources.items.enum.push("api");

  assert.throws(
    () => validateSchemaDocuments(documents),
    /equipment allowedSources must be a nonempty unique subset/,
  );
});

test("rejects an equipment source contract that permits an empty subset", () => {
  const documents = freshDocuments();
  const allowedSources =
    documents.get("equipment.schema.json").properties.verdantDataPath.properties.allowedSources;
  allowedSources.minItems = 0;

  assert.throws(
    () => validateSchemaDocuments(documents),
    /equipment allowedSources must be a nonempty unique subset/,
  );
});

test("strictly compiles all five Draft 2020-12 schemas with formats", () => {
  const compiled = compileSchemaDocuments(freshDocuments());
  assert.equal(compiled.validators.size, 5);
  for (const [fileName, validator] of compiled.validators) {
    assert.equal(typeof validator, "function", `${fileName} must compile to a validator`);
  }
});

test("pins the canonical page-owning node vocabulary at schema and instance level", () => {
  const validator = getValidator("common.schema.json#/$defs/pageOwningNodeType");
  const expected = ["Topic", "Cultivar", "Sensor", "Condition", "Protocol", "Equipment", "Method"];

  for (const nodeType of expected) assert.equal(validator(nodeType), true, nodeType);
  for (const supportingType of ["Claim", "Observation", "EvidenceSource", "Stage"])
    assert.equal(validator(supportingType), false, supportingType);

  const documents = freshDocuments();
  documents.get("common.schema.json").$defs.pageOwningNodeType.enum.push("Claim");
  assert.throws(
    () => validateSchemaDocuments(documents),
    /common pageOwningNodeType must contain exactly/,
  );
});

test("accepts all 34 edge contracts through schema and runtime semantic validation", () => {
  const graphEdgeValidator = getValidator("common.schema.json#/$defs/graphEdge");
  assert.equal(Object.keys(EDGE_CONTRACTS).length, 34);

  for (const edgeType of Object.keys(EDGE_CONTRACTS)) {
    const edge = activeEdgeFixture(edgeType);
    assert.deepEqual(validateGraphEdgeSemantics(edge), { status: "pass", edgeType });
    assert.equal(
      graphEdgeValidator(edge),
      true,
      `${edgeType}: ${JSON.stringify(graphEdgeValidator.errors)}`,
    );
  }
});

test("rejects invalid endpoint, cardinality, and symmetry values across the edge matrix", () => {
  for (const [edgeType, contract] of Object.entries(EDGE_CONTRACTS)) {
    const wrongSource = activeEdgeFixture(edgeType);
    wrongSource.sourceType = "UnknownNode";
    assert.throws(
      () => validateGraphEdgeSemantics(wrongSource),
      new RegExp(`graph edge ${edgeType} has invalid sourceType`),
    );

    const wrongTarget = activeEdgeFixture(edgeType);
    wrongTarget.targetType = "UnknownNode";
    assert.throws(
      () => validateGraphEdgeSemantics(wrongTarget),
      new RegExp(`graph edge ${edgeType} has invalid targetType`),
    );

    const wrongCardinality = activeEdgeFixture(edgeType);
    wrongCardinality.cardinality =
      contract.cardinality === "many_to_many" ? "one_to_one" : "many_to_many";
    assert.throws(
      () => validateGraphEdgeSemantics(wrongCardinality),
      new RegExp(`graph edge ${edgeType} has invalid cardinality`),
    );

    const wrongSymmetry = activeEdgeFixture(edgeType);
    wrongSymmetry.symmetric = !contract.symmetric;
    assert.throws(
      () => validateGraphEdgeSemantics(wrongSymmetry),
      new RegExp(`graph edge ${edgeType} has invalid symmetry`),
    );
  }
});

test("requires claim/source provenance on active empirical edges", () => {
  const edge = activeEdgeFixture("measured_by");
  edge.provenance.claimIds = [];
  assert.throws(
    () => validateGraphEdgeSemantics(edge),
    /active empirical graph edge measured_by requires claim and source provenance/,
  );

  edge.provenance.claimIds = ["claim:test:1"];
  edge.provenance.sourceIds = [];
  assert.throws(
    () => validateGraphEdgeSemantics(edge),
    /active empirical graph edge measured_by requires claim and source provenance/,
  );
});

test("requires reviewer provenance on active editorial edges", () => {
  const edge = activeEdgeFixture("next_step");
  edge.provenance.reviewerIds = [];
  assert.throws(
    () => validateGraphEdgeSemantics(edge),
    /active editorial graph edge next_step requires reviewer provenance/,
  );
});

test("requires supersedes edges to preserve node type", () => {
  const edge = activeEdgeFixture("supersedes");
  edge.sourceType = "Topic";
  edge.targetType = "Method";
  assert.throws(
    () => validateGraphEdgeSemantics(edge),
    /graph edge supersedes must connect nodes of the same type/,
  );
});

test("rejects a missing, duplicate, or drifted graph-edge semantic branch", () => {
  {
    const documents = freshDocuments();
    documents.get("common.schema.json").$defs.graphEdge.oneOf.pop();
    assert.throws(
      () => validateSchemaDocuments(documents),
      /common graphEdge must define exactly 34 semantic branches/,
    );
  }
  {
    const documents = freshDocuments();
    const common = documents.get("common.schema.json");
    edgeBranch(common, "related_to").properties.type.const = "parent_of";
    assert.throws(
      () => validateSchemaDocuments(documents),
      /semantic branches must use unique edge-type constants/,
    );
  }
  {
    const documents = freshDocuments();
    const common = documents.get("common.schema.json");
    edgeBranch(common, "next_action").properties.cardinality.const = "many_to_many";
    assert.throws(
      () => validateSchemaDocuments(documents),
      /next_action branch must match its endpoint\/cardinality\/symmetry contract/,
    );
  }
});

test("rejects weakened active-edge provenance classes in the schema", () => {
  {
    const documents = freshDocuments();
    const graphEdge = documents.get("common.schema.json").$defs.graphEdge;
    const empirical = graphEdge.allOf.find((entry) =>
      entry.if?.properties?.type?.enum?.includes("measured_by"),
    );
    empirical.then.properties.provenance.properties.sourceIds.minItems = 0;
    assert.throws(
      () => validateSchemaDocuments(documents),
      /active empirical edges must require claim and source provenance/,
    );
  }
  {
    const documents = freshDocuments();
    const graphEdge = documents.get("common.schema.json").$defs.graphEdge;
    const editorial = graphEdge.allOf.find((entry) =>
      entry.if?.properties?.type?.enum?.includes("next_step"),
    );
    editorial.then.properties.provenance.properties.reviewerIds.minItems = 0;
    assert.throws(
      () => validateSchemaDocuments(documents),
      /active editorial edges must require reviewer provenance/,
    );
  }
});

test("keeps accession, batch, and plant screening scopes explicit and non-interchangeable", () => {
  const validator = getValidator("cultivar.schema.json#/$defs/subjectScope");
  assert.equal(
    validator({
      subjectType: "accession",
      accessionId: "accession-public-1",
      batchId: null,
      plantId: null,
    }),
    true,
  );
  assert.equal(validator(batchHealthScope()), true);
  assert.equal(
    validator({
      subjectType: "plant",
      accessionId: "accession-public-1",
      batchId: "batch-public-1",
      plantId: "plant-public-1",
    }),
    true,
  );
  assert.equal(
    validator({
      subjectType: "batch",
      accessionId: null,
      batchId: null,
      plantId: "plant-public-1",
    }),
    false,
  );
  assert.equal(
    validator({
      subjectType: "accession",
      accessionId: "accession-public-1",
      batchId: "batch-public-1",
      plantId: null,
    }),
    false,
  );
});

test("requires immutable screening evidence and distinguishes correction from retest", () => {
  const validator = getValidator("cultivar.schema.json#/$defs/screeningEvent");
  const definitive = screeningEvent("negative", "screening:hlvd:negative-1");
  for (const result of ["negative", "positive", "inconclusive"]) {
    assert.equal(
      validator({ ...definitive, result }),
      true,
      `${result}: ${JSON.stringify(validator.errors)}`,
    );
  }
  for (const missingField of ["sampleId", "collectedOn", "resultedOn", "methodId"]) {
    assert.equal(validator({ ...definitive, [missingField]: null }), false, missingField);
  }
  assert.equal(validator({ ...definitive, sourceLinks: [] }), false);
  assert.equal(
    validator(screeningEvent("not_tested", "screening:hlvd:not-tested-1")),
    true,
    JSON.stringify(validator.errors),
  );
  const correction = screeningEvent("negative", "screening:hlvd:correction-1", {
    supersedesEventId: definitive.eventId,
    correctionReason: "Correct a transcribed laboratory result identifier.",
  });
  assert.equal(validator(correction), true, JSON.stringify(validator.errors));
  assert.equal(validator({ ...correction, correctionReason: null }), false);
  const retest = screeningEvent("positive", "screening:hlvd:positive-retest-1", {
    collectedOn: "2026-08-05",
    resultedOn: "2026-08-06",
    recordedOn: "2026-08-06T12:00:00Z",
    retestOfEventIds: [definitive.eventId],
  });
  assert.equal(validator(retest), true, JSON.stringify(validator.errors));
});

test("requires explicit quarantine releases and keeps overrides visibly non-clearance", () => {
  const validator = getValidator("cultivar.schema.json#/$defs/quarantineEvent");
  assert.equal(
    validator(quarantineEvent("release", "quarantine:event:release-1")),
    true,
    JSON.stringify(validator.errors),
  );
  assert.equal(
    validator(
      quarantineEvent("release", "quarantine:event:release-1", {
        screeningEventIds: [],
      }),
    ),
    false,
  );
  assert.equal(
    validator(quarantineEvent("override", "quarantine:event:override-1")),
    true,
    JSON.stringify(validator.errors),
  );
  assert.equal(
    validator(
      quarantineEvent("override", "quarantine:event:override-1", {
        screeningEventIds: ["screening:hlvd:negative-1"],
      }),
    ),
    false,
  );
});

test("derives scoped cultivar health disposition from append-only histories", () => {
  const released = cultivarHealthFixture();
  assert.deepEqual(validateCultivarHealthSemantics(released), {
    status: "pass",
    screeningEventCount: 1,
    quarantineEventCount: 2,
    subjectCount: 1,
  });
  assert.equal(
    released.identity.provenance.currentHealthDisposition.subjects[0].screeningState,
    "negative_scoped",
  );
  assert.equal(
    released.identity.provenance.currentHealthDisposition.subjects[0].quarantineState,
    "released",
  );

  const untested = cultivarHealthFixture({ screenings: [], quarantines: [] });
  assert.deepEqual(validateCultivarHealthSemantics(untested), {
    status: "pass",
    screeningEventCount: 0,
    quarantineEventCount: 0,
    subjectCount: 1,
  });
  assert.equal(
    untested.identity.provenance.currentHealthDisposition.subjects[0].screeningState,
    "untested",
  );
  assert.equal(
    untested.identity.provenance.currentHealthDisposition.subjects[0].quarantineState,
    "not_started",
  );

  const negative = screeningEvent("negative", "screening:hlvd:negative-1");
  const positiveRetest = screeningEvent("positive", "screening:hlvd:positive-retest-1", {
    collectedOn: "2026-08-05",
    resultedOn: "2026-08-06",
    recordedOn: "2026-08-06T12:00:00Z",
    retestOfEventIds: [negative.eventId],
  });
  const discordant = cultivarHealthFixture({
    screenings: [negative, positiveRetest],
    quarantines: [],
  });
  assert.deepEqual(validateCultivarHealthSemantics(discordant), {
    status: "pass",
    screeningEventCount: 2,
    quarantineEventCount: 0,
    subjectCount: 1,
  });
  const summary = discordant.identity.provenance.currentHealthDisposition.subjects[0];
  assert.equal(summary.screeningState, "positive");
  assert.equal(summary.discordanceState, "historical_conflict");
  assert.deepEqual(summary.conflictingScreeningEventIds, [
    "screening:hlvd:negative-1",
    "screening:hlvd:positive-retest-1",
  ]);
});

test("keeps quarantine open while any scoped episode remains active", () => {
  const stillOpen = quarantineEvent("open", "quarantine:event:open-still-active", {
    episodeId: "quarantine:episode:still-active",
    occurredOn: "2026-07-31T12:00:00Z",
  });
  const laterOpen = quarantineEvent("open", "quarantine:event:open-later-released", {
    episodeId: "quarantine:episode:later-released",
    occurredOn: "2026-08-01T00:00:00Z",
  });
  const laterRelease = quarantineEvent("release", "quarantine:event:release-later", {
    episodeId: "quarantine:episode:later-released",
    occurredOn: "2026-08-03T12:00:00Z",
  });
  const record = cultivarHealthFixture({
    screenings: [
      screeningEvent("negative", "screening:hlvd:negative-1", {
        collectedOn: "2026-08-02",
        resultedOn: "2026-08-02",
        recordedOn: "2026-08-02T12:00:00Z",
      }),
    ],
    quarantines: [stillOpen, laterOpen, laterRelease],
  });
  const disposition = record.identity.provenance.currentHealthDisposition.subjects[0];

  assert.equal(disposition.quarantineState, "open");
  assert.deepEqual(disposition.currentQuarantineEventIds, [
    "quarantine:event:open-still-active",
    "quarantine:event:release-later",
  ]);
  assert.deepEqual(validateCultivarHealthSemantics(record), {
    status: "pass",
    screeningEventCount: 1,
    quarantineEventCount: 3,
    subjectCount: 1,
  });
});

test("projects the terminal event from every quarantine episode", () => {
  const firstOpen = quarantineEvent("open", "quarantine:event:open-first", {
    episodeId: "quarantine:episode:first",
    occurredOn: "2026-07-31T12:00:00Z",
  });
  const secondOpen = quarantineEvent("open", "quarantine:event:open-second", {
    episodeId: "quarantine:episode:second",
    occurredOn: "2026-08-01T00:00:00Z",
  });
  const firstRelease = quarantineEvent("release", "quarantine:event:release-first", {
    episodeId: "quarantine:episode:first",
    occurredOn: "2026-08-03T12:00:00Z",
  });
  const secondDispose = quarantineEvent("dispose", "quarantine:event:dispose-second", {
    episodeId: "quarantine:episode:second",
    occurredOn: "2026-08-04T12:00:00Z",
  });
  const record = cultivarHealthFixture({
    quarantines: [firstOpen, secondOpen, firstRelease, secondDispose],
  });
  const disposition = record.identity.provenance.currentHealthDisposition.subjects[0];

  assert.equal(disposition.quarantineState, "disposed");
  assert.deepEqual(disposition.currentQuarantineEventIds, [
    "quarantine:event:dispose-second",
    "quarantine:event:release-first",
  ]);
  assert.deepEqual(validateCultivarHealthSemantics(record), {
    status: "pass",
    screeningEventCount: 1,
    quarantineEventCount: 4,
    subjectCount: 1,
  });
});

test("fails cultivar release closed when screening evidence is stale, scoped wrong, or contradicted", () => {
  {
    const negative = screeningEvent("negative", "screening:hlvd:negative-1", {
      collectedOn: "2026-07-01",
      resultedOn: "2026-07-02",
      recordedOn: "2026-07-02T12:00:00Z",
    });
    const invalid = cultivarHealthFixture({ screenings: [negative] });
    assert.throws(
      () => validateCultivarHealthSemantics(invalid),
      /relies on pre-quarantine evidence/,
    );
  }
  {
    const futureNegative = screeningEvent("negative", "screening:hlvd:negative-1", {
      collectedOn: "2026-08-02",
      resultedOn: "2026-08-03",
      recordedOn: "2026-08-04T12:00:00Z",
    });
    const invalid = cultivarHealthFixture({ screenings: [futureNegative] });
    assert.throws(
      () => validateCultivarHealthSemantics(invalid),
      /relies on evidence that was not recorded before release/,
    );
  }
  {
    const plantScope = {
      subjectType: "plant",
      accessionId: "accession-public-1",
      batchId: "batch-public-1",
      plantId: "plant-public-1",
    };
    const negative = screeningEvent("negative", "screening:hlvd:negative-1", {
      scope: plantScope,
    });
    const invalid = cultivarHealthFixture({
      screenings: [negative],
      healthSubjects: [
        { scope: batchHealthScope(), target: "Hop latent viroid" },
        { scope: plantScope, target: "Hop latent viroid" },
      ],
    });
    assert.throws(() => validateCultivarHealthSemantics(invalid), /mismatched screening evidence/);
  }
  {
    const negative = screeningEvent("negative", "screening:hlvd:negative-1");
    const positive = screeningEvent("positive", "screening:hlvd:positive-1", {
      collectedOn: "2026-08-02",
      resultedOn: "2026-08-02",
      recordedOn: "2026-08-02T12:00:01Z",
      retestOfEventIds: [negative.eventId],
    });
    const invalid = cultivarHealthFixture({ screenings: [negative, positive] });
    assert.throws(
      () => validateCultivarHealthSemantics(invalid),
      /blocked by contradictory evidence/,
    );
  }
  {
    const negative = screeningEvent("negative", "screening:hlvd:negative-1");
    const correction = screeningEvent("positive", "screening:hlvd:correction-1", {
      recordedOn: "2026-08-02T12:00:01Z",
      supersedesEventId: negative.eventId,
      correctionReason: "Correct the result after the laboratory amended its report.",
    });
    const invalid = cultivarHealthFixture({ screenings: [negative, correction] });
    assert.throws(
      () => validateCultivarHealthSemantics(invalid),
      /lacks a current scoped negative/,
    );
  }
  {
    const invalid = cultivarHealthFixture({
      quarantines: [
        quarantineEvent("open", "quarantine:event:open-1"),
        quarantineEvent("release", "quarantine:event:release-1"),
        quarantineEvent("reopen", "quarantine:event:reopen-1"),
        quarantineEvent("release", "quarantine:event:release-2", {
          occurredOn: "2026-08-05T12:00:00Z",
        }),
      ],
    });
    assert.throws(
      () => validateCultivarHealthSemantics(invalid),
      /relies on pre-quarantine evidence/,
    );
  }
});

test("requires release evidence to be demonstrably later than the latest quarantine open", () => {
  const sameDayNegative = screeningEvent("negative", "screening:hlvd:negative-1", {
    collectedOn: "2026-07-31",
    resultedOn: "2026-08-01",
    recordedOn: "2026-08-01T12:00:00Z",
  });
  const ambiguous = cultivarHealthFixture({ screenings: [sameDayNegative] });
  assert.throws(
    () => validateCultivarHealthSemantics(ambiguous),
    /release .* cannot prove that date-only collection evidence followed the latest open/,
  );

  const nextDayNegative = screeningEvent("negative", "screening:hlvd:negative-1", {
    collectedOn: "2026-08-01",
    resultedOn: "2026-08-02",
    recordedOn: "2026-08-02T12:00:00Z",
  });
  const demonstrablyLater = cultivarHealthFixture({ screenings: [nextDayNegative] });
  assert.deepEqual(validateCultivarHealthSemantics(demonstrablyLater), {
    status: "pass",
    screeningEventCount: 1,
    quarantineEventCount: 2,
    subjectCount: 1,
  });
});

test("requires corrections and retests to chronologically follow every referenced event", () => {
  const prior = screeningEvent("negative", "screening:hlvd:negative-1");
  const referenceShapes = [
    {
      supersedesEventId: prior.eventId,
      correctionReason: "Correct the result after the laboratory amended its report.",
    },
    { retestOfEventIds: [prior.eventId] },
  ];

  for (const reference of referenceShapes) {
    for (const chronology of [
      { collectedOn: "2026-07-31", recordedOn: "2026-08-03T12:00:00Z" },
      {
        collectedOn: "2026-08-01",
        resultedOn: "2026-08-01",
        recordedOn: "2026-08-03T12:00:00Z",
      },
      { recordedOn: "2026-08-02T11:59:59Z" },
      { recordedOn: "2026-08-02T12:00:00Z" },
    ]) {
      const successor = screeningEvent("negative", "screening:hlvd:successor-1", {
        ...reference,
        ...chronology,
      });
      const invalid = cultivarHealthFixture({
        screenings: [prior, successor],
        quarantines: [],
      });
      assert.throws(
        () => validateCultivarHealthSemantics(invalid),
        /must chronologically follow referenced screening event/,
      );
    }

    const successor = screeningEvent("negative", "screening:hlvd:successor-1", {
      ...reference,
      recordedOn: "2026-08-02T12:00:01Z",
    });
    const valid = cultivarHealthFixture({ screenings: [prior, successor], quarantines: [] });
    assert.deepEqual(validateCultivarHealthSemantics(valid), {
      status: "pass",
      screeningEventCount: 2,
      quarantineEventCount: 0,
      subjectCount: 1,
    });
  }
});

test("rejects cultivar history reference, source, sequence, and projection drift", () => {
  {
    const invalid = cultivarHealthFixture();
    invalid.identity.provenance.screeningHistory[0].sourceLinks[0].sourceId = "source:missing:1";
    assert.throws(() => validateCultivarHealthSemantics(invalid), /missing source/);
  }
  {
    const retest = screeningEvent("positive", "screening:hlvd:positive-retest-1", {
      retestOfEventIds: ["screening:hlvd:negative-1"],
    });
    const base = screeningEvent("negative", "screening:hlvd:negative-1");
    const invalid = cultivarHealthFixture({
      screenings: [retest, base],
      quarantines: [],
    });
    assert.throws(() => validateCultivarHealthSemantics(invalid), /invalid prior-event reference/);
  }
  {
    const invalid = cultivarHealthFixture({
      screenings: [
        screeningEvent("negative", "screening:hlvd:negative-1"),
        screeningEvent("negative", "screening:hlvd:negative-1"),
      ],
      quarantines: [],
    });
    assert.throws(() => validateCultivarHealthSemantics(invalid), /repeats eventId/);
  }
  {
    const invalid = cultivarHealthFixture();
    invalid.identity.provenance.currentHealthDisposition.subjects[0].screeningState = "positive";
    assert.throws(() => validateCultivarHealthSemantics(invalid), /has drifted/);
  }
  {
    const invalid = cultivarHealthFixture({
      quarantines: [quarantineEvent("release", "quarantine:event:release-1")],
    });
    assert.throws(() => validateCultivarHealthSemantics(invalid), /must begin with open/);
  }
});

test("preserves cultivar screening and quarantine histories across revisions", () => {
  const previous = cultivarHealthFixture();
  const current = structuredClone(previous);
  current.identity.provenance.screeningHistory.push(
    screeningEvent("positive", "screening:hlvd:positive-retest-1", {
      collectedOn: "2026-08-05",
      resultedOn: "2026-08-06",
      recordedOn: "2026-08-06T12:00:00Z",
      retestOfEventIds: ["screening:hlvd:negative-1"],
    }),
  );
  assert.deepEqual(validateCultivarHistoryAppendOnly(previous, current), {
    status: "pass",
    appendedCount: 1,
  });
  const edited = structuredClone(current);
  edited.identity.provenance.screeningHistory[0].result = "positive";
  assert.throws(
    () => validateCultivarHistoryAppendOnly(previous, edited),
    /must preserve prior events/,
  );
  const deleted = structuredClone(previous);
  deleted.identity.provenance.quarantineHistory.pop();
  assert.throws(
    () => validateCultivarHistoryAppendOnly(previous, deleted),
    /cannot delete prior events/,
  );
  const reordered = structuredClone(previous);
  reordered.identity.provenance.quarantineHistory.reverse();
  assert.throws(
    () => validateCultivarHistoryAppendOnly(previous, reordered),
    /must preserve prior events/,
  );
});

test("rejects weakening cultivar health-history contracts", () => {
  {
    const documents = freshDocuments();
    documents.get("cultivar.schema.json").$defs.screeningEvent.allOf = [];
    assert.throws(
      () => validateSchemaDocuments(documents),
      /definitive screening results must require sample, dates, method, and source/,
    );
  }
  {
    const documents = freshDocuments();
    const provenance =
      documents.get("cultivar.schema.json").properties.identity.properties.provenance;
    provenance.properties.pathogenScreening = { type: "string" };
    assert.throws(
      () => validateSchemaDocuments(documents),
      /must not retain mutable quarantine or pathogen status fields/,
    );
  }
  {
    const documents = freshDocuments();
    const release = documents
      .get("cultivar.schema.json")
      .$defs.quarantineEvent.allOf.find((entry) => entry.if.properties.action.const === "release");
    release.then.properties.screeningEventIds.minItems = 0;
    assert.throws(
      () => validateSchemaDocuments(documents),
      /quarantine release must require scoped screening evidence/,
    );
  }
  {
    const documents = freshDocuments();
    documents
      .get("cultivar.schema.json")
      .$defs.healthDispositionSubject.properties.screeningState.enum.push("pathogen_free");
    assert.throws(
      () => validateSchemaDocuments(documents),
      /cultivar scoped screening state must contain exactly/,
    );
  }
});

test("pins all sensor metric keys to canonical metric and unit identities", () => {
  const validator = getValidator("sensor.schema.json#/$defs/metricContract");
  for (const [metricKey, contract] of Object.entries(SENSOR_METRIC_CONTRACTS)) {
    const tuple = { metricKey, metricId: contract.metricId, unitId: contract.unitId };
    assert.equal(validator(tuple), true, `${metricKey}: ${JSON.stringify(validator.errors)}`);
    assert.equal(validator({ ...tuple, metricId: "metric:wrong" }), false, metricKey);
    assert.equal(validator({ ...tuple, unitId: "unit:wrong" }), false, metricKey);
  }
});

test("models direct, internal-derived, and vendor-derived sensor truth per metric", () => {
  const validator = getValidator("sensor.schema.json#/properties/measurements");
  const directTemperature = directSensorMeasurement("air_temp_c");
  const directHumidity = directSensorMeasurement("humidity_pct");
  const directLeafTemperature = directSensorMeasurement("leaf_temp_c");
  const derivedVpd = derivedVpdMeasurement("vpd_kpa");
  const derivedLeafVpd = derivedVpdMeasurement("leaf_vpd_kpa");
  const vendorVpd = {
    ...structuredClone(derivedVpd),
    directOrDerived: "vendor_derived",
    vpdBasis: "vendor",
    derivation: {
      ...structuredClone(derivedVpd.derivation),
      formulaExpression: null,
      vendorMethodSourceId: "source:vendor-vpd-method:1",
    },
  };

  assert.equal(
    validator([directTemperature, directHumidity, derivedVpd]),
    true,
    JSON.stringify(validator.errors),
  );
  assert.equal(
    validator([directTemperature, directHumidity, vendorVpd]),
    true,
    JSON.stringify(validator.errors),
  );
  assert.equal(
    validator([directTemperature, directHumidity, directLeafTemperature, derivedLeafVpd]),
    true,
    JSON.stringify(validator.errors),
  );
  assert.equal(
    validator([{ ...directTemperature, derivation: structuredClone(derivedVpd.derivation) }]),
    false,
  );
  assert.equal(validator([directTemperature, { ...derivedVpd, directOrDerived: "direct" }]), false);
  assert.equal(validator([{ ...derivedVpd, vpdBasis: "vendor" }]), false);
  assert.equal(validator([{ ...vendorVpd, vpdBasis: "air" }]), false);
  const missingRhInput = structuredClone(derivedVpd);
  missingRhInput.derivation.inputs.pop();
  assert.equal(validator([missingRhInput]), false);
  const vendorWithoutSource = structuredClone(vendorVpd);
  vendorWithoutSource.derivation.vendorMethodSourceId = null;
  assert.equal(validator([vendorWithoutSource]), false);
  assert.equal(validator([]), false);
});

test("requires actual high-RH comparison evidence for humidity and every VPD page", () => {
  const validator = getValidator("sensor.schema.json#/$defs/highRhCheck");
  const humidityConditional = getValidator("sensor.schema.json#/allOf/1");
  const check = sensorSemanticFixture().calibration.highRhCheck;

  assert.equal(validator({ ...check, targetRelativeHumidityPct: 74.9 }), false);
  assert.equal(validator({ ...check, targetRelativeHumidityPct: 75 }), true);
  assert.equal(validator({ ...check, targetRelativeHumidityPct: 100 }), true);
  assert.equal(validator({ ...check, targetRelativeHumidityPct: 100.1 }), false);
  assert.equal(validator({ ...check, referenceRelativeHumidityPct: 74.9 }), false);
  assert.equal(
    validator({
      ...check,
      adjustmentPerformed: true,
      deviceAsLeftRelativeHumidityPct: 80,
      asLeftDeviationPctPoints: 0,
    }),
    true,
  );
  assert.equal(
    validator({
      ...check,
      adjustmentPerformed: false,
      deviceAsLeftRelativeHumidityPct: 80,
      asLeftDeviationPctPoints: 0,
    }),
    false,
  );
  for (const metricKey of ["humidity_pct", "vpd_kpa", "leaf_vpd_kpa"]) {
    assert.equal(
      humidityConditional({
        measurements: [{ metricKey }],
        calibration: { highRhCheck: null },
      }),
      false,
      metricKey,
    );
    assert.equal(
      humidityConditional({
        measurements: [{ metricKey }],
        calibration: { highRhCheck: check },
      }),
      true,
      `${metricKey}: ${JSON.stringify(humidityConditional.errors)}`,
    );
  }
});

test("requires a structured measured leaf-temperature basis for air and leaf VPD", () => {
  const anyVpdConditional = getValidator("sensor.schema.json#/allOf/2");
  const airConditional = getValidator("sensor.schema.json#/allOf/3");
  const leafConditional = getValidator("sensor.schema.json#/allOf/4");
  const fixture = sensorSemanticFixture();
  const basis = fixture.calibration.leafTemperatureBasis;
  const commonCalibration = {
    verificationStatus: "current",
    currentVerificationId: fixture.calibration.currentVerificationId,
    leafTemperatureBasis: basis,
  };
  assert.equal(
    anyVpdConditional({
      measurements: [{ metricKey: "vpd_kpa" }],
      calibration: commonCalibration,
    }),
    true,
    JSON.stringify(anyVpdConditional.errors),
  );
  assert.equal(
    anyVpdConditional({
      measurements: [{ metricKey: "vpd_kpa" }],
      calibration: { ...commonCalibration, leafTemperatureBasis: null },
    }),
    false,
  );
  assert.equal(
    airConditional({
      measurements: [{ metricKey: "vpd_kpa" }],
      calibration: commonCalibration,
    }),
    true,
    JSON.stringify(airConditional.errors),
  );
  assert.equal(
    airConditional({
      measurements: [{ metricKey: "vpd_kpa" }],
      calibration: {
        ...commonCalibration,
        leafTemperatureBasis: {
          ...basis,
          applications: ["formula_input_for_leaf_vpd"],
        },
      },
    }),
    false,
  );
  assert.equal(
    leafConditional({
      measurements: [{ metricKey: "leaf_vpd_kpa" }],
      calibration: commonCalibration,
    }),
    true,
    JSON.stringify(leafConditional.errors),
  );
});

test("proves sensor derivation, calibration, and graph reciprocity semantically", () => {
  const fixture = sensorSemanticFixture();
  assert.deepEqual(validateSensorPageSemantics(fixture, { asOf: "2026-12-01T00:00:00Z" }), {
    status: "pass",
    measurementCount: 5,
    verificationCount: 1,
    capabilityCount: 2,
  });

  assert.throws(
    () => validateSensorPageSemantics(fixture),
    /authoritative sensor evidence requires an explicit asOf timestamp/,
  );

  {
    const invalid = structuredClone(fixture);
    invalid.measurements[0].unitId = "unit:fahrenheit";
    assert.throws(
      () => validateSensorPageSemantics(invalid, { asOf: "2026-12-01T00:00:00Z" }),
      /metric tuple mismatch/,
    );
  }
  {
    const invalid = structuredClone(fixture);
    invalid.measurements.push(structuredClone(invalid.measurements[0]));
    assert.throws(
      () => validateSensorPageSemantics(invalid, { asOf: "2026-12-01T00:00:00Z" }),
      /repeats metricKey/,
    );
  }
  {
    const invalid = structuredClone(fixture);
    invalid.pageManifest.graph.edges.push(
      sensorEdge("uses_unit", "metric:air-temperature", "Metric", "unit:fahrenheit", "Unit"),
    );
    assert.throws(
      () => validateSensorPageSemantics(invalid, { asOf: "2026-12-01T00:00:00Z" }),
      /exactly one active uses_unit/,
    );
  }
  {
    const invalid = structuredClone(fixture);
    invalid.pageManifest.graph.edges.push(
      sensorEdge(
        "measured_by",
        "metric:vpd-air",
        "Metric",
        invalid.deviceIdentity.sensorNodeId,
        "Sensor",
      ),
    );
    assert.throws(
      () => validateSensorPageSemantics(invalid, { asOf: "2026-12-01T00:00:00Z" }),
      /must not use measured_by/,
    );
  }
  {
    const invalid = structuredClone(fixture);
    invalid.pageManifest.graph.edges = invalid.pageManifest.graph.edges.filter(
      (edge) =>
        !(
          edge.type === "derived_from" &&
          edge.sourceId === "metric:vpd-air" &&
          edge.targetId === "metric:relative-humidity"
        ),
    );
    assert.throws(
      () => validateSensorPageSemantics(invalid, { asOf: "2026-12-01T00:00:00Z" }),
      /graph edges do not match/,
    );
  }
  {
    const invalid = structuredClone(fixture);
    const input = invalid.measurements.find((m) => m.metricKey === "vpd_kpa").derivation.inputs[0];
    input.capturedAt = "2026-08-01T12:00:00Z";
    assert.throws(
      () => validateSensorPageSemantics(invalid, { asOf: "2026-12-01T00:00:00Z" }),
      /freshness/,
    );
  }
  {
    const invalid = structuredClone(fixture);
    invalid.calibration.highRhCheck.asFoundDeviationPctPoints = 2;
    assert.throws(
      () => validateSensorPageSemantics(invalid, { asOf: "2026-12-01T00:00:00Z" }),
      /high-RH as-found deviation/,
    );
  }
  {
    const invalid = structuredClone(fixture);
    invalid.calibration.leafTemperatureBasis.offsetC = 1.5;
    assert.throws(
      () => validateSensorPageSemantics(invalid, { asOf: "2026-12-01T00:00:00Z" }),
      /leaf-temperature offset/,
    );
  }
  assert.throws(
    () =>
      validateSensorPageSemantics(fixture, {
        asOf: "2027-08-02T00:00:00Z",
      }),
    /marked current after its due date/,
  );

  {
    const invalid = structuredClone(fixture);
    invalid.calibration.verificationHistory[0].results[0].unitId = "unit:fahrenheit";
    assert.throws(
      () => validateSensorPageSemantics(invalid, { asOf: "2026-12-01T00:00:00Z" }),
      /verification result unit does not match the canonical metric unit/,
    );
  }
  {
    const invalid = structuredClone(fixture);
    invalid.calibration.verificationHistory[0].results[0].disposition = "limited";
    assert.throws(
      () => validateSensorPageSemantics(invalid, { asOf: "2026-12-01T00:00:00Z" }),
      /authoritative sensor evidence requires passing verification results/,
    );
  }
  {
    const invalid = structuredClone(fixture);
    invalid.pageManifest.graph.edges = invalid.pageManifest.graph.edges.filter(
      (edge) => !(edge.type === "uses_method" && edge.sourceId === "metric:vpd-air"),
    );
    assert.throws(
      () => validateSensorPageSemantics(invalid, { asOf: "2026-12-01T00:00:00Z" }),
      /requires exactly one active uses_method edge/,
    );
  }
  {
    const invalid = structuredClone(fixture);
    invalid.pageManifest.graph.edges.push(
      sensorEdge("uses_method", "metric:vpd-air", "Observation", "method:air-vpd:v1", "Method"),
    );
    assert.throws(
      () => validateSensorPageSemantics(invalid, { asOf: "2026-12-01T00:00:00Z" }),
      /requires exactly one active uses_method edge/,
    );
  }
  {
    const invalid = structuredClone(fixture);
    invalid.calibration.verificationHistory.push({
      ...structuredClone(invalid.calibration.verificationHistory[0]),
      verificationId: "verification:sensor:2026-11-01",
      verifiedAt: "2026-11-01T11:00:00Z",
      nextDueOn: "2027-11-01",
      supersedesVerificationId: "verification:sensor:2026-08-01",
    });
    assert.throws(
      () => validateSensorPageSemantics(invalid, { asOf: "2026-12-01T00:00:00Z" }),
      /currentVerificationId must reference the latest applicable verification/,
    );
  }
});

test("resolves every structured sensor evidence-source identity", () => {
  const fixture = sensorSemanticFixture();
  const duplicateSourceIdentity = structuredClone(fixture);
  duplicateSourceIdentity.sources.push({
    nodeId: "source:device-manual:1",
    label: "Ambiguous duplicate identity",
  });
  assert.throws(
    () =>
      validateSensorPageSemantics(duplicateSourceIdentity, {
        asOf: "2026-12-01T00:00:00Z",
      }),
    /must not repeat a source node/,
  );
  const cases = [
    ["device manual", (page) => (page.deviceIdentity.manualSourceId = "source:missing:1")],
    [
      "verification",
      (page) => (page.calibration.verificationHistory[0].sourceIds = ["source:missing:1"]),
    ],
    [
      "leaf basis",
      (page) => (page.calibration.leafTemperatureBasis.evidenceSourceIds = ["source:missing:1"]),
    ],
    ["transport", (page) => (page.transport.evidenceSourceIds = ["source:missing:1"])],
    ["capability", (page) => (page.capabilities[0].evidenceSourceIds = ["source:missing:1"])],
  ];
  for (const [label, mutate] of cases) {
    const invalid = structuredClone(fixture);
    mutate(invalid);
    assert.throws(
      () => validateSensorPageSemantics(invalid, { asOf: "2026-12-01T00:00:00Z" }),
      /references missing evidence source/,
      label,
    );
  }

  const vendor = structuredClone(fixture);
  const vendorMeasurement = vendor.measurements.find((item) => item.metricKey === "vpd_kpa");
  vendorMeasurement.directOrDerived = "vendor_derived";
  vendorMeasurement.vpdBasis = "vendor";
  vendorMeasurement.derivation.formulaExpression = null;
  vendorMeasurement.derivation.vendorMethodSourceId = "source:vendor-vpd-method:1";
  vendor.sources.push({ nodeId: "source:vendor-vpd-method:1" });
  assert.equal(
    validateSensorPageSemantics(vendor, { asOf: "2026-12-01T00:00:00Z" }).status,
    "pass",
  );
  vendorMeasurement.derivation.vendorMethodSourceId = "source:missing:1";
  assert.throws(
    () => validateSensorPageSemantics(vendor, { asOf: "2026-12-01T00:00:00Z" }),
    /references missing evidence source/,
  );
});

test("keeps native and Verdant sensor capabilities separate and read-only", () => {
  const transportValidator = getValidator("sensor.schema.json#/properties/transport");
  const capabilitiesValidator = getValidator("sensor.schema.json#/properties/capabilities");
  const fixture = sensorSemanticFixture();
  assert.equal(
    transportValidator(fixture.transport),
    true,
    JSON.stringify(transportValidator.errors),
  );
  assert.equal(transportValidator({ ...fixture.transport, evidenceSourceIds: [] }), false);
  assert.equal(transportValidator({ ...fixture.transport, readOnly: false }), false);
  assert.equal(transportValidator({ ...fixture.transport, directDeviceControl: true }), false);
  assert.equal(
    capabilitiesValidator(fixture.capabilities),
    true,
    JSON.stringify(capabilitiesValidator.errors),
  );
  const writableVerdantCapability = structuredClone(fixture.capabilities);
  writableVerdantCapability[1].readOnly = false;
  assert.equal(capabilitiesValidator(writableVerdantCapability), false);

  const missingReciprocity = structuredClone(fixture);
  missingReciprocity.pageManifest.graph.edges = missingReciprocity.pageManifest.graph.edges.filter(
    (edge) => edge.type !== "exposes_capability",
  );
  assert.throws(
    () => validateSensorPageSemantics(missingReciprocity, { asOf: "2026-12-01T00:00:00Z" }),
    /lacks integration graph reciprocity/,
  );
});

test("preserves sensor verification history across page revisions", () => {
  const previous = sensorSemanticFixture();
  const current = structuredClone(previous);
  current.calibration.verificationHistory.push({
    ...structuredClone(current.calibration.verificationHistory[0]),
    verificationId: "verification:sensor:2027-08-01",
    verifiedAt: "2027-08-01T11:00:00Z",
    nextDueOn: "2028-08-01",
    supersedesVerificationId: "verification:sensor:2026-08-01",
  });
  assert.deepEqual(validateSensorVerificationHistoryAppendOnly(previous, current), {
    status: "pass",
    previousCount: 1,
    currentCount: 2,
    appendedCount: 1,
  });

  const edited = structuredClone(current);
  edited.calibration.verificationHistory[0].nextDueOn = "2026-09-01";
  assert.throws(
    () => validateSensorVerificationHistoryAppendOnly(previous, edited),
    /must preserve prior records/,
  );
  const deleted = structuredClone(previous);
  deleted.calibration.verificationHistory = [];
  assert.throws(
    () => validateSensorVerificationHistoryAppendOnly(previous, deleted),
    /cannot delete prior records/,
  );
  const reordered = structuredClone(current);
  reordered.calibration.verificationHistory.reverse();
  assert.throws(
    () => validateSensorVerificationHistoryAppendOnly(previous, reordered),
    /must preserve prior records/,
  );
});

test("rejects weakening metric, derivation, VPD, calibration, and transport contracts", () => {
  {
    const documents = freshDocuments();
    const tuple = documents
      .get("sensor.schema.json")
      .$defs.metricContract.oneOf.find(
        (entry) => entry.properties.metricKey.const === "humidity_pct",
      );
    tuple.properties.unitId.const = "unit:percent";
    assert.throws(
      () => validateSchemaDocuments(documents),
      /metric key to its canonical metric and unit IDs/,
    );
  }
  {
    const documents = freshDocuments();
    const item = documents.get("sensor.schema.json").properties.measurements.items;
    item.allOf = item.allOf.filter(
      (entry) => entry.if?.properties?.directOrDerived?.const !== "direct",
    );
    assert.throws(
      () => validateSchemaDocuments(documents),
      /sensor schema must prohibit derivation evidence on direct measurements/,
    );
  }
  {
    const documents = freshDocuments();
    const item = documents.get("sensor.schema.json").properties.measurements.items;
    const airVpd = item.allOf.find((entry) => entry.if?.properties?.metricKey?.const === "vpd_kpa");
    airVpd.then.oneOf[0].properties.vpdBasis.const = "vendor";
    assert.throws(
      () => validateSchemaDocuments(documents),
      /sensor schema must pair air VPD derivation kind with its truthful basis/,
    );
  }
  {
    const documents = freshDocuments();
    const item = documents.get("sensor.schema.json").properties.measurements.items;
    const leafVpd = item.allOf.find(
      (entry) => entry.if?.properties?.metricKey?.const === "leaf_vpd_kpa",
    );
    leafVpd.then.oneOf[1].properties.vpdBasis.const = "leaf";
    assert.throws(
      () => validateSchemaDocuments(documents),
      /sensor schema must pair leaf VPD derivation kind with its truthful basis/,
    );
  }
  {
    const documents = freshDocuments();
    const highRhGate = documents.get("sensor.schema.json").allOf[1];
    highRhGate.if.properties.measurements.contains.properties.metricKey.enum = ["humidity_pct"];
    assert.throws(
      () => validateSchemaDocuments(documents),
      /humidity and VPD pages must require an actual high-RH check/,
    );
  }
  {
    const documents = freshDocuments();
    const anyVpdGate = documents.get("sensor.schema.json").allOf[2];
    anyVpdGate.then.properties.calibration.properties.leafTemperatureBasis = {
      type: "string",
    };
    assert.throws(
      () => validateSchemaDocuments(documents),
      /VPD pages must require current verification and a structured leaf basis/,
    );
  }
  {
    const documents = freshDocuments();
    documents.get("sensor.schema.json").properties.transport.properties.directDeviceControl.const =
      true;
    assert.throws(
      () => validateSchemaDocuments(documents),
      /transport must remain read-only and prohibit device control/,
    );
  }
});

test("rejects the legacy scalar sensor-measurement shape", () => {
  const documents = freshDocuments();
  const sensor = documents.get("sensor.schema.json");
  sensor.properties.measurement = sensor.properties.measurements.items;
  delete sensor.properties.measurements;
  sensor.required = sensor.required.map((key) => (key === "measurements" ? "measurement" : key));

  assert.throws(
    () => validateSchemaDocuments(documents),
    /sensor schema must model truth per metric in a nonempty measurements array/,
  );
});

test("requires an explicitly typed canonical sensor source vocabulary", () => {
  const documents = freshDocuments();
  delete documents.get("sensor.schema.json").properties.truthModel.properties.allowedSources.type;
  assert.throws(
    () => validateSchemaDocuments(documents),
    /sensor truth model must explicitly type and pin the canonical source vocabulary/,
  );
});

test("pins claim-level source links and source version identity", () => {
  const sourceLinkValidator = getValidator("common.schema.json#/$defs/sourceLink");
  assert.equal(
    sourceLinkValidator({
      sourceId: "source:reference:1",
      roles: ["supports", "limits"],
      locator: "Table 2",
    }),
    true,
  );
  assert.equal(
    sourceLinkValidator({
      sourceId: "source:reference:1",
      roles: ["supports_everything"],
      locator: "Table 2",
    }),
    false,
  );

  const sourceValidator = getValidator("common.schema.json#/$defs/source");
  const source = {
    id: "reference-1",
    nodeId: "source:reference:1",
    title: "Reference source",
    url: "https://example.com/reference",
    publisher: "Example",
    authorIds: [],
    evidenceTier: "B",
    publishedOn: "2025-01-01",
    versionDate: "2025-01-01",
    accessedOn: "2026-08-01",
    stableIdentifier: "doi:example",
    archiveLocator: "https://example.com/archive/reference",
    limitations: ["Scope is bounded."],
    license: null,
  };
  assert.equal(sourceValidator(source), true, JSON.stringify(sourceValidator.errors));
  const withoutVersion = { ...source };
  delete withoutVersion.versionDate;
  assert.equal(sourceValidator(withoutVersion), false);
});

test("enforces claim evidence and approval lifecycle at instance level", () => {
  const validator = getValidator("common.schema.json#/$defs/claim");
  const base = {
    id: "claim-1",
    nodeId: "claim:reference:1",
    section: "Evidence",
    claimType: "measurement",
    text: "This is a bounded measurement claim.",
    wordingState: "bounded",
    evidenceState: "supported",
    riskClass: "R2",
    riskDomains: ["standard"],
    sourceLinks: [{ sourceId: "source:reference:1", roles: ["supports"], locator: "Table 2" }],
    methodIds: [],
    observationIds: [],
    applicability: {
      stageIds: [],
      mediumIds: [],
      facilityIds: [],
      jurisdictionIds: [],
      scopeNote: "Bounded scope",
    },
    limitations: ["Context dependent."],
    authorId: "author:editor:1",
    evidenceReviewerIds: [],
    cultivationReviewerIds: [],
    approvalDecision: "pending",
    approvedOn: null,
    invalidationTriggers: ["Material source revision"],
    nextReviewOn: "2027-08-01",
  };

  assert.equal(validator(base), true, JSON.stringify(validator.errors));
  assert.equal(validator({ ...base, sourceLinks: [] }), false);

  const approved = {
    ...base,
    wordingState: "approved",
    approvalDecision: "approved",
    approvedOn: "2026-08-01",
    evidenceReviewerIds: ["reviewer:evidence:1"],
    cultivationReviewerIds: ["reviewer:cultivation:1"],
  };
  assert.equal(validator(approved), true, JSON.stringify(validator.errors));
  assert.equal(validator({ ...approved, evidenceReviewerIds: [] }), false);
  assert.equal(validator({ ...approved, wordingState: "bounded" }), false);
});

function reviewerFixture(role, decision, skipReason = null) {
  return {
    reviewer: {
      nodeId: `reviewer:${role}:1`,
      profileSubjectId: `reviewer:${role}:1`,
      displayName: `${role} reviewer`,
      roleSummary: `${role} review`,
      experienceStatement: "Documented relevant review experience.",
      credentials: [],
      profilePath: null,
    },
    role,
    decision,
    reviewedOn: "2026-08-01",
    notes: "Reviewed against the bounded evidence.",
    conflictsReviewed: true,
    skipReason,
  };
}

function publishedEditorialFixture(safety) {
  const roles = {
    cultivation: "cultivation",
    evidence: "evidence",
    productTruth: "product_truth",
    copyAccessibility: "copy_accessibility",
    seoTechnical: "seo_technical",
  };
  const signoffs = Object.fromEntries(
    Object.entries(roles).map(([property, role]) => [property, reviewerFixture(role, "approved")]),
  );
  signoffs.safety = safety;
  const person = reviewerFixture("evidence", "approved").reviewer;
  return {
    status: "published",
    managingEditor: person,
    author: person,
    maintainer: person,
    signoffs,
    publishedOn: "2026-08-01",
    modifiedOn: "2026-08-01",
    nextReviewOn: "2027-08-01",
    reviewIntervalDays: 365,
    updateTriggers: ["Material evidence changes"],
    version: "1.0",
    changeSummary: "Initial publication",
    changeHistory: [
      {
        version: "1.0",
        changedOn: "2026-08-01",
        summary: "Initial publication",
        authorId: "author:editor:1",
      },
    ],
    conflictsOfInterest: [],
    corrections: [],
    correctionPath: "/guides/corrections",
  };
}

test("allows reasoned safety N/A only below R3 and requires approval for R3 publication", () => {
  const signoffValidator = getValidator("common.schema.json#/$defs/signoff");
  const notApplicable = reviewerFixture(
    "safety",
    "not_applicable",
    "No material safety pathway applies.",
  );
  assert.equal(signoffValidator(notApplicable), true, JSON.stringify(signoffValidator.errors));
  assert.equal(signoffValidator(reviewerFixture("safety", "not_applicable", "too short")), false);
  assert.equal(signoffValidator(reviewerFixture("safety", "approved", "unexpected reason")), false);

  const wrapper = BASELINE_COMPILED.ajv.compile({
    type: "object",
    required: ["pageManifest", "editorial"],
    properties: {
      pageManifest: {
        type: "object",
        required: ["metadata"],
        properties: {
          metadata: {
            type: "object",
            required: ["riskClass"],
            properties: {
              riskClass: { $ref: `${CANONICAL_SCHEMA_BASE}common.schema.json#/$defs/riskClass` },
            },
          },
        },
      },
      editorial: { $ref: `${CANONICAL_SCHEMA_BASE}common.schema.json#/$defs/editorial` },
    },
    allOf: [{ $ref: `${CANONICAL_SCHEMA_BASE}common.schema.json#/$defs/pageSafetyReviewGate` }],
  });
  const r2 = {
    pageManifest: { metadata: { riskClass: "R2" } },
    editorial: publishedEditorialFixture(notApplicable),
  };
  assert.equal(wrapper(r2), true, JSON.stringify(wrapper.errors));
  const r3NotApplicable = structuredClone(r2);
  r3NotApplicable.pageManifest.metadata.riskClass = "R3";
  assert.equal(wrapper(r3NotApplicable), false);

  const r3Approved = structuredClone(r3NotApplicable);
  r3Approved.editorial.signoffs.safety = reviewerFixture("safety", "approved");
  assert.equal(wrapper(r3Approved), true, JSON.stringify(wrapper.errors));
});

test("rejects weakening the R3 safety gate or removing it from a specialized template", () => {
  {
    const documents = freshDocuments();
    const common = documents.get("common.schema.json");
    const encoded = JSON.stringify(common.$defs.pageSafetyReviewGate).replace(
      "#/$defs/r3SafetySignoff",
      "#/$defs/approvedOrNotApplicableSignoff",
    );
    common.$defs.pageSafetyReviewGate = JSON.parse(encoded);
    assert.throws(
      () => validateSchemaDocuments(documents),
      /common page safety gate must prohibit not-applicable safety review for R3 pages/,
    );
  }
  for (const fileName of [
    "cultivar.schema.json",
    "sensor.schema.json",
    "deficiency.schema.json",
    "equipment.schema.json",
  ]) {
    const documents = freshDocuments();
    const schema = documents.get(fileName);
    schema.allOf = schema.allOf.filter(
      (entry) => entry.$ref !== "common.schema.json#/$defs/pageSafetyReviewGate",
    );
    assert.throws(
      () => validateSchemaDocuments(documents),
      new RegExp(
        `${fileName.replaceAll(".", "\\.")} must apply the common page safety review gate`,
      ),
    );
  }
});

test("requires ProductAction graph identity for next_action reciprocity", () => {
  const validator = getValidator("common.schema.json#/$defs/productAction");
  const productAction = {
    nodeId: "product-action:quick-log",
    label: "Open Quick Log",
    path: "/quick-log",
    truthStatement: "Open the grower-controlled Quick Log form.",
  };
  assert.equal(validator(productAction), true, JSON.stringify(validator.errors));
  const withoutNode = { ...productAction };
  delete withoutNode.nodeId;
  assert.equal(validator(withoutNode), false);

  const documents = freshDocuments();
  const productActionSchema = documents.get("common.schema.json").$defs.productAction;
  productActionSchema.required = productActionSchema.required.filter((key) => key !== "nodeId");
  assert.throws(
    () => validateSchemaDocuments(documents),
    /common productAction must require nodeId/,
  );
});
