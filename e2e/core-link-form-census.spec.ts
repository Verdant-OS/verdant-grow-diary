// Runtime browser census for Verdant's grower surfaces, including the
// completed Claude Daily Check, pricing, credit-pack, and Pheno work.
//
// SAFETY:
// - Runs only in the chromium-mocked project.
// - Uses either no session or a clearly fake session.
// - Intercepts every Supabase auth, REST, storage, and edge-function request
//   from the primary page and any popup it opens.
// - Blocks every unapproved mutation and external fetch.
// - Never submits a form, invokes AI, uploads a file, changes billing, writes
//   Action Queue state, ingests sensor data, or controls a device.
// - Exercises Claude-finished surfaces without reviving superseded branches.
import {
  expect,
  test,
  type BrowserContext,
  type ElementHandle,
  type Locator,
  type Page,
} from "@playwright/test";
import { APP_ROUTES } from "../src/lib/appRouteManifest";
import {
  AUTHENTICATED_CORE_CENSUS_ROUTES,
  PUBLIC_CORE_CENSUS_ROUTES,
  classifyLink,
  expectedCensusNavigationPath,
  fallbackSelectExerciseFailureIsFatal,
  isReadOnlyEdgeFunction,
  isReadOnlyRpc,
  isSafelyFillableFieldType,
  placeholderValueForField,
  selectAvailableAlternativeValue,
  visibleLinkByHrefSelector,
  type CoreCensusRoute,
  type LinkClassification,
} from "./lib/coreLinkFormCensus";

const MOCKED_PROJECT = "chromium-mocked";
const APP_ORIGIN = new URL(process.env.E2E_BASE_URL?.trim() || "http://localhost:5173").origin;
const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SESSION_KEY = `sb-${PROJECT_REF}-auth-token`;
const USER_ID = "99999999-9999-4999-8999-999999999999";
const GROW_ID = "11111111-1111-4111-8111-111111111111";
const REPORT_GROW_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const TENT_ID = "22222222-2222-4222-8222-222222222222";
const PLANT_ID = "33333333-3333-4333-8333-333333333333";
const SECOND_PLANT_ID = "66666666-6666-4666-8666-666666666666";
const PHENO_HUNT_ID = "55555555-5555-4555-8555-555555555555";
const ACTION_ID = "77777777-7777-4777-8777-777777777777";
const ALERT_ID = "88888888-8888-4888-8888-888888888888";
const BREEDING_PROGRAM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AI_SESSION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACCESSION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const BATCH_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const LEARNING_ACTION_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const SCREENING_RESULT_ID = "abababab-abab-4bab-8bab-abababababab";
const MANIFEST_PATTERNS = APP_ROUTES.map((route) => route.path);
const CURRENT_AGREEMENTS = [
  { agreement_type: "terms", version: "2026-07-13" },
  { agreement_type: "privacy", version: "2026-07-13" },
];

const FAKE_USER = {
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "core-census@example.invalid",
  email_confirmed_at: "2020-01-01T00:00:00.000Z",
  confirmed_at: "2020-01-01T00:00:00.000Z",
  identities: [],
  user_metadata: {
    display_name: "Verdant Census Grower",
    email_verified: true,
    onboarding_completed: true,
  },
};

const GROW = {
  id: GROW_ID,
  user_id: USER_ID,
  name: "Core Census Grow",
  grow_type: "tent",
  stage: "vegetative",
  notes: "Mocked browser fixture. Not live cultivation data.",
  started_at: "2026-07-01T00:00:00.000Z",
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
  is_archived: false,
};

const REPORT_GROW = {
  ...GROW,
  id: REPORT_GROW_ID,
  name: "Core Census Completed Grow",
  stage: "harvest",
  notes: "Dedicated mocked report fixture. Not live cultivation data.",
  is_archived: true,
};

const TENT = {
  id: TENT_ID,
  user_id: USER_ID,
  grow_id: GROW_ID,
  name: "Core Census Tent",
  brand: null,
  size: "4x4",
  stage: "vegetative",
  light_on: true,
  light_schedule: "18/6",
  light_wattage: 480,
  is_archived: false,
  created_at: "2026-07-01T00:00:00.000Z",
};

const PLANT = {
  id: PLANT_ID,
  user_id: USER_ID,
  grow_id: GROW_ID,
  tent_id: TENT_ID,
  name: "Core Census Plant",
  strain: "Sour Stomper",
  stage: "vegetative",
  started_at: "2026-07-01T00:00:00.000Z",
  health: "healthy",
  plant_type: "autoflower",
  photo_url: null,
  last_note: "Mocked fixture note.",
  is_archived: false,
  medium: "soil",
  pot_size: "3 gal",
  pheno_hunt_id: PHENO_HUNT_ID,
  candidate_label: "SS #1",
  candidate_number: 1,
};

const SECOND_PLANT = {
  ...PLANT,
  id: SECOND_PLANT_ID,
  name: "Core Census Plant Two",
  candidate_label: "SS #2",
  candidate_number: 2,
};

const PHENO_HUNT = {
  id: PHENO_HUNT_ID,
  user_id: USER_ID,
  grow_id: GROW_ID,
  tent_id: TENT_ID,
  name: "Core Census Sour Stomper Hunt",
  notes: "Mocked browser fixture. No live phenotype evidence.",
  evidence_goals: ["structure", "aroma"],
  breeding_objective: [],
  setup_completed_at: "2026-07-02T00:00:00.000Z",
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-02T00:00:00.000Z",
  plants: [{ count: 2 }],
};

const PROFILE = {
  id: USER_ID,
  user_id: USER_ID,
  display_name: "Verdant Census Grower",
  username: "verdant-census",
  onboarding_completed: true,
  onboarding_completed_at: "2026-07-01T00:00:00.000Z",
  temperature_unit: "fahrenheit",
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
};

