import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  validateIntentResearchAppendOnly,
  validateIntentResearchRegistry,
  validateTrustInfrastructureRegistry,
} from "./validate-governance.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "..");
const knowledgeDir = path.join(root, "docs", "knowledge-library");
const roadmap = JSON.parse(readFileSync(path.join(knowledgeDir, "roadmap-500.json"), "utf8"));
const intentRegistry = JSON.parse(
  readFileSync(path.join(knowledgeDir, "intent-research-registry.json"), "utf8"),
);
const trustRegistry = JSON.parse(
  readFileSync(path.join(knowledgeDir, "trust-infrastructure.json"), "utf8"),
);

function researchedReceipt(overrides = {}) {
  return {
    receiptId: "research:KL-011:v1",
    receiptVersion: 1,
    sourceTool: "Named search-research tool and export version",
    collectedOn: "2026-08-01",
    language: "en-US",
    region: "US",
    deviceContext: "desktop",
    observedIntent: "Readers need a practical setup path with explicit record boundaries.",
    dominantPageTypes: ["reference", "checklist"],
    serpFeatures: ["related questions"],
    competingCanonicals: ["/guides/grow-diary-app"],
    collisionDecision: "hub_child",
    demand: {
      value: null,
      unit: null,
      window: null,
      source: null,
      state: "unknown",
    },
    distinctInformationGain: "Narrows the pillar to the setup decision and its minimum fields.",
    originalAsset: "A start-up worksheet with explicit unknown and ownership states.",
    newCanonicalRationale: "The setup job is narrower than the lifecycle pillar.",
    consolidationTrigger: "Consolidate if the page repeats the full lifecycle matrix.",
    researcherId: "author:search-researcher-1",
    ...overrides,
  };
}

function lifecycleEntry() {
  return {
    pageId: "KL-011",
    canonicalPath: "/guides/how-to-start-a-grow-journal",
    events: [
      {
        eventId: "intent-event:KL-011:researched:v1",
        sequence: 1,
        fromStatus: "provisional",
        toStatus: "researched",
        occurredOn: "2026-08-01",
        actorId: "author:search-researcher-1",
        reason: "Completed the reproducible search-research receipt.",
        researchReceipt: researchedReceipt(),
        validationReceipt: null,
        supersessionReceipt: null,
      },
      {
        eventId: "intent-event:KL-011:superseded:v2",
        sequence: 2,
        fromStatus: "researched",
        toStatus: "superseded",
        occurredOn: "2026-09-01",
        actorId: "reviewer:seo-technical-1",
        reason: "The setup job was consolidated into the reviewed replacement.",
        researchReceipt: null,
        validationReceipt: null,
        supersessionReceipt: {
          replacementPageId: "KL-001",
          replacementCanonicalPath: "/guides/grow-diary-app",
          effectiveOn: "2026-09-01",
          reason: "The replacement now completely serves the same reader job.",
        },
      },
    ],
  };
}

test("keeps the immutable 500-page baseline separate from mutable intent research", () => {
  assert.ok(roadmap.pages.every((page) => page.intentStatus === "provisional"));
  assert.equal(intentRegistry.baselineStableIdentityDigest, roadmap.stableIdentityDigest);
  assert.deepEqual(validateIntentResearchRegistry(intentRegistry, roadmap), {
    status: "pass",
    baselinePageCount: 500,
    registryEntryCount: 0,
    lifecycleEventCount: 0,
    currentIntentStatuses: { provisional: 500 },
  });
});

