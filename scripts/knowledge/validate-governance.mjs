import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "..");
const knowledgeDir = path.join(root, "docs", "knowledge-library");
const INTENT_REGISTRY_REPOSITORY_PATH = "docs/knowledge-library/intent-research-registry.json";

const INTENT_STATUSES = new Set(["provisional", "researched", "validated", "superseded"]);
const ALLOWED_TRANSITIONS = new Set([
  "provisional->researched",
  "researched->validated",
  "researched->superseded",
  "researched->provisional",
  "validated->superseded",
  "validated->provisional",
  "superseded->provisional",
]);
const EXPECTED_SYSTEM_ROUTE_PATHS = new Set([
  "/guides/glossary",
  "/guides/protocols",
  "/guides/symptoms",
  "/guides/metrics",
  "/guides/methods",
  "/guides/authors",
  "/guides/about-the-library",
  "/guides/evidence-policy",
  "/guides/editorial-policy",
  "/guides/corrections",
]);

function fail(message) {
  throw new Error(`Knowledge governance invalid: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireNonemptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) fail(`${label} is required`);
}

function requireDate(value, label) {
  requireNonemptyString(value, label);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    fail(`${label} must be an ISO date`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  const [, year, month, day] = match;
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    fail(`${label} must be an ISO date`);
  }
}

function requireUnique(values, label) {
  if (new Set(values).size !== values.length) fail(`${label} must be unique`);
}

function sameSet(actual, expected) {
  return actual.length === expected.size && actual.every((item) => expected.has(item));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function validateResearchReceipt(receipt, pageId) {
  if (!isRecord(receipt)) {
    fail(`${pageId} researched transition requires a complete search-research receipt`);
  }
  for (const field of [
    "receiptId",
    "sourceTool",
    "language",
    "region",
    "deviceContext",
    "observedIntent",
    "distinctInformationGain",
    "originalAsset",
    "newCanonicalRationale",
    "consolidationTrigger",
    "researcherId",
  ]) {
    requireNonemptyString(receipt[field], `${pageId} research receipt ${field}`);
  }
  if (!Number.isInteger(receipt.receiptVersion) || receipt.receiptVersion < 1) {
    fail(`${pageId} research receipt version must be a positive integer`);
  }
  requireDate(receipt.collectedOn, `${pageId} research receipt collectedOn`);
  for (const field of ["dominantPageTypes", "serpFeatures", "competingCanonicals"]) {
    if (!Array.isArray(receipt[field]))
      fail(`${pageId} research receipt ${field} must be an array`);
  }
  if (!isRecord(receipt.demand) || !["measured", "unknown"].includes(receipt.demand.state)) {
    fail(`${pageId} research receipt demand must explicitly be measured or unknown`);
  }
  if (receipt.demand.state === "unknown") {
    for (const field of ["value", "unit", "window", "source"]) {
      if (receipt.demand[field] !== null) {
        fail(`${pageId} unknown demand cannot carry an invented ${field}`);
      }
    }
  } else {
    if (typeof receipt.demand.value !== "number" || !Number.isFinite(receipt.demand.value)) {
      fail(`${pageId} measured demand requires a finite value`);
    }
    for (const field of ["unit", "window", "source"]) {
      requireNonemptyString(receipt.demand[field], `${pageId} measured demand ${field}`);
    }
  }
}

function validateValidationReceipt(receipt, pageId) {
  if (!isRecord(receipt)) fail(`${pageId} validated transition requires a validation receipt`);
  requireNonemptyString(receipt.receiptId, `${pageId} validation receiptId`);
  requireNonemptyString(receipt.summary, `${pageId} validation summary`);
  requireDate(receipt.validatedOn, `${pageId} validation date`);
  if (!Array.isArray(receipt.evidenceSourceIds) || receipt.evidenceSourceIds.length === 0) {
    fail(`${pageId} validation receipt requires evidence source identities`);
  }
}

function validateSupersessionReceipt(receipt, pageId, occurredOn, roadmapById) {
  if (!isRecord(receipt)) fail(`${pageId} superseded transition requires a supersession receipt`);
  requireDate(receipt.effectiveOn, `${pageId} supersession effectiveOn`);
  requireNonemptyString(receipt.reason, `${pageId} supersession reason`);
  if (receipt.effectiveOn !== occurredOn) {
    fail(`${pageId} supersession effectiveOn must match its lifecycle event date`);
  }
  const replacementPageId = receipt.replacementPageId;
  const replacementPath = receipt.replacementCanonicalPath;
  requireNonemptyString(replacementPageId, `${pageId} supersession replacementPageId`);
  requireNonemptyString(replacementPath, `${pageId} supersession replacementCanonicalPath`);
  if (replacementPageId === pageId) {
    fail(`${pageId} supersession cannot replace a page with itself`);
  }
  const replacement = roadmapById.get(replacementPageId);
  if (!replacement) fail(`${pageId} supersession references an unknown replacement page`);
  if (replacementPath !== replacement.path) {
    fail(`${pageId} supersession replacement ID and canonical path disagree`);
  }
}

export function validateIntentResearchAppendOnly(previousRegistry, currentRegistry) {
  if (!isRecord(previousRegistry) || !isRecord(currentRegistry)) {
    fail("intent append-only comparison requires previous and current registries");
  }
  for (const field of [
    "version",
    "artifactType",
    "baselineRoadmapPath",
    "baselineStableIdentityDigest",
    "defaultIntentStatus",
  ]) {
    if (previousRegistry[field] !== currentRegistry[field]) {
      fail(`intent registry cannot rewrite baseline field ${field}`);
    }
  }
  if (!Array.isArray(previousRegistry.entries) || !Array.isArray(currentRegistry.entries)) {
    fail("intent append-only comparison requires registry entry arrays");
  }
  const currentByPageId = new Map(currentRegistry.entries.map((entry) => [entry.pageId, entry]));
  let appendedEventCount = 0;
  for (const previousEntry of previousRegistry.entries) {
    const currentEntry = currentByPageId.get(previousEntry.pageId);
    if (!currentEntry) fail(`${String(previousEntry.pageId)} intent entry cannot be deleted`);
    if (currentEntry.canonicalPath !== previousEntry.canonicalPath) {
      fail(`${previousEntry.pageId} intent entry canonical identity cannot be rewritten`);
    }
    if (!Array.isArray(previousEntry.events) || !Array.isArray(currentEntry.events)) {
      fail(`${previousEntry.pageId} append-only comparison requires event arrays`);
    }
    if (currentEntry.events.length < previousEntry.events.length) {
      fail(`${previousEntry.pageId} intent lifecycle cannot delete prior events`);
    }
    for (let index = 0; index < previousEntry.events.length; index += 1) {
      if (
        canonicalJson(currentEntry.events[index]) !== canonicalJson(previousEntry.events[index])
      ) {
        fail(`${previousEntry.pageId} intent lifecycle must preserve prior events exactly`);
      }
    }
    appendedEventCount += currentEntry.events.length - previousEntry.events.length;
  }
  const priorIds = new Set(previousRegistry.entries.map((entry) => entry.pageId));
  for (const currentEntry of currentRegistry.entries) {
    if (!priorIds.has(currentEntry.pageId)) {
      appendedEventCount += currentEntry.events?.length ?? 0;
    }
  }
  return { status: "pass", appendedEventCount };
}

export function validateIntentResearchRegistry(registry, roadmap) {
  if (!isRecord(registry) || !isRecord(roadmap) || !Array.isArray(roadmap.pages)) {
    fail("intent validation requires registry and roadmap objects");
  }
  if (registry.version !== 1 || registry.artifactType !== "knowledge_intent_research_registry") {
    fail("intent registry identity or version is invalid");
  }
  if (
    registry.baselineRoadmapPath !== "roadmap-500.json" ||
    registry.baselineStableIdentityDigest !== roadmap.stableIdentityDigest
  ) {
    fail("intent registry must pin the immutable roadmap identity digest");
  }
  if (registry.defaultIntentStatus !== "provisional") {
    fail("intent registry default must remain provisional");
  }
  if (!Array.isArray(registry.entries)) fail("intent registry entries must be an array");
  if (roadmap.pages.some((page) => page.intentStatus !== "provisional")) {
    fail("immutable roadmap intentStatus must remain provisional");
  }

  const roadmapById = new Map(roadmap.pages.map((page) => [page.id, page]));
  const entryIds = registry.entries.map((entry) => entry.pageId);
  requireUnique(entryIds, "intent registry page IDs");
  const counts = { provisional: roadmap.pages.length, researched: 0, validated: 0, superseded: 0 };
  let lifecycleEventCount = 0;

  for (const entry of registry.entries) {
    const page = roadmapById.get(entry.pageId);
    if (!page || entry.canonicalPath !== page.path) {
      fail(`${String(entry.pageId)} intent entry must match one immutable roadmap identity`);
    }
    if (!Array.isArray(entry.events) || entry.events.length === 0) {
      fail(`${entry.pageId} intent entry requires at least one lifecycle event`);
    }
    requireUnique(
      entry.events.map((event) => event.eventId),
      `${entry.pageId} lifecycle event IDs`,
    );
    let currentStatus = "provisional";
    let priorDate = null;
    for (const [index, event] of entry.events.entries()) {
      lifecycleEventCount += 1;
      requireNonemptyString(event.eventId, `${entry.pageId} eventId`);
      requireNonemptyString(event.actorId, `${entry.pageId} event actorId`);
      requireNonemptyString(event.reason, `${entry.pageId} event reason`);
      requireDate(event.occurredOn, `${entry.pageId} event occurredOn`);
      if (event.sequence !== index + 1)
        fail(`${entry.pageId} lifecycle sequence must be contiguous`);
      if (!INTENT_STATUSES.has(event.fromStatus) || !INTENT_STATUSES.has(event.toStatus)) {
        fail(`${entry.pageId} lifecycle event has an invalid intent status`);
      }
      if (event.fromStatus !== currentStatus) {
        fail(`${entry.pageId} lifecycle event does not continue the prior lifecycle state`);
      }
      if (!ALLOWED_TRANSITIONS.has(`${event.fromStatus}->${event.toStatus}`)) {
        fail(`${entry.pageId} lifecycle transition is not allowed`);
      }
      if (priorDate !== null && event.occurredOn < priorDate) {
        fail(`${entry.pageId} lifecycle events must be chronological`);
      }
      if (event.toStatus === "researched")
        validateResearchReceipt(event.researchReceipt, entry.pageId);
      else if (event.researchReceipt !== null)
        fail(`${entry.pageId} non-research event cannot carry research evidence`);
      if (event.toStatus === "validated")
        validateValidationReceipt(event.validationReceipt, entry.pageId);
      else if (event.validationReceipt !== null)
        fail(`${entry.pageId} non-validation event cannot carry validation evidence`);
      if (event.toStatus === "superseded") {
        validateSupersessionReceipt(
          event.supersessionReceipt,
          entry.pageId,
          event.occurredOn,
          roadmapById,
        );
      } else if (event.supersessionReceipt !== null) {
        fail(`${entry.pageId} non-supersession event cannot carry supersession evidence`);
      }
      currentStatus = event.toStatus;
      priorDate = event.occurredOn;
    }
    counts.provisional -= 1;
    counts[currentStatus] += 1;
  }

  return {
    status: "pass",
    baselinePageCount: roadmap.pages.length,
    registryEntryCount: registry.entries.length,
    lifecycleEventCount,
    currentIntentStatuses: Object.fromEntries(
      Object.entries(counts).filter(([, count]) => count > 0),
    ),
  };
}

export function validateTrustInfrastructureRegistry(registry, roadmap) {
  if (!isRecord(registry) || !isRecord(roadmap) || !Array.isArray(roadmap.pages)) {
    fail("trust-infrastructure validation requires registry and roadmap objects");
  }
  if (
    registry.version !== 1 ||
    registry.artifactType !== "knowledge_trust_infrastructure_registry" ||
    registry.roadmapRelationship !== "outside_first_500" ||
    registry.baselineStableIdentityDigest !== roadmap.stableIdentityDigest
  ) {
    fail("trust-infrastructure registry identity, scope, or baseline digest is invalid");
  }
  if (!Array.isArray(registry.systemRoutes) || !Array.isArray(registry.pillarGroupings)) {
    fail("trust-infrastructure registry requires routes and pillar groupings");
  }
  const roadmapPaths = new Set(roadmap.pages.map((page) => page.path));
  const roadmapIds = new Set(roadmap.pages.map((page) => page.id));
  const systemPaths = registry.systemRoutes.map((route) => route.path);
  requireUnique(systemPaths, "trust route paths");
  requireUnique(
    registry.systemRoutes.map((route) => route.id),
    "trust route IDs",
  );
  for (const route of registry.systemRoutes) {
    if (roadmapPaths.has(route.path)) {
      fail(`trust route overlaps the immutable first-500 roadmap: ${route.path}`);
    }
    if (route.roadmapMembership !== "outside_first_500" || route.publicRoutable !== false) {
      fail(`${route.id} trust route must remain outside the roadmap and non-routable`);
    }
  }
  if (!sameSet(systemPaths, EXPECTED_SYSTEM_ROUTE_PATHS)) {
    fail("trust registry must enumerate the ten reviewed system routes exactly");
  }

  if (registry.pillarGroupings.length !== 10) {
    fail("trust registry must define one L1 grouping set for each pillar");
  }
  requireUnique(
    registry.pillarGroupings.map((pillar) => pillar.pillarPageId),
    "pillar grouping page IDs",
  );
  const groupingIds = [];
  let l1GroupingCount = 0;
  for (const pillar of registry.pillarGroupings) {
    if (!roadmapIds.has(pillar.pillarPageId)) {
      fail(`${pillar.pillarPageId} grouping references an unknown roadmap pillar`);
    }
    const roadmapPillar = roadmap.pages.find((page) => page.id === pillar.pillarPageId);
    if (roadmapPillar.pageFamily !== "pillar" || roadmapPillar.pillar !== pillar.pillarKey) {
      fail(`${pillar.pillarPageId} grouping does not match its roadmap pillar`);
    }
    if (!Array.isArray(pillar.groups) || pillar.groups.length === 0) {
      fail(`${pillar.pillarPageId} must define non-routable L1 grouping metadata`);
    }
    for (const group of pillar.groups) {
      l1GroupingCount += 1;
      groupingIds.push(group.id);
      requireNonemptyString(group.id, `${pillar.pillarPageId} L1 grouping id`);
      requireNonemptyString(group.label, `${pillar.pillarPageId} L1 grouping label`);
      if (
        group.roadmapMembership !== "outside_first_500" ||
        group.publicRoutable !== false ||
        group.publicPath !== null
      ) {
        fail(`${group.id} L1 grouping must remain non-routable metadata`);
      }
    }
  }
  requireUnique(groupingIds, "L1 grouping IDs");
  if (l1GroupingCount !== 74) fail("trust registry must preserve all 74 reviewed L1 groupings");

  return {
    status: "pass",
    systemRouteCount: registry.systemRoutes.length,
    pillarGroupingCount: registry.pillarGroupings.length,
    l1GroupingCount,
    roadmapOverlapCount: 0,
  };
}

function parseJsonFile(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(
      `${label} could not be read as JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function parseGovernanceCliArgs(argv) {
  const options = { baseRevision: null, baselineFile: null, currentFile: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!["--base-revision", "--baseline-file", "--current-file"].includes(flag)) {
      fail(`unknown command-line option ${String(flag)}`);
    }
    const value = argv[index + 1];
    if (typeof value !== "string" || value.trim() === "" || value.startsWith("--")) {
      fail(`${flag} requires a value`);
    }
    index += 1;
    if (flag === "--base-revision") options.baseRevision = value.trim();
    if (flag === "--baseline-file") options.baselineFile = path.resolve(value);
    if (flag === "--current-file") options.currentFile = path.resolve(value);
  }
  if (options.baseRevision && options.baselineFile) {
    fail(`--base-revision and --baseline-file are mutually exclusive`);
  }
  return options;
}

function runGit(args, repositoryRoot) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) {
    fail(`Git history lookup failed: ${result.error.message}`);
  }
  return result;
}