const DIARY_ENTRY = {
  id: "44444444-4444-4444-8444-444444444444",
  user_id: USER_ID,
  grow_id: GROW_ID,
  tent_id: TENT_ID,
  plant_id: PLANT_ID,
  entry_type: "observation",
  entry_at: "2026-07-26T13:00:00.000Z",
  note: "Mocked observation. Not live cultivation evidence.",
  notes: "Mocked observation. Not live cultivation evidence.",
  details: { event_type: "observation" },
  created_at: "2026-07-26T13:00:00.000Z",
};

const ACTION = {
  id: ACTION_ID,
  user_id: USER_ID,
  grow_id: GROW_ID,
  tent_id: TENT_ID,
  plant_id: PLANT_ID,
  source: "ai_doctor",
  action_type: "observation_followup",
  target_metric: null,
  target_device: null,
  suggested_change: "Recheck canopy conditions before making any adjustment",
  reason: `[session:${AI_SESSION_ID}] Mocked AI Doctor follow-up with no sensor snapshot.`,
  risk_level: "low",
  status: "pending_approval",
  approved_at: null,
  rejected_at: null,
  completed_at: null,
  originating_timeline_events: [],
  created_at: "2026-07-18T12:00:00.000Z",
  updated_at: "2026-07-18T12:00:00.000Z",
};

const LEARNING_ACTION = {
  ...ACTION,
  id: LEARNING_ACTION_ID,
  source: "manual",
  action_type: "environment_review",
  suggested_change: "Keep the environment stable and record the observed response",
  reason: "Mocked completed action for the grow learning census.",
  status: "completed",
  completed_at: "2026-07-20T12:00:00.000Z",
  updated_at: "2026-07-20T12:00:00.000Z",
};

const ALERT = {
  id: ALERT_ID,
  user_id: USER_ID,
  grow_id: GROW_ID,
  tent_id: TENT_ID,
  plant_id: PLANT_ID,
  source: "environment_alerts",
  severity: "watch",
  metric: "vpd",
  title: "Mocked VPD review",
  reason: "Mocked browser fixture; verify context before acting.",
  status: "open",
  first_seen_at: "2026-07-18T12:00:00.000Z",
  last_seen_at: "2026-07-18T12:00:00.000Z",
  acknowledged_at: null,
  resolved_at: null,
  created_at: "2026-07-18T12:00:00.000Z",
  updated_at: "2026-07-18T12:00:00.000Z",
  originating_timeline_events: [],
};

const AI_SESSION = {
  id: AI_SESSION_ID,
  user_id: USER_ID,
  created_at: "2026-07-18T12:00:00.000Z",
  plant_id: PLANT_ID,
  tent_id: TENT_ID,
  grow_id: GROW_ID,
  question: "What should I verify next?",
  diagnosis: {
    summary: "Verify environmental context before changing the crop plan.",
    likelyIssue: "Not enough evidence for a diagnosis",
    confidence: 0.35,
    evidence: ["Grower observation only"],
    missingInformation: ["Calibrated canopy temperature", "Verified relative humidity"],
    possibleCauses: ["Normal short-term variation"],
    immediateAction: "Collect another calibrated observation.",
    whatNotToDo: ["Do not change irrigation or nutrients from this single observation."],
    followUp24h: {
      summary: "Compare a second observation at the same point in the light cycle.",
      checklist: ["Capture calibrated canopy temperature and relative humidity."],
    },
    recoveryPlan3d: {
      summary: "Keep conditions stable while gathering evidence.",
      checklist: ["Log one comparable observation each day."],
    },
    riskLevel: "low",
    suggestedActions: [],
  },
  raw_confidence: 0.35,
  displayed_confidence: 0.35,
  context_confidence_ceiling: "low",
  suggested_actions: [],
};

const BREEDING_PROGRAM = {
  id: BREEDING_PROGRAM_ID,
  user_id: USER_ID,
  name: "Core Census Breeding Program",
  status: "active",
  sop_version: "v1",
  starting_generation: "P1",
  p1_maternal_label: "Mocked maternal parent",
  p1_paternal_label: "Mocked paternal parent",
  cross_pair_label: "Mocked cross",
  target_traits: ["structure"],
  grow_id: GROW_ID,
  tent_id: TENT_ID,
  current_step_id: null,
  notes: "Mocked browser fixture. No live breeding evidence.",
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
};

const ACCESSION = {
  id: ACCESSION_ID,
  user_id: USER_ID,
  source_kind: "seed",
  source_party: "Mocked breeder",
  cultivar_name: "Sour Stomper",
  line_name: null,
  generation: "F1",
  acquisition_date: "2026-07-01",
  known_state: "known",
  archived_at: null,
  created_at: "2026-07-01T00:00:00.000Z",
};

const BATCH = {
  id: BATCH_ID,
  user_id: USER_ID,
  batch_code: "CENSUS-BATCH-1",
  name: "Core Census Batch",
  propagation_method: "seed",
  source_accession_id: ACCESSION_ID,
  mother_plant_id: null,
  origin_unknown: false,
  initial_quantity: 6,
  viable_quantity: 6,
  counts_unknown: false,
  status: "active",
  created_at: "2026-07-01T00:00:00.000Z",
};

const SCREENING_RESULT = {
  id: SCREENING_RESULT_ID,
  user_id: USER_ID,
  subject_type: "accession",
  subject_id: ACCESSION_ID,
  target: "HLVd",
  result: "negative",
  laboratory: "Synthetic census laboratory",
  collected_date: "2026-07-02",
  result_date: "2026-07-03",
  supersedes_id: null,
  recorded_at: "2026-07-03T00:00:00.000Z",
};

const QUARANTINE_EPISODE = {
  id: "acacacac-acac-4cac-8cac-acacacacacac",
  user_id: USER_ID,
  subject_type: "accession",
  subject_id: ACCESSION_ID,
  target: "HLVd intake review",
  status: "released",
  opened_at: "2026-07-01T00:00:00.000Z",
  reopened_at: null,
  closed_at: "2026-07-03T00:00:00.000Z",
  closure_kind: "cleared",
  closure_screening_result_id: SCREENING_RESULT_ID,
};

