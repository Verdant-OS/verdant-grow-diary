import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "..");
const roadmapPath = path.join(root, "docs", "knowledge-library", "roadmap-500.json");
const siteMapPath = path.join(root, "docs", "knowledge-library", "site-map.md");
const pillarPagesPath = path.join(root, "docs", "knowledge-library", "pillar-pages.md");

export const EXPECTED_PILLARS = Object.freeze([
  {
    key: "fundamentals",
    name: "Grow fundamentals, records, and operations",
    owner: "Fundamentals",
  },
  { key: "environment", name: "Environment, climate, and light", owner: "Environment" },
  {
    key: "sensors",
    name: "Sensors, measurement, and data truth",
    owner: "Sensors",
  },
  { key: "irrigation", name: "Root zone and irrigation", owner: "Irrigation" },
  {
    key: "nutrition",
    name: "Nutrition and solution management",
    owner: "Nutrition",
  },
  {
    key: "health",
    name: "Plant health, IPM, and biosecurity",
    owner: "Plant health",
  },
  {
    key: "genetics",
    name: "Genetics, cultivars, and propagation",
    owner: "Genetics",
  },
  {
    key: "stages",
    name: "Plant physiology, growth stages, and canopy work",
    owner: "Stages",
  },
  { key: "harvest", name: "Harvest and post-harvest", owner: "Post-harvest" },
  {
    key: "equipment",
    name: "Equipment and read-only integrations",
    owner: "Equipment",
  },
]);

export const CONVERSION_PROMISES = Object.freeze({
  "/quick-log":
    "Open Quick Log to start a device-local draft; Verdant saves nothing until the grower reviews and submits it.",
  "/tools/vpd-calculator":
    "Open the VPD calculator to enter values manually and review a derived estimate; it does not read live sensors.",
  "/cultivars":
    "Browse source-aware cultivar profiles; a profile claim does not identify or diagnose the current plant.",
  "/guides":
    "Return to the guide library to choose another evidence-first reference; no grow data is saved or analyzed.",
  "/pricing":
    "Review current plan information without changing access; a purchase requires a separate explicit checkout action.",
});
export const NO_PRODUCT_CTA_PROMISE =
  "No product action appears on this page; complete the non-product next step first.";
export const SAFETY_NO_PRODUCT_CTA_PROMISE =
  "No product action appears on this safety-critical page; complete the non-product safety step first.";