export function loadIntentRegistryAtRevision(baseRevision, repositoryRoot = root) {
  if (!/^[0-9a-f]{40,64}$/i.test(baseRevision)) {
    fail(`base revision must be a full Git object ID`);
  }

  const commitCheck = runGit(["cat-file", "-e", `${baseRevision}^{commit}`], repositoryRoot);
  if (commitCheck.status !== 0) {
    fail(`base revision is unavailable in the local Git checkout`);
  }

  const objectName = `${baseRevision}:${INTENT_REGISTRY_REPOSITORY_PATH}`;
  const pathCheck = runGit(
    ["ls-tree", "--name-only", "-z", baseRevision, "--", INTENT_REGISTRY_REPOSITORY_PATH],
    repositoryRoot,
  );
  if (pathCheck.status !== 0) {
    fail(`intent registry path could not be inspected at the base revision`);
  }
  if (pathCheck.stdout === "") {
    return { exists: false, registry: null };
  }
  if (pathCheck.stdout !== `${INTENT_REGISTRY_REPOSITORY_PATH}\0`) {
    fail(`intent registry path lookup returned an ambiguous result`);
  }

  const result = runGit(["show", objectName], repositoryRoot);
  if (result.status !== 0) {
    fail(`intent registry could not be read from the base revision`);
  }
  try {
    return { exists: true, registry: JSON.parse(result.stdout) };
  } catch (error) {
    fail(
      `base-revision intent registry is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function runGovernanceValidation({
  baseRevision = null,
  baselineFile = null,
  currentFile = path.join(knowledgeDir, "intent-research-registry.json"),
  repositoryRoot = root,
} = {}) {
  const roadmap = JSON.parse(readFileSync(path.join(knowledgeDir, "roadmap-500.json"), "utf8"));
  const intentRegistry = parseJsonFile(currentFile, "current intent registry");
  const trustRegistry = JSON.parse(
    readFileSync(path.join(knowledgeDir, "trust-infrastructure.json"), "utf8"),
  );

  let intentHistory = { status: "not_requested" };
  let intentHistoryBaseline = { source: "none", exists: false };
  if (baselineFile) {
    const baseline = parseJsonFile(baselineFile, "baseline intent registry");
    intentHistory = validateIntentResearchAppendOnly(baseline, intentRegistry);
    intentHistoryBaseline = { source: "file", exists: true };
  } else if (baseRevision) {
    const baseline = loadIntentRegistryAtRevision(baseRevision, repositoryRoot);
    if (baseline.exists) {
      intentHistory = validateIntentResearchAppendOnly(baseline.registry, intentRegistry);
      intentHistoryBaseline = { source: "git", exists: true };
    } else {
      intentHistory = { status: "pass", appendedEventCount: 0, initialBaseline: true };
      intentHistoryBaseline = { source: "git", exists: false };
    }
  }

  return {
    status: "pass",
    intent: validateIntentResearchRegistry(intentRegistry, roadmap),
    intentHistory,
    intentHistoryBaseline,
    trustInfrastructure: validateTrustInfrastructureRegistry(trustRegistry, roadmap),
  };
}

function main() {
  const cli = parseGovernanceCliArgs(process.argv.slice(2));
  const environmentRevision = process.env.KNOWLEDGE_BASE_REVISION?.trim() || null;
  if (cli.baseRevision && environmentRevision && cli.baseRevision !== environmentRevision) {
    fail(`command-line and environment base revisions disagree`);
  }
  const baseRevision = cli.baseRevision ?? (cli.baselineFile ? null : environmentRevision);
  if (process.env.KNOWLEDGE_HISTORY_REQUIRED === "true" && !baseRevision && !cli.baselineFile) {
    fail(`required history comparison requires an exact base revision`);
  }
  console.log(
    JSON.stringify(
      runGovernanceValidation({
        baseRevision,
        baselineFile: cli.baselineFile,
        currentFile: cli.currentFile ?? path.join(knowledgeDir, "intent-research-registry.json"),
      }),
      null,
      2,
    ),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