const BILLING_SUBSCRIPTIONS = ["live", "sandbox"].map((environment) => ({
  user_id: USER_ID,
  paddle_subscription_id: `lifetime_core_census_${environment}`,
  paddle_customer_id: `customer_core_census_${environment}`,
  product_id: "founder_lifetime",
  price_id: "founder_lifetime",
  status: "active",
  current_period_start: "2026-07-01T00:00:00.000Z",
  current_period_end: null,
  cancel_at_period_end: false,
  environment,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
}));

type NetworkAudit = {
  blockedMutations: string[];
  unexpectedExternalFetches: string[];
  mockedReadRequests: number;
};

type FieldAudit = {
  route: string;
  name: string;
  type: string;
  exercised: boolean;
  reason?: string;
};

type LinkAudit = {
  sourcePath: string;
  href: string;
  name: string;
  classification: LinkClassification;
};

type RouteAudit = {
  path: string;
  label: string;
  finalPath: string;
  visibleFields: number;
  visibleLinks: number;
};

type LaneReport = {
  lane: "public" | "authenticated";
  routeAudits: RouteAudit[];
  fieldAudits: FieldAudit[];
  linkAudits: LinkAudit[];
  clickedInternalHrefs: string[];
  consoleErrors: string[];
  pageErrors: string[];
  network: NetworkAudit;
};