const ALLOWED_PAGE_FAMILIES = new Set([
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
const ALLOWED_INTENTS = new Set(["learn", "implement", "solve", "research", "compare"]);
const ALLOWED_FUNNEL_STAGES = new Set(["awareness", "consideration", "activation", "retention"]);
const ALLOWED_ROUTE_STATUSES = new Set(["live", "planned"]);
const ALLOWED_LIBRARY_READINESS = new Set(["backlog", "unassessed", "blocked_parent"]);
const ALLOWED_INTENT_STATUSES = new Set(["provisional", "validated"]);
const ALLOWED_BRIEF_STATUSES = new Set(["needs_editorial_brief", "draft", "reviewed"]);
const ALLOWED_LINK_BRIEF_STATUSES = new Set(["needs_review", "draft", "reviewed"]);
const ALLOWED_SEARCH_BRIEF_STATUSES = new Set(["needs_research", "draft", "validated"]);
const ALLOWED_PRODUCT_TRUTH_SCOPES = new Set(["none", "shipped_behavior"]);
const ALLOWED_PRIORITY_LANES = new Set([
  "foundation",
  "current_route_remediation",
  "high_consequence_safety",
  "core_coverage",
]);
const ALLOWED_CONVERSION_MODES = new Set([
  "optional_product_cta",
  "non_product_only",
  "safety_only",
]);
const ALLOWED_COLLISION_RESOLUTIONS = new Set([
  "clear",
  "hub_child",
  "differentiate",
  "consolidate",
  "needs_review",
]);
const ALLOWED_EVIDENCE_TIERS = new Set(["A", "B", "C", "D"]);
const ALLOWED_RISK_DOMAINS = new Set([
  "standard",
  "electrical",
  "fire_safety",
  "pathogen",
  "biosecurity",
  "pesticide",
  "co2_safety",
  "chemical_safety",
  "hvac_safety",
]);
const CLAIM_RISK_CLASSES = Object.freeze(["R0", "R1", "R2", "R3"]);
const ALLOWED_CLAIM_RISK_CLASSES = new Set(CLAIM_RISK_CLASSES);
const ALLOWED_PRIORITY_SIGNAL_LEVELS = new Set(["low", "medium", "high", "critical"]);
const ALLOWED_PREREQUISITE_READINESS = new Set(["foundation", "live_parent", "planned_parent"]);
const ALLOWED_SOURCE_ROLES = new Set([
  "peer_reviewed_primary_or_extension",
  "method_or_technical_manual",
  "attributed_source_claim",
  "bounded_field_observation",
  "official_code_or_authority",
  "qualified_professional_review",
  "accredited_lab_method",
  "official_or_extension_biosecurity",
  "validated_operational_protocol",
  "product_label_or_regulator",
  "jurisdictional_authority",
  "safety_data_sheet",
  "current_product_test_or_shipped_code",
]);
export const PRODUCT_TRUTH_SOURCE_ROLE = "current_product_test_or_shipped_code";
const EXPLICIT_SHIPPED_BEHAVIOR_PAGE_IDS = new Set([
  // This planned page is expressly about Verdant's current no-control boundary even though it
  // has no product CTA and is not yet a live knowledge-library route.
  "KL-210",
]);
const ALLOWED_COMPETING_RELATIONSHIPS = new Set(["hub_child", "differentiate", "none_identified"]);

const TITLE_STOPWORDS = new Set([
  "and",
  "about",
  "after",
  "before",
  "cannabis",
  "from",
  "for",
  "fundamentals",
  "guide",
  "grow",
  "growing",
  "into",
  "the",
  "plant",
  "room",
  "that",
  "their",
  "through",
  "versus",
  "what",
  "when",
  "where",
  "which",
  "with",
  "without",
]);
const COLLISION_STOPWORDS = new Set([
  "a",
  "about",
  "across",
  "after",
  "an",
  "and",
  "are",
  "before",
  "cannabis",
  "checklist",
  "for",
  "from",
  "guide",
  "grow",
  "growing",
  "how",
  "into",
  "is",
  "not",
  "of",
  "only",
  "per",
  "plant",
  "profile",
  "reference",
  "room",
  "template",
  "that",
  "the",
  "their",
  "through",
  "to",
  "versus",
  "vs",
  "what",
  "when",
  "where",
  "which",
  "with",
  "without",
  "your",
]);

const RISK_REQUIREMENTS = Object.freeze({
  electrical: {
    roles: ["official_code_or_authority", "qualified_professional_review"],
    message: "electrical evidence requires tier A and official/professional source roles",
  },
  fire_safety: {
    roles: ["official_code_or_authority", "qualified_professional_review"],
    message: "fire-safety evidence requires tier A and official/professional source roles",
  },
  pathogen: {
    roles: ["peer_reviewed_primary_or_extension", "accredited_lab_method"],
    message: "pathogen evidence requires tier A and primary/lab-method source roles",
  },
  biosecurity: {
    roles: ["official_or_extension_biosecurity", "validated_operational_protocol"],
    message: "biosecurity evidence requires tier A and authoritative protocol source roles",
  },
  pesticide: {
    roles: ["product_label_or_regulator", "jurisdictional_authority"],
    message: "pesticide evidence requires tier A and label/regulatory source roles",
  },
  co2_safety: {
    roles: ["official_code_or_authority", "qualified_professional_review"],
    message: "CO2 safety evidence requires tier A and official/professional source roles",
  },
  chemical_safety: {
    roles: ["safety_data_sheet", "official_code_or_authority"],
    message: "chemical safety evidence requires tier A and SDS/authority source roles",
  },
  hvac_safety: {
    roles: ["official_code_or_authority", "qualified_professional_review"],
    message: "HVAC safety evidence requires tier A and code/professional source roles",
  },
});
const MINIMUM_CLAIM_RISK = Object.freeze({
  standard: "R0",
  pathogen: "R2",
  biosecurity: "R2",
  electrical: "R3",
  fire_safety: "R3",
  pesticide: "R3",
  co2_safety: "R3",
  chemical_safety: "R3",
  hvac_safety: "R3",
});
const RISK_NEXT_STEP_PATTERNS = Object.freeze({
  electrical: [/\bload\b/i, /electrical code/i, /qualified electrician/i],
  fire_safety: [/(controlling fire authority|fire code)/i, /qualified safety professional/i],
  pesticide: [
    /product label/i,
    /jurisdictional authority/i,
    /(re-entry|pre-harvest|application|applicator)/i,
  ],
  co2_safety: [
    /sensor/i,
    /ventilation/i,
    /(alarm|interlock)/i,
    /controlling code/i,
    /qualified (safety|HVAC) professional/i,
  ],
  chemical_safety: [
    /(safety data sheet|SDS)/i,
    /PPE/i,
    /(storage|spill)/i,
    /controlling authority/i,
  ],
  hvac_safety: [/controlling code/i, /refrigerant/i, /electrical/i, /qualified HVAC professional/i],
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
});
const R3_ASSET_INPUT_PATTERNS = Object.freeze({
  electrical: [/(circuit|load|voltage|current|nameplate)/i, /(code|electrician|authority)/i],
  fire_safety: [/(alarm|suppression|egress|fire load)/i, /(code|authority|professional)/i],
  pesticide: [
    /(label|registration)/i,
    /(application|applicator|treated)/i,
    /(re-entry|pre-harvest|jurisdiction)/i,
  ],
  co2_safety: [/sensor/i, /(alarm|interlock)/i, /(ventilation|occupancy)/i],
  chemical_safety: [/(safety data sheet|SDS)/i, /PPE/i, /(storage|spill|incompatib)/i],
  hvac_safety: [
    /(sensible|latent|load|capacity)/i,
    /(refrigerant|electrical)/i,
    /(qualified|professional|code)/i,
  ],
});
const REQUIRED_MANUAL_COLLISIONS = Object.freeze([
  ["KL-140", "KL-443", "differentiate"],
  ["KL-110", "KL-453", "needs_review"],
  ["KL-120", "KL-463", "needs_review"],
]);
const REVIEWED_PILLAR_RELATED_PATHS = Object.freeze({
  "KL-001": ["/guides/how-to-start-a-grow-journal", "/guides/what-to-log-in-a-grow-journal"],
  "KL-002": [
    "/guides/grow-room-vpd-tracker",
    "/guides/air-vpd-vs-leaf-vpd-what-the-calculation-actually-means",
  ],
  "KL-003": [
    "/guides/how-to-calibrate-grow-room-sensors",
    "/guides/verify-temperature-sensors-at-operating-conditions",
  ],
  "KL-004": ["/guides/plant-watering-log", "/guides/irrigation-event-history-minimum-fields"],
  "KL-005": [
    "/guides/ec-concentration-and-nutrient-strength-are-not-interchangeable",
    "/guides/ph-fundamentals-for-cannabis-root-zones",
  ],
  "KL-006": [
    "/guides/bud-rot-prevention-identification",
    "/guides/how-to-describe-a-cannabis-plant-symptom-before-diagnosing-it",
  ],
  "KL-007": ["/cultivars/sour-diesel", "/cultivars/og-kush"],
  "KL-008": [
    "/guides/germination-evidence-and-recordkeeping",
    "/guides/seedling-stage-environment-and-watering",
  ],
  "KL-009": [
    "/guides/harvest-readiness-evidence-beyond-trichome-color",
    "/guides/trichome-observation-method-and-limitations",
  ],
  "KL-010": [
    "/guides/how-to-choose-a-grow-room-environmental-sensor",
    "/guides/how-to-choose-a-temperature-and-humidity-reference-instrument",
  ],
});
const CALIBRATION_CHILD_IDS = Object.freeze(["KL-023", "KL-033", "KL-043", "KL-303", "KL-313"]);
const STABLE_IDENTITY_DIGEST = "4cf7e552a5f61bd447ee906f90f9227334b7b0f25b70ab8f69840266677a7312";

function fail(message) {
  throw new Error(`Knowledge roadmap invalid: ${message}`);
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) counts.set(item[key], (counts.get(item[key]) ?? 0) + 1);
  return counts;
}

function normalizeText(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function words(value) {
  return String(value).trim().split(/\s+/).filter(Boolean).length;
}

function meaningfulTokens(value) {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((token) => token.length >= 3 && !TITLE_STOPWORDS.has(token)),
  );
}

function sharesContext(page, value) {
  const expected = new Set([...meaningfulTokens(page.title), ...meaningfulTokens(page.pillarName)]);
  const actual = meaningfulTokens(value);
  return [...expected].some((expectedToken) =>
    [...actual].some(
      (actualToken) =>
        actualToken === expectedToken ||
        (Math.min(actualToken.length, expectedToken.length) >= 5 &&
          (actualToken.startsWith(expectedToken) || expectedToken.startsWith(actualToken))),
    ),
  );
}

function briefAsset(page) {
  const { assetMethod, assetInputs, assetOutput } = page.brief;
  return `${assetMethod}. Inputs: ${assetInputs.join("; ")}. Output: ${assetOutput}.`;
}

function stableIdentityDigest(pages) {
  const identitySnapshot = [...pages]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((page) => `${page.id}\0${page.path}\n`)
    .join("");
  return createHash("sha256").update(identitySnapshot).digest("hex");
}

function riskClassAtLeast(actual, minimum) {
  return CLAIM_RISK_CLASSES.indexOf(actual) >= CLAIM_RISK_CLASSES.indexOf(minimum);
}

function collisionTokens(page) {
  return new Set(
    normalizeText(page.title)
      .split(" ")
      .filter((token) => token.length >= 2 && !COLLISION_STOPWORDS.has(token)),
  );
}

function jaccard(left, right) {
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function expectedOrderingGroup(page) {
  if (page.pageFamily === "pillar") return 0;
  if (page.routeStatus === "live" && page.claimRiskClass === "R2") return 1;
  if (page.routeStatus === "planned" && page.claimRiskClass === "R3") return 2;
  if (page.routeStatus === "live") return 3;
  return 4;
}

function expectedPriorityLane(page) {
  if (page.pageFamily === "pillar") return "foundation";
  if (page.claimRiskClass === "R3") return "high_consequence_safety";
  if (page.routeStatus === "live") return "current_route_remediation";
  return "core_coverage";
}

function expectedProductTruthScope(page) {
  // A canonical CTA promise is itself a statement about shipped behavior. Existing live routes
  // are also current product surfaces, while the small explicit set captures reviewed product
  // behavior pages that have neither signal. Everything else must stay product-claim-free until
  // this contract is deliberately updated alongside current code or test evidence.
  return page.primaryCta !== null ||
    page.routeStatus === "live" ||
    EXPLICIT_SHIPPED_BEHAVIOR_PAGE_IDS.has(page.id)
    ? "shipped_behavior"
    : "none";
}

function isCompatibleCta(page) {
  const title = page.title.toLowerCase();
  switch (page.primaryCta) {
    case "/tools/vpd-calculator":
      return /\bvpd\b|leaf.?temperature offset|temperature.*humidity.*(?:calculation|formula)/.test(
        title,
      );
    case "/quick-log":
      return /\b(log|journal|record|recording|document|photo protocol|room walk|snapshot|timeline|chain of custody|handoff)\b/.test(
        title,
      );
    case "/cultivars":
      return (
        page.pageFamily === "entity" ||
        (page.pillar === "genetics" &&
          /cultivar|breeder|lineage|genetic|phenotype|genotype|chemotype|pheno|seed lot|mother|clone|provenance|identity/.test(
            title,
          ))
      );
    case "/guides":
      return page.pageFamily === "pillar";
    case "/pricing":
      return /pricing|subscription|plan tier|paid capability|entitlement/.test(title);
    default:
      return false;
  }
}

export function classifyEvidenceRisk(page) {
  const title = page.title.toLowerCase();
  if (/electrical|breaker|circuit load|electrical load|backup power|\bgenerator\b/.test(title)) {
    return "electrical";
  }
  if (/fire safety|fire-risk|fire risk/.test(title)) return "fire_safety";
  if (/pesticide|re-entry interval|pre-harvest interval|applicator/.test(title)) {
    return "pesticide";
  }
  if (/co2.*safety|co2 enrichment prerequisites/.test(title)) return "co2_safety";
  if (/acid and base handling|chemical handling/.test(title)) return "chemical_safety";
  if (/hvac (?:sizing|equipment selection|failure)/.test(title)) return "hvac_safety";
  if (
    /pathogen|viroid|viral|hop latent|hlvd|powdery mildew|botrytis|bud rot|root rot|mold-risk/.test(
      title,
    )
  ) {
    return "pathogen";
  }
  if (/quarantine|biosecurity|sanitation|cross-contamination/.test(title)) {
    return "biosecurity";
  }
  return "standard";
}

export function classifyClaimRiskMinimum(page) {
  const domainMinimum = MINIMUM_CLAIM_RISK[page.riskDomain] ?? "R0";
  if (domainMinimum === "R3") return "R3";
  if (domainMinimum === "R2" || page.pageFamily === "diagnostic") return "R2";

  const title = page.title.toLowerCase();
  if (
    /environment fundamentals|sensor truth in a grow room|growth-stage care guide|harvest and post-harvest fundamentals/.test(
      title,
    )
  ) {
    return "R2";
  }
  if (
    /irrigation event history: minimum fields|deep-water culture root-zone records|irrigation recipe version control|failed irrigation event incident record/.test(
      title,
    )
  ) {
    return "R1";
  }
  const consequentialPatterns = {
    environment:
      /vpd|temperature|humidity|dew point|co2|dehumid|hvac|airflow|microclimate|setpoint|capacity|peak load|condensation|environmental (?:alarm|recovery|transition|performance)|room-average environmental|latent versus sensible|negative pressure|intake air|day-night differential|power outage|sealed and vented|stagnant canopy|room envelope|short cycling/,
    sensors:
      /calibrat|reference instrument|verify|confidence|trustworthy|unit conversion|humidity sensor|sensor placement|sensor freshness|sensor units|sensor checks|compare two .*probes?|radiant heat|sensor response|sampling interval|missing sensor|par and ppfd sensor|co2 sensor placement|substrate ec sensor|cable placement|condensation and humidity-sensor|sensor system acceptance|sensor (?:drift|anomaly|replacement|acceptance)|impossible temperature|stuck-at|vendor-derived vpd|celsius shown|derived vpd|sensor data for cautious ai/,
    irrigation:
      /irrigation|watering|dryback|runoff|root-zone|substrate (?:weight|moisture|ec|ph)|input ec and ph|container geometry|pour-through|extraction methods|emitter|drainage|oxygen|field capacity|water-holding|clogged|delivery|pump|valve|leak|overflow/,
    nutrition:
      /\bec\b|\bph\b|nutrient|nutrition change|feeding|feed chart|solution|alkalinity|ppm|parts per million|stock|injector|acid|base handling|calcium|magnesium|silica|reservoir|lockout|deficiency|burn|precipitation|batch tank mixing|biological inputs|biofilm|recipe transition|flush claims|runoff trends|leaf-tissue|laboratory reports|crop-response|recipe performance/,
    health:
      /plant health|symptom|diagnos|deficien|toxicity|pest|mite|thrips|whitefly|aphid|fungus gnat|mildew|botrytis|rot|damping|stress|treatment|beneficial insect|scouting|sticky-card|incident close-out|care faq|pathogen|quarantine|sanitation/,
    genetics:
      /pheno|phenotype|keeper|selection|cull|replication|pathogen|quarantine|clone viability|mother-to-clone|tissue-culture|screening/,
    stages:
      /training|topping|pruning|defoliation|transplant|recovery|stress|irrigation|light distance|ppfd|dli|canopy airflow|intervention/,
    harvest:
      /readiness|trichome|harvest planning|drying|dry-room|wet-to-dry|airflow in a dry room|cure|mold|grade|yield|quality|lab result|lab method|sensory|defect|storage|water activity|water-activity|moisture content|stem snap|dry trim|aroma|trim loss|disposition|microbial|contaminant|packaging|harvest outcome|batch close-out|compare two harvests|post-harvest incident/,
    equipment:
      /failure|commission|acceptance test|capacity|lighting output|pump selection|alarm|backup power|power outage|electrical|co2|pesticide|fire|refrigerant/,
    fundamentals: /ai grow doctor|diagnos|intervention|closed learning loop/,
  };
  if (consequentialPatterns[page.pillar]?.test(title)) return "R2";
  if (
    /taxonomy|vocabulary|current limits|no device control|without an account|data ownership and privacy|capability matrix|different jobs/.test(
      title,
    )
  ) {
    return "R0";
  }
  return "R1";
}

export function collectCurrentRegistryPaths(rootDir = root) {
  const guideSource = readFileSync(
    path.join(rootDir, "src", "constants", "verdantSeoContent.ts"),
    "utf8",
  );
  const cultivarSource = readFileSync(
    path.join(rootDir, "src", "constants", "strainReferenceLibrary.ts"),
    "utf8",
  );
  const guideSlugs = [...guideSource.matchAll(/^\s{4}slug:\s*"([^"]+)"/gm)].map(
    (match) => match[1],
  );
  guideSlugs.push("grow-stage-care-guide");
  const cultivarSlugs = [...cultivarSource.matchAll(/\{\s*slug:\s*"([^"]+)"/g)].map(
    (match) => match[1],
  );
  const publicPaths = [
    ...guideSlugs.map((slug) => `/guides/${slug}`),
    ...cultivarSlugs.map((slug) => `/cultivars/${slug}`),
  ];
  const repeated = duplicates(publicPaths);
  if (repeated.length) fail(`duplicate public registry path: ${repeated.join(", ")}`);
  return new Set(publicPaths);
}

export function collectCanonicalSiteMapPillarPaths(rootDir = root) {
  const source = readFileSync(
    rootDir === root ? siteMapPath : path.join(rootDir, "docs", "knowledge-library", "site-map.md"),
    "utf8",
  );
  const paths = [...source.matchAll(/^Canonical pillar: `([^`]+)`$/gm)].map((match) => match[1]);
  const repeated = duplicates(paths);
  if (repeated.length) fail(`duplicate canonical pillar in site map: ${repeated.join(", ")}`);
  return new Set(paths);
}

export function collectCanonicalPillarNames(rootDir = root) {
  const source = readFileSync(
    rootDir === root
      ? pillarPagesPath
      : path.join(rootDir, "docs", "knowledge-library", "pillar-pages.md"),
    "utf8",
  );
  const names = [...source.matchAll(/^## P(\d+)\. (.+)$/gm)]
    .map((match) => ({ rank: Number(match[1]), name: match[2].trim() }))
    .sort((left, right) => left.rank - right.rank);
  if (
    names.length !== EXPECTED_PILLARS.length ||
    names.some(({ rank }, index) => rank !== index + 1)
  ) {
    fail(`pillar-pages must define P1 through P10 exactly once`);
  }
  return names.map(({ name }) => name);
}

function validateSearchBrief(page, pathMap) {
  const brief = page.searchBrief;
  if (!brief || typeof brief !== "object" || Array.isArray(brief)) {
    fail(`${page.id} searchBrief requires queryFamily`);
  }
  if (
    !Array.isArray(brief.queryFamily) ||
    brief.queryFamily.length < 2 ||
    brief.queryFamily.length > 6 ||
    brief.queryFamily.length !== new Set(brief.queryFamily.map(normalizeText)).size ||
    brief.queryFamily.some((query) => typeof query !== "string" || words(query) < 2)
  ) {
    fail(`${page.id} searchBrief requires queryFamily`);
  }
  if (typeof brief.serpIntent !== "string" || brief.serpIntent.trim().length < 40) {
    fail(`${page.id} searchBrief requires serpIntent`);
  }
  if (
    typeof brief.distinctInformationGain !== "string" ||
    brief.distinctInformationGain.trim().length < 60
  ) {
    fail(`${page.id} searchBrief requires distinctInformationGain`);
  }
  const competing = brief.competingCanonical;
  if (!competing || typeof competing !== "object" || Array.isArray(competing)) {
    fail(`${page.id} searchBrief requires competingCanonical`);
  }
  if (!ALLOWED_COMPETING_RELATIONSHIPS.has(competing.relationship)) {
    fail(`${page.id} searchBrief competingCanonical has invalid relationship`);
  }
  if (competing.path === null) {
    if (competing.relationship !== "none_identified") {
      fail(`${page.id} searchBrief null competingCanonical must use none_identified`);
    }
  } else if (
    typeof competing.path !== "string" ||
    competing.path === page.path ||
    !pathMap.has(competing.path) ||
    competing.relationship === "none_identified"
  ) {
    fail(`${page.id} searchBrief competingCanonical path is invalid`);
  }
  if (typeof competing.rationale !== "string" || competing.rationale.trim().length < 50) {
    fail(`${page.id} searchBrief competingCanonical requires rationale`);
  }
  if (
    typeof brief.consolidationTrigger !== "string" ||
    brief.consolidationTrigger.trim().length < 60
  ) {
    fail(`${page.id} searchBrief requires consolidationTrigger`);
  }
  if (!sharesContext(page, brief.queryFamily.join(" "))) {
    fail(`${page.id} searchBrief must be page-specific`);
  }
  for (const forbidden of ["searchVolume", "monthlyVolume", "demand", "difficulty"]) {
    if (forbidden in brief) fail(`${page.id} searchBrief must not claim unsourced ${forbidden}`);
  }
}

function validateAuthoredBrief(page, pathMap) {
  if (
    typeof page.readerOutcome !== "string" ||
    !page.readerOutcome.startsWith("After this page, the reader can ") ||
    !page.readerOutcome.endsWith(".") ||
    words(page.readerOutcome) < 16 ||
    !/\b(one|each|every|count|classify|reconstruct|reproduce|trace|assign|reconcile|identify|produce|complete|map)\b/i.test(
      page.readerOutcome,
    ) ||
    !sharesContext(page, page.readerOutcome)
  ) {
    fail(`${page.id} readerOutcome must be measurable and page-specific`);
  }
  if (
    typeof page.nonProductNextStep !== "string" ||
    !page.nonProductNextStep.startsWith("Next, ") ||
    !page.nonProductNextStep.endsWith(".") ||
    words(page.nonProductNextStep) < 14 ||
    /\/quick-log|\/pricing|\/tools\//i.test(page.nonProductNextStep) ||
    !sharesContext(page, page.nonProductNextStep)
  ) {
    fail(`${page.id} nonProductNextStep must be specific, non-product, and actionable`);
  }
  const brief = page.brief;
  if (!brief || typeof brief !== "object" || Array.isArray(brief)) {
    fail(`${page.id} requires a structured brief`);
  }
  if (/topic-specific|separateing/i.test(JSON.stringify(brief))) {
    fail(`${page.id} brief contains generic filler or a known generator artifact`);
  }
  for (const [field, minimumWords] of [
    ["decision", 14],
    ["applicability", 12],
    ["informationGain", 14],
    ["assetMethod", 10],
    ["assetOutput", 12],
  ]) {
    const requiresExplicitContext = ["decision", "assetMethod", "assetOutput"].includes(field);
    if (
      typeof brief[field] !== "string" ||
      words(brief[field]) < minimumWords ||
      (requiresExplicitContext && !sharesContext(page, brief[field]))
    ) {
      fail(`${page.id} brief requires a specific ${field}`);
    }
  }
  if (
    !Array.isArray(brief.assetInputs) ||
    brief.assetInputs.length < 3 ||
    brief.assetInputs.length > 6 ||
    brief.assetInputs.length !== new Set(brief.assetInputs.map(normalizeText)).size ||
    brief.assetInputs.some(
      (input) => typeof input !== "string" || words(input) < 3 || /topic-specific/i.test(input),
    )
  ) {
    fail(`${page.id} brief requires three to six specific, unique assetInputs`);
  }
  if (
    typeof page.originalAsset !== "string" ||
    page.originalAsset.trim().length < 80 ||
    normalizeText(page.originalAsset) !== normalizeText(briefAsset(page))
  ) {
    fail(`${page.id} requires a page-specific originalAsset rendered from its brief`);
  }
  if (
    !Array.isArray(page.relatedPaths) ||
    page.relatedPaths.length !== 2 ||
    page.relatedPaths.length !== new Set(page.relatedPaths).size
  ) {
    fail(`${page.id} relatedPaths must contain exactly two unique reviewed candidates`);
  }
  for (const relatedPath of page.relatedPaths) {
    if (relatedPath === page.path || relatedPath === page.parentPath || !pathMap.has(relatedPath)) {
      fail(`${page.id} relatedPaths must be valid lateral candidates`);
    }
  }
  const reviewedRelatedPaths = REVIEWED_PILLAR_RELATED_PATHS[page.id];
  if (reviewedRelatedPaths && page.relatedPaths.join("|") !== reviewedRelatedPaths.join("|")) {
    fail(`${page.id} relatedPaths must match its reviewed v1 link brief`);
  }
  validateSearchBrief(page, pathMap);

  const r3Patterns = R3_ASSET_INPUT_PATTERNS[page.riskDomain] ?? [];
  const assetInputText = page.brief.assetInputs.join(" ");
  if (
    page.claimRiskClass === "R3" &&
    !r3Patterns.every((pattern) => pattern.test(assetInputText))
  ) {
    fail(
      `${page.id} ${page.riskDomain} draft assetInputs must include domain-specific governed evidence`,
    );
  }
}

export function validateRoadmap(
  roadmap,
  {
    registryPaths = collectCurrentRegistryPaths(root),
    siteMapPillarPaths = collectCanonicalSiteMapPillarPaths(root),
    canonicalPillarNames = collectCanonicalPillarNames(root),
  } = {},
) {
  if (roadmap.version !== 1) fail(`expected version 1, received ${roadmap.version}`);
  if (roadmap.artifactType !== "content_roadmap_contract") {
    fail(`artifactType must identify a content_roadmap_contract`);
  }
  if (
    typeof roadmap.artifactScope !== "string" ||
    !/prioritized page candidates/i.test(roadmap.artifactScope) ||
    !/not publication-ready authored drafts/i.test(roadmap.artifactScope) ||
    !/briefStatus=draft\|reviewed carries an editorial brief/i.test(roadmap.artifactScope)
  ) {
    fail(`artifactScope must distinguish pending candidates from editorial briefs`);
  }
  if (
    typeof roadmap.publicationRule !== "string" ||
    !/not publication approval/i.test(roadmap.publicationRule) ||
    !/evidence-complete/i.test(roadmap.publicationRule) ||
    !/human-reviewed/i.test(roadmap.publicationRule)
  ) {
    fail(`publicationRule must deny automatic publication and require human review`);
  }
  if (
    roadmap.priorityModel?.basis !== "dependency_risk_current_route_sequence" ||
    roadmap.priorityModel?.searchDemand !== "unknown" ||
    roadmap.priorityModel?.measuredDemandClaimed !== false ||
    !/not (?:an? )?(?:SEO|search-demand)/i.test(roadmap.priorityModel?.note ?? "")
  ) {
    fail(`priorityModel must disclose dependency/risk/current-route ordering and unknown demand`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(roadmap.generatedOn ?? "")) {
    fail(`generatedOn must use YYYY-MM-DD`);
  }
  if (roadmap.totalPages !== 500) {
    fail(`declared totalPages must be 500, received ${roadmap.totalPages}`);
  }
  if (!Array.isArray(roadmap.pages) || roadmap.pages.length !== 500) {
    fail(
      `pages must contain exactly 500 records, received ${roadmap.pages?.length ?? "non-array"}`,
    );
  }
  if (!Array.isArray(roadmap.waves) || roadmap.waves.length !== 5) {
    fail(`waves must contain exactly five metadata records`);
  }

  const pages = roadmap.pages;
  const ids = pages.map((page) => page.id);
  const slugs = pages.map((page) => page.slug);
  const paths = pages.map((page) => page.path);
  const normalizedTitles = pages.map((page) => normalizeText(page.title));
  const canonicalIntents = pages.map((page) => normalizeText(page.canonicalIntent));
  for (const [label, values] of [
    ["id", ids],
    ["slug", slugs],
    ["path", paths],
    ["title", normalizedTitles],
    ["canonicalIntent", canonicalIntents],
  ]) {
    const repeated = duplicates(values);
    if (repeated.length) fail(`duplicate ${label}: ${repeated.join(", ")}`);
  }
  const expectedIds = Array.from(
    { length: 500 },
    (_, index) => `KL-${String(index + 1).padStart(3, "0")}`,
  );
  if ([...ids].sort().join("|") !== expectedIds.join("|")) {
    fail(`stable IDs must contain KL-001 through KL-500 exactly once`);
  }
  const computedIdentityDigest = stableIdentityDigest(pages);
  if (
    roadmap.stableIdentityDigest !== STABLE_IDENTITY_DIGEST ||
    computedIdentityDigest !== STABLE_IDENTITY_DIGEST
  ) {
    fail(`stable ID-to-path mapping does not match the v1 identity snapshot`);
  }
  for (const [index, page] of pages.entries()) {
    if (page.priority !== index + 1) fail(`priority sequence breaks at ${page.id}`);
    if (page.wave !== Math.ceil(page.priority / 100)) fail(`${page.id} has wrong wave`);
  }

  const pillarConfigByKey = new Map(EXPECTED_PILLARS.map((pillar) => [pillar.key, pillar]));
  const canonicalExpectedNames = EXPECTED_PILLARS.map((pillar) => pillar.name);
  if (canonicalPillarNames.join("|") !== canonicalExpectedNames.join("|")) {
    fail(`pillar names must match pillar-pages canonical headings exactly`);
  }
  const pillarCounts = countBy(pages, "pillar");
  if (
    [...pillarCounts.keys()].sort().join("|") !==
    EXPECTED_PILLARS.map((pillar) => pillar.key)
      .sort()
      .join("|")
  ) {
    fail(`pillar set does not match the canonical ten pillars`);
  }
  for (const pillar of EXPECTED_PILLARS) {
    if (pillarCounts.get(pillar.key) !== 50) {
      fail(`${pillar.key} must have 50 pages, received ${pillarCounts.get(pillar.key)}`);
    }
  }

  const pathMap = new Map(pages.map((page) => [page.path, page]));
  const idMap = new Map(pages.map((page) => [page.id, page]));
  const pillarPageByKey = new Map();
  for (const pillar of EXPECTED_PILLARS) {
    const matches = pages.filter(
      (page) => page.pillar === pillar.key && page.pageFamily === "pillar",
    );
    if (matches.length !== 1) fail(`${pillar.key} must have exactly one pillar page`);
    pillarPageByKey.set(pillar.key, matches[0]);
  }
  const roadmapPillarPaths = new Set(
    [...pillarPageByKey.values()].map((pillarPage) => pillarPage.path),
  );
  const missingFromSiteMap = [...roadmapPillarPaths].filter(
    (pillarPath) => !siteMapPillarPaths.has(pillarPath),
  );
  const inventedBySiteMap = [...siteMapPillarPaths].filter(
    (pillarPath) => !roadmapPillarPaths.has(pillarPath),
  );
  if (
    siteMapPillarPaths.size !== EXPECTED_PILLARS.length ||
    missingFromSiteMap.length ||
    inventedBySiteMap.length
  ) {
    fail(
      `site-map canonical pillars must match roadmap exactly; missing=${missingFromSiteMap.join(",") || "none"}; invented=${inventedBySiteMap.join(",") || "none"}`,
    );
  }

  const collisionTokensById = new Map(pages.map((page) => [page.id, collisionTokens(page)]));
  const collisionScores = new Map();
  const heuristicCollisions = new Map(pages.map((page) => [page.id, new Set()]));
  for (let leftIndex = 0; leftIndex < pages.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < pages.length; rightIndex += 1) {
      const left = pages[leftIndex];
      const right = pages[rightIndex];
      const score = jaccard(collisionTokensById.get(left.id), collisionTokensById.get(right.id));
      collisionScores.set(`${left.id}|${right.id}`, score);
      collisionScores.set(`${right.id}|${left.id}`, score);
      if (score >= 0.45) {
        heuristicCollisions.get(left.id).add(right.id);
        heuristicCollisions.get(right.id).add(left.id);
      }
    }
  }

  let previousOrderingGroup = -1;
  for (const page of pages) {
    if ("status" in page) fail(`${page.id} must not include legacy status`);
    if ("template" in page) fail(`${page.id} must not include legacy template`);
    if ("published" in page) fail(`${page.id} must not include legacy published`);
    const pillarConfig = pillarConfigByKey.get(page.pillar);
    if (!pillarConfig) fail(`${page.id} has invalid pillar ${page.pillar}`);
    if (page.pillarName !== pillarConfig.name) fail(`${page.id} has invalid pillarName`);
    if (page.owner !== pillarConfig.owner) fail(`${page.id} has invalid owner`);
    if (!Number.isInteger(page.pillarRank) || page.pillarRank < 1 || page.pillarRank > 50) {
      fail(`${page.id} has invalid pillarRank`);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug)) {
      fail(`${page.id} has invalid slug ${page.slug}`);
    }
    if (typeof page.title !== "string" || page.title.trim().length < 10) {
      fail(`${page.id} has an underspecified title`);
    }
    for (const [field, allowed] of [
      ["pageFamily", ALLOWED_PAGE_FAMILIES],
      ["searchIntent", ALLOWED_INTENTS],
      ["funnelStage", ALLOWED_FUNNEL_STAGES],
      ["routeStatus", ALLOWED_ROUTE_STATUSES],
      ["libraryReadiness", ALLOWED_LIBRARY_READINESS],
      ["intentStatus", ALLOWED_INTENT_STATUSES],
      ["briefStatus", ALLOWED_BRIEF_STATUSES],
      ["linkBriefStatus", ALLOWED_LINK_BRIEF_STATUSES],
      ["searchBriefStatus", ALLOWED_SEARCH_BRIEF_STATUSES],
      ["productTruthScope", ALLOWED_PRODUCT_TRUTH_SCOPES],
      ["priorityLane", ALLOWED_PRIORITY_LANES],
      ["conversionMode", ALLOWED_CONVERSION_MODES],
      ["riskDomain", ALLOWED_RISK_DOMAINS],
      ["claimRiskClass", ALLOWED_CLAIM_RISK_CLASSES],
      ["collisionResolution", ALLOWED_COLLISION_RESOLUTIONS],
    ]) {
      if (!allowed.has(page[field])) fail(`${page.id} has invalid ${field} ${page[field]}`);
    }
    if (page.intentStatus !== "provisional") {
      fail(`${page.id} v1 intentStatus must remain provisional`);
    }
    const expectedBase = page.pageFamily === "entity" ? "/cultivars/" : "/guides/";
    if (page.path !== `${expectedBase}${page.slug}`) fail(`${page.id} path/pageFamily mismatch`);

    const orderingGroup = expectedOrderingGroup(page);
    if (orderingGroup < previousOrderingGroup) {
      fail(`${page.id} breaks the foundation/live-remediation/R3/live/backlog ordering`);
    }
    previousOrderingGroup = orderingGroup;
    if (page.priorityLane !== expectedPriorityLane(page)) {
      fail(`${page.id} priorityLane must be ${expectedPriorityLane(page)}`);
    }
    if ((page.routeStatus === "live" || page.claimRiskClass === "R3") && page.wave !== 1) {
      fail(`${page.id} live and R3 records must remain in Wave 1`);
    }

    const canonicalParent = pillarPageByKey.get(page.pillar);
    const expectedReadiness =
      page.routeStatus === "planned"
        ? "backlog"
        : page.pageFamily !== "pillar" && canonicalParent.routeStatus === "planned"
          ? "blocked_parent"
          : "unassessed";
    if (page.libraryReadiness !== expectedReadiness) {
      fail(`${page.id} libraryReadiness must be ${expectedReadiness}`);
    }
    const expectedPrerequisiteReadiness =
      page.pageFamily === "pillar"
        ? "foundation"
        : canonicalParent.routeStatus === "live"
          ? "live_parent"
          : "planned_parent";
    if (page.prioritySignals?.prerequisiteReadiness !== expectedPrerequisiteReadiness) {
      fail(
        `${page.id} prioritySignals.prerequisiteReadiness must be ${expectedPrerequisiteReadiness}`,
      );
    }
    if (page.pageFamily === "pillar") {
      if (page.prerequisite !== null) fail(`${page.id} pillar prerequisite must be null`);
      if (page.parentPath !== "/guides") fail(`${page.id} pillar parentPath must be /guides`);
    } else {
      if (page.parentPath !== canonicalParent.path) {
        fail(`${page.id} parentPath must be its same-pillar canonical parent`);
      }
      if (page.prerequisite === page.path) fail(`${page.id} prerequisite cannot reference itself`);
      const prerequisite = pathMap.get(page.prerequisite);
      if (!prerequisite) fail(`${page.id} prerequisite target does not exist`);
      if (prerequisite.priority >= page.priority) {
        fail(`${page.id} prerequisite must have an earlier priority`);
      }
      if (prerequisite.path !== canonicalParent.path || prerequisite.pillar !== page.pillar) {
        fail(`${page.id} prerequisite must be its same-pillar canonical parent`);
      }
    }

    if (
      typeof page.canonicalIntent !== "string" ||
      !page.canonicalIntent.startsWith(`${page.searchIntent}: `) ||
      page.canonicalIntent.length < 24 ||
      !sharesContext(page, page.canonicalIntent)
    ) {
      fail(`${page.id} canonicalIntent must be unique, typed, and page-specific`);
    }

    if (
      !Array.isArray(page.evidenceMinimum) ||
      page.evidenceMinimum.length < 2 ||
      page.evidenceMinimum.length !== new Set(page.evidenceMinimum).size ||
      page.evidenceMinimum.some((tier) => !ALLOWED_EVIDENCE_TIERS.has(tier))
    ) {
      fail(`${page.id} lacks a valid evidence mix`);
    }
    if (
      !Array.isArray(page.sourceRoles) ||
      page.sourceRoles.length < 2 ||
      page.sourceRoles.length !== new Set(page.sourceRoles).size ||
      page.sourceRoles.some((role) => !ALLOWED_SOURCE_ROLES.has(role))
    ) {
      fail(`${page.id} lacks valid sourceRoles`);
    }
    const inferredRisk = classifyEvidenceRisk(page);
    if (inferredRisk !== "standard" && page.riskDomain !== inferredRisk) {
      fail(`${page.id} riskDomain must be at least the detected ${inferredRisk} domain`);
    }
    if (page.claimRiskClass === "R3" && !RISK_REQUIREMENTS[page.riskDomain]) {
      fail(`${page.id} R3 pages require a specific governed riskDomain`);
    }
    const minimumClaimRisk = classifyClaimRiskMinimum(page);
    if (!riskClassAtLeast(page.claimRiskClass, minimumClaimRisk)) {
      fail(`${page.id} ${page.riskDomain} requires claimRiskClass ${minimumClaimRisk} or higher`);
    }
    const riskRequirement = RISK_REQUIREMENTS[page.riskDomain];
    if (riskRequirement) {
      const hasRequiredRoles = riskRequirement.roles.every((role) =>
        page.sourceRoles.includes(role),
      );
      if (!page.evidenceMinimum.includes("A") || !hasRequiredRoles) {
        fail(`${page.id} ${riskRequirement.message}`);
      }
    }
    if (
      ["R2", "R3"].includes(page.claimRiskClass) &&
      (!page.evidenceMinimum.includes("A") || !page.evidenceMinimum.includes("B"))
    ) {
      fail(`${page.id} ${page.claimRiskClass} requires independent tier A and B evidence`);
    }
    if (
      /\bhvac\b/i.test(page.title) &&
      !page.sourceRoles.includes("qualified_professional_review")
    ) {
      fail(`${page.id} HVAC claims require qualified professional review`);
    }

    const specializedRisk = page.riskDomain !== "standard";
    if (specializedRisk) {
      if (page.primaryCta !== null) {
        fail(`${page.id} ${page.riskDomain} pages must not include a product CTA`);
      }
      if (page.conversionMode !== "safety_only") {
        fail(`${page.id} ${page.riskDomain} conversionMode must be safety_only`);
      }
      if (page.conversionPromise !== SAFETY_NO_PRODUCT_CTA_PROMISE) {
        fail(`${page.id} conversionPromise must disclose the safety-first no-CTA state`);
      }
      const patterns = RISK_NEXT_STEP_PATTERNS[page.riskDomain] ?? [];
      if (
        typeof page.requiredSafetyNextStep !== "string" ||
        !page.requiredSafetyNextStep.startsWith("Next, ") ||
        !page.requiredSafetyNextStep.endsWith(".") ||
        words(page.requiredSafetyNextStep) < 20 ||
        !/\b(document|record|inventory|preserve|obtain|isolate|contain|verify|follow|place)\b/i.test(
          page.requiredSafetyNextStep,
        ) ||
        /evidence boundary|topic-specific|separateing|hvac sizing questions an indoor|re entry interval evidence|pre harvest interval evidence/i.test(
          page.requiredSafetyNextStep,
        )
      ) {
        fail(
          `${page.id} ${page.riskDomain} requiredSafetyNextStep must be an operational sentence`,
        );
      }
      if (!patterns.every((pattern) => pattern.test(page.requiredSafetyNextStep))) {
        const message = ["pathogen", "biosecurity"].includes(page.riskDomain)
          ? "must preserve isolation and containment with authoritative clearance"
          : "must preserve its domain-specific authority and professional boundaries";
        fail(`${page.id} ${page.riskDomain} requiredSafetyNextStep ${message}`);
      }
    } else {
      if ("requiredSafetyNextStep" in page) {
        fail(`${page.id} standard records must omit requiredSafetyNextStep`);
      }
      if (page.primaryCta === null) {
        if (page.conversionMode !== "non_product_only") {
          fail(`${page.id} conversionMode must be non_product_only`);
        }
        if (page.conversionPromise !== NO_PRODUCT_CTA_PROMISE) {
          fail(`${page.id} conversionPromise must use the general no-CTA disclosure`);
        }
      } else {
        if (!(page.primaryCta in CONVERSION_PROMISES)) {
          fail(`${page.id} has an unsupported product CTA`);
        }
        if (page.conversionMode !== "optional_product_cta") {
          fail(`${page.id} conversionMode must be optional_product_cta`);
        }
        if (page.conversionPromise !== CONVERSION_PROMISES[page.primaryCta]) {
          fail(`${page.id} conversionPromise does not match ${page.primaryCta}`);
        }
        if (!isCompatibleCta(page)) {
          fail(`${page.id} ${page.primaryCta} is incompatible with the page job`);
        }
      }
    }

    const expectedTruthScope = expectedProductTruthScope(page);
    if (page.productTruthScope !== expectedTruthScope) {
      fail(`${page.id} productTruthScope must be ${expectedTruthScope}`);
    }
    const hasProductTruthSource = page.sourceRoles.includes(PRODUCT_TRUTH_SOURCE_ROLE);
    if (page.productTruthScope === "shipped_behavior" && !hasProductTruthSource) {
      fail(`${page.id} shipped product behavior requires current product test or shipped code`);
    }
    if (page.productTruthScope === "none" && hasProductTruthSource) {
      fail(`${page.id} product-free scope must not claim current product evidence`);
    }

    const prioritySignals = page.prioritySignals;
    if (!prioritySignals || typeof prioritySignals !== "object" || Array.isArray(prioritySignals)) {
      fail(`${page.id} requires structured prioritySignals`);
    }
    for (const signal of [
      "growerImpact",
      "safetyImpact",
      "evidenceFeasibility",
      "productRelevance",
      "collisionRisk",
    ]) {
      if (!(signal in prioritySignals)) fail(`${page.id} prioritySignals requires ${signal}`);
      if (!ALLOWED_PRIORITY_SIGNAL_LEVELS.has(prioritySignals[signal])) {
        fail(`${page.id} prioritySignals.${signal} has an invalid level`);
      }
    }
    if (!ALLOWED_PREREQUISITE_READINESS.has(prioritySignals.prerequisiteReadiness)) {
      fail(`${page.id} prioritySignals requires a valid prerequisiteReadiness`);
    }
    if (prioritySignals.searchDemand !== "unknown") {
      fail(`${page.id} prioritySignals.searchDemand must be unknown unless sourced`);
    }
    const expectedSafetyImpact = ["low", "medium", "high", "critical"][
      CLAIM_RISK_CLASSES.indexOf(page.claimRiskClass)
    ];
    if (prioritySignals.safetyImpact !== expectedSafetyImpact) {
      fail(`${page.id} prioritySignals.safetyImpact must match ${page.claimRiskClass}`);
    }
    const expectedProductRelevance = ["/quick-log", "/tools/vpd-calculator"].includes(
      page.primaryCta,
    )
      ? "high"
      : page.primaryCta === null || page.primaryCta === "/guides"
        ? "low"
        : "medium";
    if (prioritySignals.productRelevance !== expectedProductRelevance) {
      fail(`${page.id} prioritySignals.productRelevance must match its CTA job`);
    }
    if (
      !Array.isArray(prioritySignals.collisionWith) ||
      prioritySignals.collisionWith.length !== new Set(prioritySignals.collisionWith).size ||
      prioritySignals.collisionWith.some(
        (candidateId) => candidateId === page.id || !idMap.has(candidateId),
      ) ||
      prioritySignals.collisionWith.join("|") !==
        [...prioritySignals.collisionWith].sort().join("|")
    ) {
      fail(`${page.id} prioritySignals.collisionWith must name sorted, unique roadmap IDs`);
    }
    for (const heuristicPeer of heuristicCollisions.get(page.id)) {
      if (!prioritySignals.collisionWith.includes(heuristicPeer)) {
        fail(`${page.id} collision evidence must include title-overlap peer ${heuristicPeer}`);
      }
    }
    const hasHighCollision = prioritySignals.collisionWith.some(
      (peerId) => (collisionScores.get(`${page.id}|${peerId}`) ?? 0) >= 0.65,
    );
    const expectedCollisionRisk = prioritySignals.collisionWith.length
      ? hasHighCollision
        ? "high"
        : "medium"
      : "low";
    if (prioritySignals.collisionRisk !== expectedCollisionRisk) {
      fail(`${page.id} prioritySignals.collisionRisk must match declared collision evidence`);
    }
    if (prioritySignals.collisionWith.length && page.collisionResolution === "clear") {
      fail(`${page.id} collisionResolution cannot be clear while collisions are declared`);
    }
    if (!prioritySignals.collisionWith.length && page.collisionResolution !== "clear") {
      fail(`${page.id} collisionResolution must be clear without a declared collision`);
    }
    if (page.collisionResolution === "hub_child") {
      if (
        !Array.isArray(page.scopeExclusions) ||
        page.scopeExclusions.length < 2 ||
        page.scopeExclusions.some((entry) => typeof entry !== "string" || words(entry) < 3)
      ) {
        fail(`${page.id} hub_child collisionResolution requires scopeExclusions`);
      }
    } else if ("scopeExclusions" in page) {
      fail(`${page.id} scopeExclusions are reserved for hub_child decisions`);
    }

    if (page.briefStatus === "needs_editorial_brief") {
      for (const field of [
        "readerOutcome",
        "nonProductNextStep",
        "originalAsset",
        "brief",
        "priorityRationale",
      ]) {
        if (field in page) fail(`${page.id} pending editorial record must omit ${field}`);
      }
      if (page.linkBriefStatus !== "needs_review") {
        fail(`${page.id} pending editorial record linkBriefStatus must be needs_review`);
      }
      if ("relatedPaths" in page) fail(`${page.id} pending link brief must omit relatedPaths`);
      if (page.searchBriefStatus !== "needs_research") {
        fail(`${page.id} pending editorial record searchBriefStatus must be needs_research`);
      }
      if ("searchBrief" in page) fail(`${page.id} pending search brief must omit searchBrief`);
    } else {
      if (!["draft", "reviewed"].includes(page.linkBriefStatus)) {
        fail(`${page.id} authored brief requires an authored link brief`);
      }
      if (!["draft", "validated"].includes(page.searchBriefStatus)) {
        fail(`${page.id} authored brief requires a search brief`);
      }
      validateAuthoredBrief(page, pathMap);
    }
  }

  for (const page of pages) {
    for (const peerId of page.prioritySignals.collisionWith) {
      if (!idMap.get(peerId).prioritySignals.collisionWith.includes(page.id)) {
        fail(`collision declarations must be reciprocal: ${page.id} -> ${peerId}`);
      }
    }
  }
  for (const [leftId, rightId, decision] of REQUIRED_MANUAL_COLLISIONS) {
    const left = idMap.get(leftId);
    const right = idMap.get(rightId);
    if (
      !left.prioritySignals.collisionWith.includes(rightId) ||
      !right.prioritySignals.collisionWith.includes(leftId)
    ) {
      fail(`manual collision ${leftId} and ${rightId} must be reciprocal`);
    }
    if (left.collisionResolution !== decision || right.collisionResolution !== decision) {
      fail(`manual collision ${leftId} and ${rightId} must use ${decision}`);
    }
  }
  const calibrationHub = idMap.get("KL-013");
  if (
    calibrationHub.collisionResolution !== "hub_child" ||
    !CALIBRATION_CHILD_IDS.every((id) =>
      calibrationHub.prioritySignals.collisionWith.includes(id),
    ) ||
    !CALIBRATION_CHILD_IDS.every((id) =>
      idMap.get(id).prioritySignals.collisionWith.includes("KL-013"),
    ) ||
    ![/temperature/i, /humidity/i, /leaf-temperature/i, /pH/i, /EC/i].every((pattern) =>
      pattern.test(calibrationHub.scopeExclusions?.join(" ") ?? ""),
    )
  ) {
    fail(`KL-013 must remain the scoped calibration hub for metric-specific child procedures`);
  }

  for (const pillar of EXPECTED_PILLARS) {
    const ranks = pages
      .filter((page) => page.pillar === pillar.key)
      .map((page) => page.pillarRank)
      .sort((left, right) => left - right);
    if (ranks.join("|") !== Array.from({ length: 50 }, (_, index) => index + 1).join("|")) {
      fail(`${pillar.key} pillarRank values must contain 1 through 50 exactly once`);
    }
  }

  const waveCounts = countBy(pages, "wave");
  for (let wave = 1; wave <= 5; wave += 1) {
    const metadata = roadmap.waves[wave - 1];
    if (metadata?.wave !== wave) fail(`wave metadata sequence breaks at wave ${wave}`);
    const expectedPriorities = `${(wave - 1) * 100 + 1}-${wave * 100}`;
    if (metadata.priorities !== expectedPriorities) {
      fail(`wave ${wave} priorities must be ${expectedPriorities}`);
    }
    if (typeof metadata.objective !== "string" || metadata.objective.trim().length < 20) {
      fail(`wave ${wave} requires a meaningful objective`);
    }
    if (waveCounts.get(wave) !== 100) {
      fail(`wave ${wave} must have 100 pages, received ${waveCounts.get(wave)}`);
    }
  }

  const briefStatuses = countBy(pages, "briefStatus");
  const draftIds = pages.filter((page) => page.briefStatus === "draft").map((page) => page.id);
  const expectedDraftIds = Array.from(
    { length: 10 },
    (_, index) => `KL-${String(index + 1).padStart(3, "0")}`,
  );
  if (
    briefStatuses.get("draft") !== 10 ||
    briefStatuses.get("needs_editorial_brief") !== 490 ||
    (briefStatuses.get("reviewed") ?? 0) !== 0 ||
    draftIds.join("|") !== expectedDraftIds.join("|")
  ) {
    fail(`v1 must contain exactly ten draft pillar seeds and 490 pending candidates`);
  }
  const linkBriefStatuses = countBy(pages, "linkBriefStatus");
  if (
    linkBriefStatuses.get("draft") !== 10 ||
    linkBriefStatuses.get("needs_review") !== 490 ||
    (linkBriefStatuses.get("reviewed") ?? 0) !== 0
  ) {
    fail(`v1 link briefs must be draft only for the ten pillar seeds`);
  }
  const searchBriefStatuses = countBy(pages, "searchBriefStatus");
  if (
    searchBriefStatuses.get("draft") !== 10 ||
    searchBriefStatuses.get("needs_research") !== 490 ||
    (searchBriefStatuses.get("validated") ?? 0) !== 0
  ) {
    fail(`v1 search briefs must be draft only for the ten pillar seeds`);
  }
  for (const [label, values] of [
    [
      "readerOutcome",
      pages.filter((page) => page.readerOutcome).map((page) => normalizeText(page.readerOutcome)),
    ],
    [
      "nonProductNextStep",
      pages
        .filter((page) => page.nonProductNextStep)
        .map((page) => normalizeText(page.nonProductNextStep)),
    ],
    [
      "originalAsset",
      pages.filter((page) => page.originalAsset).map((page) => normalizeText(page.originalAsset)),
    ],
    [
      "brief decision",
      pages.filter((page) => page.brief).map((page) => normalizeText(page.brief.decision)),
    ],
    [
      "brief informationGain",
      pages.filter((page) => page.brief).map((page) => normalizeText(page.brief.informationGain)),
    ],
    [
      "searchBrief payload",
      pages
        .filter((page) => page.searchBrief)
        .map((page) => normalizeText(JSON.stringify(page.searchBrief))),
    ],
  ]) {
    const repeated = duplicates(values);
    if (repeated.length) fail(`duplicate authored ${label}: ${repeated.join(", ")}`);
  }

  const children = new Map();
  for (const page of pages) {
    const list = children.get(page.parentPath) ?? [];
    list.push(page.path);
    children.set(page.parentPath, list);
  }
  const reachable = new Set(["/guides"]);
  const queue = ["/guides"];
  while (queue.length) {
    const current = queue.shift();
    for (const child of children.get(current) ?? []) {
      if (!reachable.has(child)) {
        reachable.add(child);
        queue.push(child);
      }
    }
  }
  const orphans = pages.filter((page) => !reachable.has(page.path));
  if (orphans.length) fail(`orphan pages: ${orphans.map((page) => page.id).join(", ")}`);

  const roadmapLivePaths = new Set(
    pages.filter((page) => page.routeStatus === "live").map((page) => page.path),
  );
  const missingLive = [...registryPaths].filter((publicPath) => !roadmapLivePaths.has(publicPath));
  const inventedLive = [...roadmapLivePaths].filter((publicPath) => !registryPaths.has(publicPath));
  if (missingLive.length) {
    fail(`public registry pages missing from roadmap live routes: ${missingLive.join(", ")}`);
  }
  if (inventedLive.length) {
    fail(`roadmap marks non-registry routes live: ${inventedLive.join(", ")}`);
  }

  const warnings = pages
    .filter((page) => page.libraryReadiness === "blocked_parent")
    .map((page) => ({
      code: "live_route_blocked_parent",
      pageId: page.id,
      parentPath: page.parentPath,
    }));

  return {
    status: "pass",
    artifactType: roadmap.artifactType,
    stableIdentityDigest: computedIdentityDigest,
    totalPages: pages.length,
    pillars: Object.fromEntries(pillarCounts),
    waves: Object.fromEntries(waveCounts),
    liveCount: roadmapLivePaths.size,
    plannedCount: pages.length - roadmapLivePaths.size,
    routeStatuses: Object.fromEntries(countBy(pages, "routeStatus")),
    libraryReadiness: Object.fromEntries(countBy(pages, "libraryReadiness")),
    blockedParentCount: warnings.length,
    intentStatuses: Object.fromEntries(countBy(pages, "intentStatus")),
    briefStatuses: Object.fromEntries(briefStatuses),
    linkBriefStatuses: Object.fromEntries(linkBriefStatuses),
    searchBriefStatuses: Object.fromEntries(searchBriefStatuses),
    pageFamilies: Object.fromEntries(countBy(pages, "pageFamily")),
    priorityLanes: Object.fromEntries(countBy(pages, "priorityLane")),
    prioritySignalCount: pages.filter((page) => page.prioritySignals).length,
    claimRiskClasses: Object.fromEntries(countBy(pages, "claimRiskClass")),
    riskDomains: Object.fromEntries(countBy(pages, "riskDomain")),
    conversionModes: Object.fromEntries(countBy(pages, "conversionMode")),
    productTruthScopes: Object.fromEntries(countBy(pages, "productTruthScope")),
    primaryCtas: Object.fromEntries(
      [...countBy(pages, "primaryCta")].map(([key, value]) => [key ?? "none", value]),
    ),
    orphanCount: orphans.length,
    siteMapPillarCount: siteMapPillarPaths.size,
    warnings,
  };
}

function main() {
  const roadmap = JSON.parse(readFileSync(roadmapPath, "utf8"));
  console.log(JSON.stringify(validateRoadmap(roadmap), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