test("derives researched and superseded intent without rewriting roadmap records", () => {
  const registry = structuredClone(intentRegistry);
  registry.entries.push(lifecycleEntry());
  const report = validateIntentResearchRegistry(registry, roadmap);
  assert.deepEqual(report.currentIntentStatuses, { provisional: 499, superseded: 1 });
  assert.equal(report.lifecycleEventCount, 2);

  const missingResearch = structuredClone(registry);
  missingResearch.entries[0].events[0].researchReceipt = null;
  assert.throws(
    () => validateIntentResearchRegistry(missingResearch, roadmap),
    /researched transition requires a complete search-research receipt/,
  );

  const discontinuous = structuredClone(registry);
  discontinuous.entries[0].events[1].fromStatus = "validated";
  assert.throws(
    () => validateIntentResearchRegistry(discontinuous, roadmap),
    /does not continue the prior lifecycle state/,
  );

  const missingReplacement = structuredClone(registry);
  missingReplacement.entries[0].events[1].supersessionReceipt.replacementPageId = null;
  missingReplacement.entries[0].events[1].supersessionReceipt.replacementCanonicalPath = null;
  assert.throws(
    () => validateIntentResearchRegistry(missingReplacement, roadmap),
    /supersession replacementPageId is required/,
  );

  const selfReplacement = structuredClone(registry);
  selfReplacement.entries[0].events[1].supersessionReceipt.replacementPageId = "KL-011";
  selfReplacement.entries[0].events[1].supersessionReceipt.replacementCanonicalPath =
    "/guides/how-to-start-a-grow-journal";
  assert.throws(
    () => validateIntentResearchRegistry(selfReplacement, roadmap),
    /cannot replace a page with itself/,
  );

  const futureEffectiveDate = structuredClone(registry);
  futureEffectiveDate.entries[0].events[1].supersessionReceipt.effectiveOn = "2030-01-01";
  assert.throws(
    () => validateIntentResearchRegistry(futureEffectiveDate, roadmap),
    /effectiveOn must match its lifecycle event date/,
  );
});

test("proves intent research history is append-only across registry revisions", () => {
  const previous = structuredClone(intentRegistry);
  previous.entries.push({
    ...lifecycleEntry(),
    events: [lifecycleEntry().events[0]],
  });
  const current = structuredClone(previous);
  current.entries[0].events.push(lifecycleEntry().events[1]);
  assert.deepEqual(validateIntentResearchAppendOnly(previous, current), {
    status: "pass",
    appendedEventCount: 1,
  });

  const rewritten = structuredClone(current);
  rewritten.entries[0].events[0].reason = "Rewritten after the fact.";
  assert.throws(
    () => validateIntentResearchAppendOnly(previous, rewritten),
    /must preserve prior events exactly/,
  );

  const deleted = structuredClone(current);
  deleted.entries = [];
  assert.throws(
    () => validateIntentResearchAppendOnly(previous, deleted),
    /intent entry cannot be deleted/,
  );
});

test("machine-governs trust routes and L1 groupings outside the first 500", () => {
  assert.deepEqual(validateTrustInfrastructureRegistry(trustRegistry, roadmap), {
    status: "pass",
    systemRouteCount: 10,
    pillarGroupingCount: 10,
    l1GroupingCount: 74,
    roadmapOverlapCount: 0,
  });

  const routableGrouping = structuredClone(trustRegistry);
  routableGrouping.pillarGroupings[0].groups[0].publicRoutable = true;
  assert.throws(
    () => validateTrustInfrastructureRegistry(routableGrouping, roadmap),
    /L1 grouping must remain non-routable metadata/,
  );

  const overlappingRoute = structuredClone(trustRegistry);
  overlappingRoute.systemRoutes[0].path = roadmap.pages[0].path;
  assert.throws(
    () => validateTrustInfrastructureRegistry(overlappingRoute, roadmap),
    /trust route overlaps the immutable first-500 roadmap/,
  );
});

test("documents the honest first-500 and mutable-intent boundaries", () => {
  const readme = readFileSync(path.join(knowledgeDir, "README.md"), "utf8");
  const siteMap = readFileSync(path.join(knowledgeDir, "site-map.md"), "utf8");
  const workflow = readFileSync(path.join(knowledgeDir, "editorial-workflow.md"), "utf8");

  assert.match(readme, /intent-research-registry\.json/);
  assert.match(readme, /trust-infrastructure\.json/);
  assert.match(siteMap, /outside the immutable first-500 roadmap/i);
  assert.match(siteMap, /L1 .*non-routable metadata/i);
  assert.match(workflow, /roadmap-500\.json.*remains provisional/i);
  assert.match(workflow, /intent-research-registry\.json/i);
});