function rowsForTable(table: string): unknown[] {
  switch (table) {
    case "profiles":
      return [PROFILE];
    case "grows":
      return [GROW, REPORT_GROW];
    case "tents":
      return [TENT];
    case "plants":
      return [PLANT, SECOND_PLANT];
    case "pheno_hunts":
      return [PHENO_HUNT];
    case "diary_entries":
      return [DIARY_ENTRY];
    case "action_queue":
      return [ACTION, LEARNING_ACTION];
    case "action_queue_events":
    case "alert_events":
    case "ai_doctor_session_reviews":
    case "breeding_program_steps":
    case "breeding_step_evidence":
      return [];
    case "genetics_screening_results":
      return [SCREENING_RESULT];
    case "quarantine_episodes":
      return [QUARANTINE_EPISODE];
    case "alerts":
      return [ALERT];
    case "ai_doctor_sessions":
      return [AI_SESSION];
    case "breeding_programs":
      return [BREEDING_PROGRAM];
    case "genetics_accessions":
      return [ACCESSION];
    case "propagation_batches":
      return [BATCH];
    case "user_agreement_acceptances":
      return CURRENT_AGREEMENTS;
    case "billing_subscriptions":
    case "subscriptions":
      return BILLING_SUBSCRIPTIONS;
    default:
      return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rowsForRestRequest(table: string, url: URL): unknown[] {
  let rows = rowsForTable(table);

  for (const [field, filter] of url.searchParams) {
    if (!rows.some((row) => isRecord(row) && field in row)) continue;

    if (filter.startsWith("eq.")) {
      const requested = filter.slice("eq.".length);
      rows = rows.filter((row) => isRecord(row) && String(row[field]) === requested);
      continue;
    }

    if (filter.startsWith("in.(") && filter.endsWith(")")) {
      const requested = new Set(
        filter
          .slice("in.(".length, -1)
          .split(",")
          .map((value) => value.replace(/^"|"$/g, "")),
      );
      rows = rows.filter((row) => isRecord(row) && requested.has(String(row[field])));
      continue;
    }

    if (filter.startsWith("like.")) {
      const pattern = filter.slice("like.".length);
      const needle = pattern.replaceAll("%", "");
      rows = rows.filter((row) => isRecord(row) && String(row[field]).includes(needle));
      continue;
    }

    if (filter === "is.null") {
      rows = rows.filter((row) => isRecord(row) && row[field] == null);
    }
  }

  return rows;
}

async function seedFakeSession(context: BrowserContext) {
  await context.addInitScript(
    ({ appOrigin, key, user }) => {
      if (location.origin !== appOrigin) return;
      try {
        sessionStorage.setItem(
          key,
          JSON.stringify({
            access_token: "FAKE-ACCESS-TOKEN-NOT-REAL",
            refresh_token: "FAKE-REFRESH-TOKEN-NOT-REAL",
            token_type: "bearer",
            expires_in: 21_600,
            expires_at: Math.floor(Date.now() / 1000) + 21_600,
            user,
          }),
        );
      } catch {
        // Sandboxed frames can intentionally deny storage access. They neither
        // need nor receive the fake authenticated census session.
      }
    },
    { appOrigin: APP_ORIGIN, key: SESSION_KEY, user: FAKE_USER },
  );
}

async function installNetworkFence(
  context: BrowserContext,
  signedIn: boolean,
  network: NetworkAudit,
) {
  // Register the broad external fence first. Playwright runs the most recently
  // registered matching route first, so the explicit safe mocks below win.
  await context.route("**/*", async (route, request) => {
    const url = new URL(request.url());
    if (url.origin === APP_ORIGIN) {
      await route.continue();
      return;
    }
    if (!["image", "font", "media"].includes(request.resourceType())) {
      network.unexpectedExternalFetches.push(`${request.method()} ${request.url()}`);
    }
    await route.abort("blockedbyclient");
  });

  await context.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/css", body: "" }),
  );
  await context.route("https://fonts.gstatic.com/**", (route) => route.abort("blockedbyclient"));
  await context.route(
    /google-analytics\.com|googletagmanager\.com|doubleclick\.net|posthog\.com|sentry\.io|clarity\.ms/,
    (route) => route.abort("blockedbyclient"),
  );

  await context.route(/\/auth\/v1\//, async (route, request) => {
    network.mockedReadRequests += 1;
    if (/\/user(?:\?|$)/i.test(request.url())) {
      await route.fulfill({
        status: signedIn ? 200 : 401,
        contentType: "application/json",
        body: JSON.stringify(
          signedIn
            ? FAKE_USER
            : { code: "not_authenticated", message: "Synthetic signed-out census" },
        ),
      });
      return;
    }
    if (request.method() !== "GET") {
      network.blockedMutations.push(`${request.method()} ${request.url()}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await context.route(/\/rest\/v1\//, async (route, request) => {
    const url = new URL(request.url());
    const rpcName = url.pathname.match(/\/rest\/v1\/rpc\/([^/]+)/i)?.[1] ?? "";
    const isRead = request.method() === "GET" || request.method() === "HEAD";
    const isReadRpc = request.method() === "POST" && isReadOnlyRpc(rpcName);
    if (!isRead && !isReadRpc) {
      network.blockedMutations.push(`${request.method()} ${request.url()}`);
      await route.abort("blockedbyclient");
      return;
    }

    network.mockedReadRequests += 1;
    if (rpcName) {
      const body =
        rpcName === "genetics_trace_resolve"
          ? {
              ok: true,
              subject: { kind: "accession", id: ACCESSION_ID },
              direction: "both",
              truncated: false,
              node_count: 1,
              nodes: [
                {
                  key: `accession:${ACCESSION_ID}`,
                  kind: "accession",
                  id: ACCESSION_ID,
                  depth: 0,
                  label: "Core Census Sour Stomper Accession",
                  from: null,
                  edge_type: null,
                  evidence: {
                    state: "negative_scoped",
                    targets: [
                      {
                        target: "HLVd",
                        result: "negative",
                        collected_date: "2026-07-02",
                      },
                    ],
                    open_quarantine: false,
                  },
                  gaps: [],
                },
              ],
              edges: [],
            }
          : rpcName === "has_role"
            ? false
            : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
      return;
    }

    const table = url.pathname.match(/\/rest\/v1\/([^/]+)/i)?.[1] ?? "";
    const rows = rowsForRestRequest(table, url);
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Content-Range": rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : "*/0",
      "Preference-Applied": "count=exact",
    };
    if (request.method() === "HEAD") {
      await route.fulfill({ status: 200, headers });
      return;
    }
    const wantsObject = request.headers().accept?.includes("application/vnd.pgrst.object+json");
    await route.fulfill({
      status: 200,
      headers,
      contentType: "application/json",
      body: JSON.stringify(wantsObject ? (rows[0] ?? null) : rows),
    });
  });

  await context.route(/\/storage\/v1\//, async (route, request) => {
    if (!["GET", "HEAD"].includes(request.method())) {
      network.blockedMutations.push(`${request.method()} ${request.url()}`);
      await route.abort("blockedbyclient");
      return;
    }
    network.mockedReadRequests += 1;
    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await context.route(/\/functions\/v1\//, async (route, request) => {
    const functionName = new URL(request.url()).pathname.split("/").filter(Boolean).at(-1) ?? "";
    const readLike = isReadOnlyEdgeFunction(functionName);
    if (!readLike) {
      network.blockedMutations.push(`${request.method()} ${request.url()}`);
    } else {
      network.mockedReadRequests += 1;
    }
    const premiumExportAllowed = functionName === "premium-export-entitlement";
    await route.fulfill(
      premiumExportAllowed
        ? {
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              ok: true,
              display_plan_id: "founder_lifetime",
            }),
          }
        : {
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({
              error: "Synthetic census: edge function not invoked",
            }),
          },
    );
  });
}

function installContextErrorAudit(context: BrowserContext, report: LaneReport) {
  context.on("weberror", (webError) => {
    const source = webError.page()?.url() || webError.location().url || "unknown page";
    report.pageErrors.push(`${source}: ${webError.error().message}`);
  });
  context.on("console", (message) => {
    if (message.type() === "error") {
      const source = message.page()?.url() || message.location().url || "unknown page";
      report.consoleErrors.push(`${source}: ${message.text()}`);
    }
  });
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

async function accessibleNameForControl(
  locator: Locator | ElementHandle<SVGElement | HTMLElement>,
): Promise<string> {
  return locator.evaluate((element) => {
    const htmlElement = element as HTMLElement;
    const ariaLabel = htmlElement.getAttribute("aria-label")?.trim();
    if (ariaLabel) return ariaLabel;

    const labelledBy = htmlElement.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) return text;
    }

    if (element instanceof HTMLInputElement && element.labels?.length) {
      const text = Array.from(element.labels)
        .map((label) => label.textContent ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) return text;
    }
    if (element instanceof HTMLTextAreaElement && element.labels?.length) {
      const text = Array.from(element.labels)
        .map((label) => label.textContent ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) return text;
    }
    if (element instanceof HTMLSelectElement && element.labels?.length) {
      const text = Array.from(element.labels)
        .map((label) => label.textContent ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) return text;
    }

    return (
      htmlElement.getAttribute("placeholder")?.trim() ||
      htmlElement.getAttribute("title")?.trim() ||
      ""
    );
  });
}

async function controlType(
  locator: Locator | ElementHandle<SVGElement | HTMLElement>,
): Promise<string> {
  return locator.evaluate((element) => {
    if (element instanceof HTMLInputElement) return element.type || "text";
    if (element instanceof HTMLTextAreaElement) return "textarea";
    if (element instanceof HTMLSelectElement) return "select";
    return element.getAttribute("role") || element.tagName.toLowerCase();
  });
}

async function isVisuallyHiddenImplementationControl(
  locator: Locator | ElementHandle<SVGElement | HTMLElement>,
): Promise<boolean> {
  return locator.evaluate((element) => {
    const htmlElement = element as HTMLElement;
    if (htmlElement.getAttribute("aria-hidden") === "true") return true;
    const style = getComputedStyle(htmlElement);
    const bounds = htmlElement.getBoundingClientRect();
    const clipped =
      style.clip === "rect(0px, 0px, 0px, 0px)" ||
      style.clipPath === "inset(50%)" ||
      style.overflow === "hidden";
    return style.position === "absolute" && bounds.width <= 1 && bounds.height <= 1 && clipped;
  });
}

async function auditAndExerciseFields(page: Page, route: CoreCensusRoute): Promise<FieldAudit[]> {
  const controls = page.locator(
    "input:not([type='hidden']), textarea, select, [contenteditable='true']",
  );
  const audits: FieldAudit[] = [];
  const reauditedIndexes = new Set<number>();

  for (let index = 0; index < (await controls.count()); index += 1) {
    const control = controls.nth(index);
    // Pin the node FIRST — before even the visibility gates — so every
    // per-control read below (visibility, name, type, actionability,
    // exercise) describes this one element: any read through the live nth()
    // query can straddle a reorder onto a sibling.
    const pinnedControl = await control.elementHandle({ timeout: 1_000 }).catch(() => null);
    // Every skip driven by the pinned node's state must first ask whether the
    // live index still holds that node: a visible replacement that displaced
    // a hidden, detached, or unpinnable predecessor deserves its own audit
    // pass, bounded to one revisit per index.
    const liveIndexHoldsPinnedNode = async (): Promise<boolean> =>
      pinnedControl
        ? await control
            .evaluate((element, pinned) => element === pinned, pinnedControl, { timeout: 1_000 })
            .catch(() => false)
        : false;
    const reauditIndexOnce = (): void => {
      if (!reauditedIndexes.has(index)) {
        reauditedIndexes.add(index);
        index -= 1;
      }
    };
    if (!pinnedControl) {
      reauditIndexOnce();
      continue;
    }
    if (!(await pinnedControl.isVisible().catch(() => false))) {
      if (!(await liveIndexHoldsPinnedNode())) reauditIndexOnce();
      continue;
    }
    if (await isVisuallyHiddenImplementationControl(pinnedControl)) {
      if (!(await liveIndexHoldsPinnedNode())) reauditIndexOnce();
      continue;
    }

    let name = normalizeText(await accessibleNameForControl(pinnedControl).catch(() => ""));
    if (name === "") {
      // A sibling control's exercise can re-render the page mid-read,
      // transiently reading as unnamed. Re-read THIS pinned element briefly
      // before judging; a genuinely unnamed control stays empty throughout.
      for (let attempt = 0; name === "" && pinnedControl && attempt < 5; attempt += 1) {
        await page.waitForTimeout(250);
        name = normalizeText(await accessibleNameForControl(pinnedControl).catch(() => ""));
      }
      if (name === "") {
        // A pinned node that is still connected and visible after the whole
        // settle window is a genuinely unnamed control and must fail below;
        // one that stayed hidden has nothing left to audit. A node that
        // DETACHED may have a live replacement at this index, so the index is
        // re-audited once — an unnamed replacement must not slip through
        // unaudited just because its predecessor churned away.
        const pinnedState = pinnedControl
          ? await pinnedControl
              .evaluate((element) => ({
                connected: element.isConnected,
                visible:
                  element.getBoundingClientRect().width > 0 &&
                  element.getBoundingClientRect().height > 0 &&
                  getComputedStyle(element).visibility !== "hidden",
              }))
              .catch(() => ({ connected: false, visible: false }))
          : { connected: false, visible: false };
        if (!(pinnedState.connected && pinnedState.visible)) {
          // Re-audit once if the live index no longer resolves to the pinned
          // node — whether it detached or a visible replacement displaced a
          // connected-but-hidden predecessor — so an unnamed replacement
          // cannot escape the census. An index still holding the pinned
          // (hidden or gone) node has nothing else to audit.
          const indexStillPinnedNode = await control
            .evaluate((element, pinned) => pinned !== null && element === pinned, pinnedControl, {
              timeout: 1_000,
            })
            .catch(() => false);
          if (!indexStillPinnedNode && !reauditedIndexes.has(index)) {
            reauditedIndexes.add(index);
            index -= 1;
          }
          continue;
        }
      }
    }
    const type = await controlType(pinnedControl ?? control);
    expect(name, `${route.path} has a visible ${type} field without a user-facing name`).not.toBe(
      "",
    );

    // The audited identity is the pinned node. If a reorder moved the live
    // index off it, every later check and action would describe a DIFFERENT
    // control under this name and type — re-audit the index once instead of
    // misattributing.
    if (!(await liveIndexHoldsPinnedNode())) {
      reauditIndexOnce();
      continue;
    }

    // An actionability read that fails (the pinned node detached mid-read)
    // must not be coerced into a "read-only" classification — the failure is
    // preserved as null and triggers the bounded index re-audit so a visible
    // replacement gets audited instead.
    const disabled = await pinnedControl.isDisabled().catch(() => null);
    const editable = await pinnedControl.isEditable().catch(() => null);
    if (disabled === null || editable === null) {
      reauditIndexOnce();
      continue;
    }
    if (
      route.fieldPolicy === "audit-only" ||
      disabled ||
      !editable ||
      !isSafelyFillableFieldType(type)
    ) {
      audits.push({
        route: route.path,
        name,
        type,
        exercised: false,
        reason:
          route.fieldPolicy === "audit-only"
            ? "route is audit-only"
            : disabled
              ? "disabled"
              : !editable
                ? "read-only"
                : "control type is intentionally audit-only",
      });
      continue;
    }

    if (type === "select") {
      const namedControl = page.getByRole("combobox", { name, exact: true });
      const hasStableNamedControl = (await namedControl.count()) === 1;
      const stableControl = hasStableNamedControl ? namedControl : control;
      // The fallback identity is the SAME pinned node the name and type were
      // read from — acquiring a fresh handle here could pin a sibling after a
      // reorder while name/type still describe the original. Repeated selects
      // can share an identical option list, so on failure only this node
      // identity can distinguish "the nth() index moved to a look-alike
      // sibling" (churn) from "this very element dropped the value" (product
      // defect).
      const fallbackSnapshotHandle = hasStableNamedControl ? null : pinnedControl;
      // A fallback control that cannot be pinned cannot be exercised with an
      // identity guarantee — exercising the live nth() query instead could
      // snapshot one select and act on a later look-alike at that index.
      if (!hasStableNamedControl && fallbackSnapshotHandle === null) {
        audits.push({
          route: route.path,
          name,
          type,
          exercised: false,
          reason: "could not pin the control before exercising it",
        });
        continue;
      }
      const snapshotTarget = fallbackSnapshotHandle ?? stableControl;
      const selectSnapshot = await snapshotTarget.evaluate((element) => {
        const select = element as HTMLSelectElement;
        return {
          currentValue: select.value,
          // :disabled captures effective disablement — a direct attribute or
          // an ancestor <fieldset disabled> — matching what Playwright's
          // actionability checks actually honor. Visibility mirrors
          // Playwright's definition: a non-empty box without visibility
          // hidden.
          controlDisabled: select.matches(":disabled"),
          controlVisible:
            select.getBoundingClientRect().width > 0 &&
            select.getBoundingClientRect().height > 0 &&
            getComputedStyle(select).visibility !== "hidden",
          options: Array.from(select.options, (option) => ({
            value: option.value,
            disabled: option.disabled,
          })),
        };
      });
      const original = selectSnapshot.currentValue;
      const alternative = selectAvailableAlternativeValue(selectSnapshot.options, original);
      if (!alternative) {
        audits.push({
          route: route.path,
          name,
          type,
          exercised: false,
          reason: "no safe alternative option",
        });
        continue;
      }
      let selectionDispatched = false;
      try {
        if (hasStableNamedControl) {
          await stableControl.selectOption(alternative, { timeout: 5_000 });
          selectionDispatched = true;
          await expect(stableControl).toHaveValue(alternative, { timeout: 5_000 });
        } else {
          // The pinned handle IS the element under audit: acting through it
          // makes exercise and identity atomic, so an index reorder can never
          // route the action or its verification to a look-alike sibling.
          await snapshotTarget.selectOption(alternative, { timeout: 5_000 });
          selectionDispatched = true;
          // A retained handle can read a DETACHED node's stale value, which
          // would equal the alternative and record a false exercise — only a
          // connected node's value counts; detachment yields null and routes
          // through the catch verdict as post-dispatch churn.
          await expect
            .poll(
              () =>
                snapshotTarget.evaluate((element) =>
                  element.isConnected ? (element as HTMLSelectElement).value : null,
                ),
              { timeout: 5_000 },
            )
            .toBe(alternative);
        }
      } catch (error) {
        // A select without a unique accessible-name locator has no stable
        // query; its pinned node can be replaced wholesale by a sibling
        // control's re-render. That churn says nothing about the product, so
        // it downgrades to an unexercised audit entry; a uniquely named
        // control survives re-renders, so its failure is real and still
        // fails the census.
        if (hasStableNamedControl) throw error;
        // Only proven stability stays fatal. Re-read the pinned node and let
        // the pure decision helper judge: the same node still attached and
        // showing the snapshotted state — control disabled flag and full
        // option state alike — means a broken onChange, not churn. A node
        // that detached (evaluate rejects) or was never pinned cannot prove
        // anything.
        const liveState = await snapshotTarget
          .evaluate((element) => {
            const select = element as HTMLSelectElement;
            return {
              // A retained handle can still evaluate a DETACHED node with its
              // state intact ("Element is not attached to the DOM" from the
              // action, unchanged options here) — only a connected node can
              // prove the failure was not a re-render replacing it.
              connected: select.isConnected,
              disabled: select.matches(":disabled"),
              visible:
                select.getBoundingClientRect().width > 0 &&
                select.getBoundingClientRect().height > 0 &&
                getComputedStyle(select).visibility !== "hidden",
              options: Array.from(select.options, (option) => ({
                value: option.value,
                disabled: option.disabled,
              })),
            };
          })
          .catch(() => undefined);
        if (
          fallbackSelectExerciseFailureIsFatal(
            {
              disabled: selectSnapshot.controlDisabled,
              visible: selectSnapshot.controlVisible,
              options: selectSnapshot.options,
            },
            liveState,
            liveState?.connected ?? false,
          )
        ) {
          throw error;
        }
        // Distinct reasons keep the census report honest about WHEN the churn
        // hit: after a dispatched selection, the page reacting with a
        // re-render is evidence the control is live (a handler that throws
        // instead is caught by the lane's pageErrors fence); before dispatch
        // it is plain locator churn.
        audits.push({
          route: route.path,
          name,
          type,
          exercised: false,
          reason: selectionDispatched
            ? "re-rendered in response to selection before value verification"
            : "re-rendered mid-exercise without a unique accessible-name locator",
        });
        continue;
      }

      // A controlled filter can re-render the page and change the live nth()
      // locator during both verification and cleanup. Reacquire a uniquely
      // named control across renders, and restore only when the original option
      // still exists; cleanup must never turn a successfully exercised field
      // into a test-wide timeout.
      if (hasStableNamedControl) {
        const originalStillExists = await stableControl
          .locator("option")
          .evaluateAll(
            (options, expected) =>
              options.some((option) => (option as HTMLOptionElement).value === expected),
            original,
          );
        if (originalStillExists) {
          await stableControl.selectOption(original, { timeout: 5_000 }).catch(() => undefined);
        }
      }
      audits.push({ route: route.path, name, type, exercised: true });
      continue;
    }

    // The fill exercise goes through the same pinned node the name and type
    // describe, so a transient sibling can never absorb the fill and get the
    // original recorded as exercised. Verification stays STRICT — a value
    // that does not stick fails the census; only the resolution is pinned.
    const fillTarget = pinnedControl ?? control;
    const original = await fillTarget.inputValue().catch(() => "");
    const field = {
      type,
      accessibleName: name,
      min: await fillTarget.getAttribute("min"),
      max: await fillTarget.getAttribute("max"),
      step: await fillTarget.getAttribute("step"),
    };
    const placeholder = placeholderValueForField(field);
    let fillDispatched = false;
    try {
      await fillTarget.fill(placeholder, { timeout: 5_000 });
      fillDispatched = true;
      await expect
        .poll(
          () =>
            fillTarget.evaluate((element) =>
              element.isConnected ? ((element as HTMLInputElement).value ?? null) : null,
            ),
          { timeout: 5_000 },
        )
        .toBe(placeholder);
    } catch (error) {
      // Strictness is identity-scoped: a CONNECTED pinned node that failed to
      // take or keep the value is a real defect and still fails the census. A
      // node the page REPLACED mid-exercise (a controlled input remounting in
      // response to the fill) is churn, tagged by phase — the old live-locator
      // assertion silently passed on the replacement, which is exactly the
      // misattribution this path no longer allows.
      const pinnedStillConnected = pinnedControl
        ? await pinnedControl.evaluate((element) => element.isConnected).catch(() => false)
        : true;
      if (pinnedStillConnected) throw error;
      // Cleanup is identity-AGNOSTIC by design: the replacement input holds
      // the dispatched placeholder, and page content derived from it (e.g.
      // the timeline's diary-range link embeds its date values) must return
      // to its original shape before the link phase collects hrefs. Restoring
      // through the live locator is cleanup, not audit — exactly what the
      // pre-pinning code did. But cleanup is only owed when a fill actually
      // DISPATCHED: a pre-dispatch detachment changed nothing, and writing
      // the old value into whatever now holds the index would corrupt it.
      if (fillDispatched) {
        await control.fill(original, { timeout: 5_000 }).catch(() => undefined);
      }
      audits.push({
        route: route.path,
        name,
        type,
        exercised: false,
        reason: fillDispatched
          ? "re-rendered in response to a fill before value verification"
          : "re-rendered before the fill could be dispatched",
      });
      continue;
    }
    // Restore prefers the pinned handle while it remains connected — a
    // reorder without detachment must not restore a sibling and leave the
    // audited field at the placeholder. Only a remount between verification
    // and cleanup falls back to the live locator, whose replacement holds the
    // dispatched placeholder.
    await fillTarget.fill(original, { timeout: 5_000 }).catch(async () => {
      await control.fill(original, { timeout: 5_000 }).catch(() => undefined);
    });
    audits.push({ route: route.path, name, type, exercised: true });
  }

  return audits;
}

async function visibleLinkAudits(page: Page, sourcePath: string): Promise<LinkAudit[]> {
  const rawLinks = await page.locator("a[href]").evaluateAll((elements) =>
    elements
      .filter((element) => {
        const htmlElement = element as HTMLElement;
        const style = getComputedStyle(htmlElement);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          htmlElement.getClientRects().length > 0
        );
      })
      .map((element) => {
        const htmlElement = element as HTMLAnchorElement;
        const imageAlt = Array.from(htmlElement.querySelectorAll("img"))
          .map((image) => image.alt)
          .join(" ");
        return {
          href: htmlElement.getAttribute("href"),
          download: htmlElement.hasAttribute("download"),
          name:
            htmlElement.getAttribute("aria-label") ||
            htmlElement.textContent ||
            imageAlt ||
            htmlElement.title ||
            "",
        };
      }),
  );

  return rawLinks.map((link) => {
    const name = normalizeText(link.name);
    expect(name, `${sourcePath} has a visible link without accessible text`).not.toBe("");
    const classification = classifyLink(link, MANIFEST_PATTERNS, APP_ORIGIN);
    expect(
      classification.disposition,
      `${sourcePath} contains ${classification.reason ?? "an invalid link"}: ${link.href}`,
    ).not.toBe("unsafe");
    expect(
      classification.disposition,
      `${sourcePath} links to a same-origin path missing from APP_ROUTES: ${link.href}`,
    ).not.toBe("unknown-route");
    return {
      sourcePath,
      href: link.href ?? "",
      name,
      classification,
    };
  });
}

async function assertMeaningfulPage(page: Page, expectedPath: string) {
  await page.waitForLoadState("domcontentloaded");
  await expect(
    page.locator("main").first(),
    `${expectedPath} must finish the app-shell loading state`,
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText("Loading…", { exact: true }),
    `${expectedPath} must not remain on the global loading screen`,
  ).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator("body")).not.toContainText("Oops! Page not found");
  await expect(page.locator("body")).not.toContainText("Application error");
  await expect(page.locator("body")).not.toContainText("ChunkLoadError");
  await expect
    .poll(
      async () =>
        normalizeText(
          await page
            .locator("main, body")
            .first()
            .innerText()
            .catch(() => ""),
        ).length,
      { message: `${expectedPath} must render meaningful page content` },
    )
    .toBeGreaterThan(40);

  const reconsentGate = page.getByTestId("agreement-reconsent-gate");
  await expect(
    reconsentGate,
    `${expectedPath} should not be hidden behind the legal re-consent gate in the accepted fixture`,
  ).toHaveCount(0);
}

async function assertExpectedRouteContent(page: Page, route: CoreCensusRoute) {
  const main = page.locator("main").first();

  for (const expected of route.expectedContent ?? []) {
    const locator =
      expected.kind === "test-id"
        ? main.getByTestId(expected.value).first()
        : expected.kind === "heading"
          ? main.getByRole("heading", { name: expected.value, exact: true }).first()
          : main.getByLabel(expected.value, { exact: true }).first();

    await expect(
      locator,
      `${route.path} must render its ${expected.kind} success contract: ${expected.value}`,
    ).toBeVisible({ timeout: 15_000 });

    if (expected.kind === "test-id" && expected.text) {
      await expect(
        locator,
        `${route.path} must render fixture-backed content in ${expected.value}`,
      ).toContainText(expected.text);
    }
  }
}

async function navigateForAudit(page: Page, route: CoreCensusRoute) {
  const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
  expect(response?.status() ?? 200, `${route.path} document response`).toBeLessThan(400);
  await assertMeaningfulPage(page, route.path);
  const finalPath = new URL(page.url()).pathname;
  const expectedPathname = route.expectedPathname ?? new URL(route.path, APP_ORIGIN).pathname;
  expect(finalPath, `${route.path} unexpectedly redirected`).toBe(expectedPathname);
  await assertExpectedRouteContent(page, route);
  return finalPath;
}

async function clickEverySafeInternalHref(
  page: Page,
  linkAudits: readonly LinkAudit[],
  signedIn: boolean,
): Promise<string[]> {
  const unique = new Map<string, LinkAudit>();
  for (const link of linkAudits) {
    if (link.classification.disposition !== "navigate") continue;
    if (!unique.has(link.href)) unique.set(link.href, link);
  }

  const clicked: string[] = [];
  for (const link of unique.values()) {
    await test.step(`click ${link.href} from ${link.sourcePath}`, async () => {
      await page.goto(link.sourcePath, { waitUntil: "domcontentloaded" });
      await assertMeaningfulPage(page, link.sourcePath);
      const anchor = page.locator(visibleLinkByHrefSelector(link.href)).first();
      // A data-dependent link can render on one visit and miss on the next
      // while its page's queries settle (observed: the dashboard's grow link
      // when the mocked grow list resolves empty on a revisit). One full
      // reload gives the data a second chance; a link that is still missing
      // afterwards fails the census exactly as before.
      const anchorVisibleOnFirstRender = await anchor
        .waitFor({ state: "visible", timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      if (!anchorVisibleOnFirstRender) {
        await page.goto(link.sourcePath, { waitUntil: "domcontentloaded" });
        await assertMeaningfulPage(page, link.sourcePath);
      }
      await expect(anchor, `${link.href} must remain visible on ${link.sourcePath}`).toBeVisible({
        timeout: 10_000,
      });

      const target = await anchor.getAttribute("target");
      const expectedPathname = expectedCensusNavigationPath(
        link.classification.pathname ?? link.href,
        APP_ROUTES,
        signedIn,
      );
      if (target === "_blank") {
        const popupPromise = page.waitForEvent("popup", { timeout: 15_000 });
        await anchor.click();
        const popup = await popupPromise;
        await popup.waitForLoadState("domcontentloaded");
        await expect
          .poll(() => new URL(popup.url()).pathname, {
            message: `${link.href} must finish at its manifest-defined destination`,
          })
          .toBe(expectedPathname);
        await assertMeaningfulPage(popup, expectedPathname);
        await popup.close();
      } else {
        await anchor.click();
        await page.waitForLoadState("domcontentloaded");
        await expect
          .poll(() => new URL(page.url()).pathname, {
            message: `${link.href} must finish at its manifest-defined destination`,
          })
          .toBe(expectedPathname);
        await assertMeaningfulPage(page, expectedPathname);
      }
      clicked.push(link.href);
    });
  }
  return clicked;
}

async function runLaneCensus(
  page: Page,
  lane: LaneReport["lane"],
  routes: readonly CoreCensusRoute[],
): Promise<LaneReport> {
  const context = page.context();
  const signedIn = lane === "authenticated";
  const network: NetworkAudit = {
    blockedMutations: [],
    unexpectedExternalFetches: [],
    mockedReadRequests: 0,
  };
  const report: LaneReport = {
    lane,
    routeAudits: [],
    fieldAudits: [],
    linkAudits: [],
    clickedInternalHrefs: [],
    consoleErrors: [],
    pageErrors: [],
    network,
  };

  installContextErrorAudit(context, report);
  if (signedIn) await seedFakeSession(context);
  await installNetworkFence(context, signedIn, network);

  for (const route of routes) {
    await test.step(`audit ${route.label} (${route.path})`, async () => {
      const pageErrorsBefore = report.pageErrors.length;
      const finalPath = await navigateForAudit(page, route);
      const fields = await auditAndExerciseFields(page, route);
      const links = await visibleLinkAudits(page, route.path);
      report.fieldAudits.push(...fields);
      report.linkAudits.push(...links);
      report.routeAudits.push({
        path: route.path,
        label: route.label,
        finalPath,
        visibleFields: fields.length,
        visibleLinks: links.length,
      });
      expect(
        report.pageErrors.slice(pageErrorsBefore),
        `${route.path} emitted an uncaught browser error`,
      ).toEqual([]);
    });
  }

  report.clickedInternalHrefs = await clickEverySafeInternalHref(page, report.linkAudits, signedIn);

  console.log(
    `[core-census:${lane}] routes=${report.routeAudits.length} fields=${report.fieldAudits.length} exercised=${report.fieldAudits.filter((field) => field.exercised).length} links=${report.linkAudits.length} clicked=${report.clickedInternalHrefs.length} reads=${network.mockedReadRequests}`,
  );

  expect(network.blockedMutations, "the census must never trigger a mutation").toEqual([]);
  expect(
    network.unexpectedExternalFetches,
    "the census must not depend on unmocked external fetches",
  ).toEqual([]);
  expect(report.pageErrors, "the census must not emit uncaught browser errors").toEqual([]);

  await test.info().attach(`${lane}-core-link-form-census.json`, {
    body: Buffer.from(JSON.stringify(report, null, 2)),
    contentType: "application/json",
  });
  return report;
}

test.describe("core link and form census", () => {
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== MOCKED_PROJECT,
      `core census runs once, under the ${MOCKED_PROJECT} project`,
    );
  });

  test("audits every scheduled public page, visible field, and safe internal link", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const report = await runLaneCensus(page, "public", PUBLIC_CORE_CENSUS_ROUTES);
    expect(report.routeAudits).toHaveLength(PUBLIC_CORE_CENSUS_ROUTES.length);
    expect(report.linkAudits.length).toBeGreaterThan(0);
    expect(report.clickedInternalHrefs.length).toBeGreaterThan(0);
  });

  test("audits every scheduled authenticated page, visible field, and safe internal link", async ({
    page,
  }) => {
    test.setTimeout(900_000);
    const report = await runLaneCensus(page, "authenticated", AUTHENTICATED_CORE_CENSUS_ROUTES);
    expect(report.routeAudits).toHaveLength(AUTHENTICATED_CORE_CENSUS_ROUTES.length);
    expect(report.fieldAudits.length).toBeGreaterThan(0);
    expect(report.linkAudits.length).toBeGreaterThan(0);
    expect(report.clickedInternalHrefs.length).toBeGreaterThan(0);
  });
});
