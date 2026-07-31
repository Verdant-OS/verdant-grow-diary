/**
 * Comprehensive recorded phenohunt drive.
 *
 * Drives the whole phenohunt feature in one continuous Chromium session as a
 * first-time Pro user, against a stateful in-memory PostgREST stand-in.
 * Records video, logs every console error / failed request / soft assertion.
 */
import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import {
  IDS,
  makeDb,
  applyFilters,
  latestSexRows,
  embeddedRowFilter,
  insertDefaults,
} from "./mockdb.mjs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8080";
const OUT = process.env.OUT_DIR || "/tmp/phenohunt-recorded-drive";
const SHOTS = `${OUT}/shots`;
mkdirSync(SHOTS, { recursive: true });

const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SESSION_KEY = `sb-${PROJECT_REF}-auth-token`;

const FAKE_USER = {
  id: IDS.USER,
  aud: "authenticated",
  role: "authenticated",
  email: "pheno-e2e@example.invalid",
  email_confirmed_at: "2020-01-01T00:00:00.000Z",
  confirmed_at: "2020-01-01T00:00:00.000Z",
  created_at: "2020-01-01T00:00:00.000Z",
  updated_at: "2020-01-01T00:00:00.000Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { email_verified: true },
  identities: [],
};

// ---------------------------------------------------------------- reporting
const findings = [];
const steps = [];
let currentStep = "boot";

function note(kind, detail, extra = {}) {
  findings.push({ kind, step: currentStep, detail, ...extra });
  console.log(`  [${kind}] ${detail}`);
}

async function step(page, name, fn) {
  currentStep = name;
  const t0 = Date.now();
  console.log(`\n▶ ${name}`);
  let status = "ok";
  try {
    await fn();
  } catch (err) {
    status = "failed";
    note("step-error", `${name}: ${err.message.split("\n")[0]}`);
  }
  const ms = Date.now() - t0;
  steps.push({ name, status, ms });
  try {
    await page.screenshot({
      path: `${SHOTS}/${String(steps.length).padStart(2, "0")}-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`,
    });
  } catch {
    /* screenshot is best-effort */
  }
  return status === "ok";
}

/** Soft assertion — records a defect but keeps the drive going. */
async function expectVisible(page, testId, label) {
  const loc = page.getByTestId(testId).first();
  try {
    await loc.waitFor({ state: "visible", timeout: 8000 });
    return true;
  } catch {
    note("missing-ui", `${label || testId}: expected [data-testid="${testId}"] to be visible`);
    return false;
  }
}

function expect(cond, detail) {
  if (!cond) note("assertion", detail);
  return cond;
}

// pacing so the recording is watchable
const BEAT = Number(process.env.BEAT_MS || 420);
const beat = (page, mult = 1) => page.waitForTimeout(BEAT * mult);

// ---------------------------------------------------------------- mock layer
const db = makeDb();
const writeLog = [];

function jsonBody(request) {
  try {
    const d = request.postData();
    return d ? JSON.parse(d) : null;
  } catch {
    return null;
  }
}

function tableOf(url) {
  return url.pathname.match(/\/rest\/v1\/([^/?]+)/)?.[1] ?? "";
}

function wantsSingle(request) {
  const accept = request.headers()["accept"] || "";
  return accept.includes("vnd.pgrst.object");
}

function respond(route, request, page, status = 200) {
  const paged = !Array.isArray(page) && page != null && Array.isArray(page.rows);
  const arr = paged ? page.rows : Array.isArray(page) ? page : page == null ? [] : [page];
  const total = paged ? page.total : arr.length;
  const offset = paged ? page.offset : 0;
  const headers = {
    "access-control-allow-origin": "*",
    "content-range": arr.length ? `${offset}-${offset + arr.length - 1}/${total}` : `*/${total}`,
    "preference-applied": "count=exact",
  };
  if (wantsSingle(request)) {
    if (arr.length === 0) {
      // PostgREST returns 406 for .single() with no rows; maybeSingle tolerates it.
      return route.fulfill({
        status: 406,
        headers,
        contentType: "application/json",
        body: JSON.stringify({ code: "PGRST116", message: "no rows" }),
      });
    }
    return route.fulfill({
      status,
      headers,
      contentType: "application/json",
      body: JSON.stringify(arr[0]),
    });
  }
  return route.fulfill({
    status,
    headers,
    contentType: "application/json",
    body: JSON.stringify(arr),
  });
}

function readRows(table, url) {
  if (table === "pheno_sex_observations_latest") return applyFilters(latestSexRows(db), url);
  const base = db[table];
  if (!base) {
    note("mock-gap", `read of unmocked table "${table}" → returning []`);
    db[table] = [];
    return [];
  }
  let rows = applyFilters(base, url);
  // Embedded aggregate used by the hunts index: `plants(count)`.
  // PostgREST returns the aggregate as a ONE-ELEMENT array — `[{count: 0}]`
  // when nothing matches, never `[]` (activeCandidateCount throws on `[]`).
  // `plants.is_archived=eq.false` narrows the counted plants, not the hunts.
  const select = url.searchParams.get("select") || "";
  const countEmbed =
    table === "pheno_hunts" && select.match(/(?:^|,)plants(!inner)?\s*\(\s*count\s*\)/);
  if (countEmbed) {
    const keepPlant = embeddedRowFilter(url, "plants");
    rows = rows.map((h) => ({
      ...h,
      plants: [{ count: db.plants.filter((p) => p.pheno_hunt_id === h.id && keepPlant(p)).length }],
    }));
    // Only an `!inner` embed drops parents with no matching children.
    if (countEmbed[1]) rows = rows.filter((h) => h.plants[0].count > 0);
  }
  return rows;
}

/** Filtered + ordered rows, then offset/limit paging with the true total. */
function readPage(table, url) {
  const all = readRows(table, url);
  const offset = Number(url.searchParams.get("offset") || 0) || 0;
  const limitRaw = url.searchParams.get("limit");
  const rows = limitRaw ? all.slice(offset, offset + Number(limitRaw)) : all.slice(offset);
  return { rows, total: all.length, offset };
}

function applyWrite(table, url, request) {
  const method = request.method();
  const body = jsonBody(request);
  const store = (db[table] ||= []);
  writeLog.push({ table, method, body });

  if (method === "POST") {
    const incoming = Array.isArray(body) ? body : [body];
    const saved = incoming.map((row) => {
      const withId = { id: newIdFor(table), ...insertDefaults(table), ...row };
      // Upsert semantics for on_conflict targets.
      const conflict = url.searchParams.get("on_conflict");
      if (conflict) {
        const keys = conflict.split(",");
        const idx = store.findIndex((r) => keys.every((k) => r[k] === row[k]));
        if (idx >= 0) {
          store[idx] = { ...store[idx], ...row };
          return store[idx];
        }
      }
      store.push(withId);
      return withId;
    });
    return saved;
  }

  if (method === "PATCH") {
    const targets = applyFilters(store, url);
    for (const t of targets) Object.assign(t, body);
    return targets;
  }

  if (method === "DELETE") {
    const targets = applyFilters(store, url);
    for (const t of targets) {
      const i = store.indexOf(t);
      if (i >= 0) store.splice(i, 1);
    }
    return targets;
  }
  return [];
}

let idCounter = 0;
function newIdFor(table) {
  const fixed = {
    pheno_hunts: IDS.HUNT,
    pheno_keepers: IDS.KEEPER,
    pheno_keeper_clones: IDS.CLONE,
    pheno_crosses: IDS.CROSS,
    pheno_stress_observations: IDS.STRESS,
  };
  if (fixed[table] && !(db[table] || []).some((r) => r.id === fixed[table])) return fixed[table];
  idCounter += 1;
  const hex = idCounter.toString(16).padStart(12, "0");
  return `99999999-9999-4999-8999-${hex}`;
}

// ---------------------------------------------------------------- the drive
// Prefer an explicit binary (containers with pre-provisioned browsers), else
// let playwright-core resolve its own installed Chromium.
const containerChromium = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const executablePath =
  process.env.CHROMIUM || (existsSync(containerChromium) ? containerChromium : undefined);
const browser = await chromium.launch({
  executablePath,
  args: ["--force-prefers-reduced-motion"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: `${OUT}/video`, size: { width: 1440, height: 900 } },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error") {
    const t = msg.text();
    if (/Failed to load resource|net::ERR_(BLOCKED|FAILED)/.test(t)) return;
    note("console-error", t.slice(0, 300));
  }
});
page.on("pageerror", (err) => note("page-error", String(err).slice(0, 300)));
page.on("requestfailed", (req) => {
  const u = req.url();
  if (/google-analytics|googletagmanager|doubleclick|fonts\.gstatic|sentry/.test(u)) return;
  note("request-failed", `${req.method()} ${u} — ${req.failure()?.errorText}`);
});
page.on("dialog", (d) => d.accept().catch(() => {}));

await page.addInitScript(
  ({ key, user }) => {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        access_token: "FAKE-ACCESS-TOKEN",
        refresh_token: "FAKE-REFRESH-TOKEN",
        token_type: "bearer",
        expires_in: 21600,
        expires_at: Math.floor(Date.now() / 1000) + 21600,
        user,
      }),
    );
  },
  { key: SESSION_KEY, user: FAKE_USER },
);

// third-party noise
await page.route(/google-analytics\.com|googletagmanager\.com|doubleclick\.net|sentry\.io/, (r) =>
  r.abort("blockedbyclient"),
);
await page.route(/fonts\.gstatic\.com/, (r) => r.abort("blockedbyclient"));
await page.route(/fonts\.googleapis\.com/, (r) =>
  r.fulfill({ status: 200, contentType: "text/css", body: "" }),
);

// supabase auth
await page.route(/\/auth\/v1\//, (route, request) => {
  const url = request.url();
  if (/\/user(\?|$)/.test(url)) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(FAKE_USER),
    });
  }
  if (/\/token/.test(url)) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "FAKE-ACCESS-TOKEN",
        refresh_token: "FAKE-REFRESH-TOKEN",
        token_type: "bearer",
        expires_in: 21600,
        user: FAKE_USER,
      }),
    });
  }
  return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
});

// ---- RPC: dispatch per function name; scalar/Json functions answer the BARE
// value (never wrapped in an array), SETOF functions answer arrays.
const RPC_HANDLERS = {
  has_role: (args) =>
    db.user_roles.some((r) => r.user_id === args._user_id && r.role === args._role),
  verdant_search: () => [],
  get_latest_tent_sensor_snapshot: () => null,
  record_signup_acquisition_first_touch: () => ({ ok: true }),
};

// supabase rest
await page.route(/\/rest\/v1\//, (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();
  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    const fn = url.pathname.slice("/rest/v1/rpc/".length);
    const args = jsonBody(request) || {};
    const handler = RPC_HANDLERS[fn];
    if (!handler) {
      // FAIL LOUD — never echo the request body back as if it were a result.
      note("mock-gap", `unmocked RPC "${fn}" args=${JSON.stringify(args)} — refusing to fake it`);
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ code: "42883", message: `mock: no handler for rpc ${fn}` }),
      });
    }
    const value = handler(args);
    return route.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*" },
      contentType: "application/json",
      body: JSON.stringify(value ?? null),
    });
  }
  const table = tableOf(url);
  try {
    if (method === "GET" || method === "HEAD") return respond(route, request, readPage(table, url));
    const written = applyWrite(table, url, request);
    return respond(route, request, written, method === "POST" ? 201 : 200);
  } catch (err) {
    note("mock-error", `${method} ${table}: ${err.message}`);
    return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
  }
});

await page.route(/\/storage\/v1\//, (r) =>
  r.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
);
await page.route(/\/functions\/v1\//, (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
);

// ---- Phase A: arrive as a signed-in Pro user with no hunts yet
await step(page, "A1 open pheno hunts index (first time, empty)", async () => {
  await page.goto(`${BASE}/pheno-hunts`, { waitUntil: "domcontentloaded" });
  await expectVisible(page, "pheno-hunts-index", "hunts index");
  const gate = await page.getByTestId("pheno-tracker-upgrade-gate").count();
  expect(gate === 0, "Pro user still saw the upgrade gate on /pheno-hunts");
  await expectVisible(page, "pheno-hunts-index-empty", "empty state");
  await beat(page, 2);
});

// ---- Phase B: the onboarding wizard, every step
await step(page, "B1 open new hunt wizard", async () => {
  await page.goto(`${BASE}/pheno-hunts/new?growId=${IDS.GROW}`, { waitUntil: "domcontentloaded" });
  await expectVisible(page, "pheno-hunt-onboarding", "onboarding wizard");
  await expectVisible(page, "pheno-step-basics", "step 1 basics");
  await beat(page, 2);
});

await step(page, "B2 step 1 — name and hypothesis", async () => {
  const name = page.getByTestId("ph-name-input");
  await name.click();
  await name.fill("Runtz F2 Pack Hunt");
  await beat(page);
  await page
    .getByTestId("ph-notes-input")
    .fill("Popping a 3-seed pack. Looking for the loudest nose that still finishes on time.");
  await beat(page);
  await page.getByTestId("pheno-step-next").click();
  await expectVisible(page, "pheno-step-candidates", "step 2 candidates");
  await beat(page);
});

await step(page, "B3 step 2 — pick all three candidates", async () => {
  for (const pid of [IDS.PLANT_A, IDS.PLANT_B, IDS.PLANT_C]) {
    await page.getByTestId(`ph-toggle-${pid}`).click();
    await beat(page);
  }
  const status = await page.getByTestId("pheno-candidate-status").innerText();
  expect(
    /eligible/i.test(status),
    `candidate status read "${status}", expected comparison-eligible`,
  );
  await page.getByTestId("pheno-step-next").click();
  await expectVisible(page, "pheno-step-goals", "step 3 evidence goals");
  await beat(page);
});

await step(page, "B4 step 3 — evidence goals", async () => {
  for (const goal of ["post_harvest", "post_cure"]) {
    const t = page.getByTestId(`pheno-evidence-goals-toggle-${goal}`);
    if ((await t.count()) > 0) {
      const checked = await t.first().getAttribute("data-state");
      if (checked !== "checked") await t.first().click();
      await beat(page);
    } else {
      note("missing-ui", `evidence goal toggle pheno-evidence-goals-toggle-${goal} not found`);
    }
  }
  await page.getByTestId("pheno-step-next").click();
  await expectVisible(page, "pheno-step-packet-preview", "step 4 packet preview");
  await beat(page, 2);
});

await step(page, "B5 step 4 — evidence packet preview", async () => {
  await page.getByTestId("pheno-step-next").click();
  await expectVisible(page, "pheno-step-checklist", "step 5 checklist");
  await beat(page, 2);
});

await step(page, "B6 step 5 — comparison-ready checklist", async () => {
  await page.getByTestId("pheno-step-next").click();
  await expectVisible(page, "pheno-step-confirmation", "step 6 confirmation");
  await expectVisible(page, "pheno-confirmation-summary", "confirmation summary");
  await beat(page, 2);
});

await step(page, "B7 step 6 — create the hunt", async () => {
  await page.getByTestId("ph-save-btn").click();
  await page.waitForURL(new RegExp(`/pheno-hunts/${IDS.HUNT}/workspace`), { timeout: 15000 });
  const hunt = db.pheno_hunts[0];
  expect(!!hunt, "no pheno_hunts row was inserted by the wizard");
  expect(hunt?.name === "Runtz F2 Pack Hunt", `hunt name persisted as "${hunt?.name}"`);
  expect(
    Array.isArray(hunt?.evidence_goals) && hunt.evidence_goals.length > 0,
    "hunt saved with empty evidence_goals",
  );
  const tagged = db.plants.filter((p) => p.pheno_hunt_id === IDS.HUNT);
  expect(tagged.length === 3, `expected 3 tagged candidates, got ${tagged.length}`);
  expect(
    tagged.map((p) => p.candidate_label).join(",") === "#1,#2,#3",
    `candidate labels came out as ${tagged.map((p) => p.candidate_label).join(",")}`,
  );
  await beat(page, 2);
});

// ---- Phase C: workspace, empty evidence
await step(page, "C1 workspace loads with no evidence yet", async () => {
  await expectVisible(page, "pheno-workspace", "workspace");
  const count = await page.getByTestId("workspace-visible-count").innerText();
  expect(/3 of 3/.test(count), `visible-count read "${count}"`);
  await beat(page, 2);
});

await step(page, "C2 compare action is correctly blocked", async () => {
  const action = page.getByTestId("pheno-workspace-compare-action");
  if ((await action.count()) === 0) return note("missing-ui", "compare action card absent");
  const enabled = await action.getAttribute("data-enabled");
  expect(enabled === "false", `compare action data-enabled="${enabled}" before any evidence`);
  await expectVisible(page, "pheno-workspace-compare-action-disabled", "disabled compare button");
  await expectVisible(page, "pheno-workspace-compare-action-reason", "blocked reason");
  await beat(page, 2);
});

await step(page, "C3 mark setup complete", async () => {
  const card = page.getByTestId("pheno-workspace-setup-progress");
  if ((await card.count()) === 0) return note("missing-ui", "setup progress card absent");
  expect(
    (await card.getAttribute("data-setup-complete")) === "false",
    "setup card already complete before marking",
  );
  await page.getByTestId("pheno-workspace-setup-progress-mark-complete").click();
  await page.waitForTimeout(1200);
  const after = await card.getAttribute("data-setup-complete");
  expect(after === "true", `setup card still data-setup-complete="${after}" after marking`);
  await beat(page, 2);
});

// ---- Phase D: per-candidate evidence
const CANDIDATES = [
  {
    id: IDS.PLANT_A,
    num: "1",
    decision: "keep",
    sex: "female",
    nose: "9",
    aroma: "gas, sherbet, fuel",
  },
  { id: IDS.PLANT_B, num: "2", decision: "keep", sex: "female", nose: "7", aroma: "candy, citrus" },
  { id: IDS.PLANT_C, num: "3", decision: "cull", sex: "hermaphrodite", nose: "4", aroma: "grassy" },
];

await step(page, "D1 assign candidate numbers", async () => {
  for (const c of CANDIDATES) {
    const input = page.getByTestId(`workspace-assign-number-input-${c.id}`);
    if ((await input.count()) === 0) {
      note("missing-ui", `assign-number input absent for ${c.id} (entitlement gate?)`);
      continue;
    }
    await input.fill(c.num);
    await page.getByTestId(`workspace-assign-number-save-${c.id}`).click();
    await page.waitForTimeout(700);
    const chip = page.getByTestId(`workspace-candidate-number-${c.id}`);
    if ((await chip.count()) === 0) note("missing-ui", `candidate number chip missing for ${c.id}`);
    await beat(page);
  }
});

await step(page, "D2 score traits, decide, and reveal sex", async () => {
  for (const c of CANDIDATES) {
    const nose = page.getByTestId(`workspace-trait-${c.id}-nose_loudness`);
    if ((await nose.count()) > 0) await nose.fill(c.nose);
    for (const axis of ["structure", "vigor", "resin"]) {
      const f = page.getByTestId(`workspace-trait-${c.id}-${axis}`);
      if ((await f.count()) > 0) await f.fill(c.decision === "cull" ? "2" : "4");
    }
    const note_ = page.getByTestId(`workspace-note-${c.id}`);
    if ((await note_.count()) > 0)
      await note_.fill(`Round notes: ${c.aroma}. Structure and vigor logged at mid-flower.`);
    await beat(page);

    const dec = page.getByTestId(`workspace-decision-${c.id}`);
    if ((await dec.count()) > 0) await dec.selectOption(c.decision);
    const reason = page.getByTestId(`workspace-reason-${c.id}`);
    if ((await reason.count()) > 0)
      await reason.fill(
        c.decision === "keep" ? "Loudest nose in the pack." : "Showed nanners at week 5.",
      );
    const sex = page.getByTestId(`workspace-sex-${c.id}`);
    if ((await sex.count()) > 0) await sex.selectOption(c.sex);
    await beat(page);

    await page.getByTestId(`workspace-save-${c.id}`).click();
    const saved = page.getByTestId(`workspace-saved-${c.id}`);
    try {
      await saved.waitFor({ state: "visible", timeout: 8000 });
    } catch {
      note("save-failed", `no save confirmation for candidate ${c.id}`);
    }
    await beat(page);
  }
  expect(
    db.pheno_candidate_scores.length >= 3,
    `only ${db.pheno_candidate_scores.length} score rows persisted`,
  );
  expect(
    db.pheno_keeper_decisions.length >= 3,
    `only ${db.pheno_keeper_decisions.length} decision rows persisted`,
  );
  expect(
    db.pheno_keeper_decisions_log.length >= 3,
    `decision log has ${db.pheno_keeper_decisions_log.length} rows (append-only audit)`,
  );
  expect(
    db.pheno_sex_observations.length >= 3,
    `only ${db.pheno_sex_observations.length} sex observations persisted`,
  );
});

await step(page, "D3 hermaphrodite flag and removal queue", async () => {
  const flag = page.getByTestId(`workspace-herm-flag-${IDS.PLANT_C}`);
  if ((await flag.count()) === 0)
    return note("missing-ui", "herm flag did not appear for the herm candidate");
  await flag.scrollIntoViewIfNeeded();
  await beat(page);
  const queueBtn = page.getByTestId(`workspace-herm-queue-${IDS.PLANT_C}`);
  if ((await queueBtn.count()) === 0) return note("missing-ui", "herm queue-removal button absent");
  await queueBtn.click();
  await page.waitForTimeout(900);
  await expectVisible(page, `workspace-herm-queued-${IDS.PLANT_C}`, "herm queued confirmation");
  const aq = db.action_queue.at(-1);
  expect(!!aq, "no action_queue row written for herm removal");
  expect(
    aq?.status === "pending_approval",
    `action queue row status="${aq?.status}" (must require approval)`,
  );
  expect(
    aq?.user_id === undefined,
    "client sent user_id on the action_queue insert (server must derive it)",
  );
  await beat(page, 2);
});

await step(page, "D4 staged round scoring (mid-flower)", async () => {
  const sel = page.getByTestId("workspace-round-select");
  if ((await sel.count()) === 0) return note("missing-ui", "round selector absent");
  await sel.selectOption("mid_flower");
  await page.waitForTimeout(1500);
  const aroma = page.getByTestId(`workspace-aroma-${IDS.PLANT_A}`);
  if ((await aroma.count()) === 0) return note("missing-ui", "aroma field absent in round mode");
  await aroma.fill("gas, sherbet, fuel");
  const nn = page.getByTestId(`workspace-nose-note-${IDS.PLANT_A}`);
  if ((await nn.count()) > 0) await nn.fill("Loudest of the three through the bag.");
  await beat(page);
  await page.getByTestId(`workspace-save-${IDS.PLANT_A}`).click();
  await page.waitForTimeout(1200);
  expect(db.pheno_score_rounds.length >= 1, "no pheno_score_rounds row persisted for mid_flower");
  await sel.selectOption("overall");
  await page.waitForTimeout(1000);
  await beat(page);
});

await step(page, "D5 post-cure smoke test", async () => {
  const details = page.getByTestId(`workspace-smoke-${IDS.PLANT_A}`);
  if ((await details.count()) === 0) return note("missing-ui", "smoke-test section absent");
  await details.scrollIntoViewIfNeeded();
  await details.locator("summary").first().click();
  await beat(page);
  const fills = {
    [`workspace-smoke-flavor-${IDS.PLANT_A}`]: "Sweet gas, sherbet on the exhale",
    [`workspace-smoke-effect-${IDS.PLANT_A}`]: "Heavy behind the eyes, clear for an hour",
    [`workspace-smoke-smoothness-${IDS.PLANT_A}`]: "4",
    [`workspace-smoke-potency-${IDS.PLANT_A}`]: "5",
    [`workspace-smoke-verdict-${IDS.PLANT_A}`]: "keeper",
  };
  for (const [tid, val] of Object.entries(fills)) {
    const el = page.getByTestId(tid);
    if ((await el.count()) === 0) {
      note("missing-ui", `smoke field ${tid} absent`);
      continue;
    }
    const tag = await el.evaluate((n) => n.tagName.toLowerCase());
    if (tag === "select") await el.selectOption(val).catch(() => el.selectOption({ label: val }));
    else await el.fill(val);
    await page.waitForTimeout(120);
  }
  await page.getByTestId(`workspace-save-smoke-${IDS.PLANT_A}`).click();
  await page.waitForTimeout(1200);
  expect(db.pheno_smoke_tests.length >= 1, "no pheno_smoke_tests row persisted");
  await beat(page);
});

await step(page, "D6 lab / COA results", async () => {
  const details = page.getByTestId(`workspace-lab-${IDS.PLANT_A}`);
  if ((await details.count()) === 0) return note("missing-ui", "lab-results section absent");
  await details.scrollIntoViewIfNeeded();
  await details.locator("summary").first().click();
  await beat(page);
  const src = page.getByTestId(`workspace-lab-source-${IDS.PLANT_A}`);
  if ((await src.count()) > 0) await src.selectOption("coa").catch(() => {});
  for (const [tid, v] of [
    [`workspace-lab-thc-${IDS.PLANT_A}`, "27.4"],
    [`workspace-lab-cbd-${IDS.PLANT_A}`, "0.1"],
    [`workspace-lab-terps-${IDS.PLANT_A}`, "3.2"],
  ]) {
    const el = page.getByTestId(tid);
    if ((await el.count()) > 0) await el.fill(v);
  }
  await page.getByTestId(`workspace-save-lab-${IDS.PLANT_A}`).click();
  await page.waitForTimeout(1200);
  expect(db.pheno_lab_results.length >= 1, "no pheno_lab_results row persisted");
  await beat(page);
});

await step(page, "D7 decision history audit trail", async () => {
  const det = page.getByTestId(`workspace-decision-history-${IDS.PLANT_A}`);
  if ((await det.count()) === 0) return note("missing-ui", "decision-history section absent");
  await det.scrollIntoViewIfNeeded();
  await det.locator("summary").first().click();
  await page.waitForTimeout(1200);
  await beat(page, 2);
});

// ---- Phase E: hunt-level tools
await step(page, "E1 breeding objective", async () => {
  const editor = page.getByTestId("pheno-breeding-objective-editor");
  if ((await editor.count()) === 0) return note("missing-ui", "breeding objective editor absent");
  await editor.scrollIntoViewIfNeeded();
  await beat(page);

  // nose_loudness is the ONLY axis with range 0-10; every other axis is 1-5.
  const AXIS = "nose_loudness";
  await page.getByTestId("pheno-breeding-objective-axis-select").selectOption(AXIS);
  await page.getByTestId("pheno-breeding-objective-comparator-select").selectOption("gte");
  await page.getByTestId("pheno-breeding-objective-threshold-input").fill("7");
  await beat(page);

  await page.getByTestId("pheno-breeding-objective-add-target").click();
  // Gate on the committed row: this is what flips `dirty` and enables Save.
  await page
    .getByTestId(`pheno-breeding-objective-target-${AXIS}`)
    .waitFor({ state: "visible", timeout: 8000 });
  const err = page.getByTestId("pheno-breeding-objective-error");
  if (await err.isVisible().catch(() => false)) {
    return note("assertion", `add target rejected: ${await err.innerText()}`);
  }

  const save = page.getByTestId("pheno-breeding-objective-save");
  if (await save.isDisabled())
    return note("assertion", "save disabled after adding a valid target");
  await save.click();
  await page.waitForTimeout(1200);

  const hunt = db.pheno_hunts[0];
  expect(
    Array.isArray(hunt?.breeding_objective) &&
      hunt.breeding_objective.some(
        (t) => t.axisKey === AXIS && t.comparator === "gte" && t.threshold === 7,
      ),
    "breeding objective did not persist on the hunt row",
  );
  await beat(page);
});

await step(page, "E2 stress test — record, edit, delete", async () => {
  const form = page.getByTestId("pheno-stress-form");
  if ((await form.count()) === 0) return note("missing-ui", "stress-testing form absent");
  await form.scrollIntoViewIfNeeded();
  await beat(page);

  // Candidate is a <select> of plant UUIDs in the workspace; factor/status/
  // intensity/recommendation are <select>s with literal enum values.
  const cand = page.getByTestId("pheno-stress-candidate");
  if ((await cand.evaluate((n) => n.tagName)) === "SELECT") await cand.selectOption(IDS.PLANT_A);
  else await cand.fill(IDS.PLANT_A);
  await page.getByTestId("pheno-stress-factor").selectOption("Extreme temperature");
  await page.getByTestId("pheno-stress-status").selectOption("observed");
  await page.getByTestId("pheno-stress-intensity").selectOption("moderate");
  await page.getByTestId("pheno-stress-start").fill("2026-07-10");
  await page.getByTestId("pheno-stress-end").fill("2026-07-14");
  await page
    .getByTestId("pheno-stress-response")
    .fill("Slight taco on upper fans, recovered in 2 days.");
  await page.getByTestId("pheno-stress-recovery").fill("Full turgor by day 3.");
  await page.getByTestId("pheno-stress-recommendation").selectOption("keep");
  await page.getByTestId("pheno-stress-notes").fill("Heat spike test, tent hit 34C for 6h.");
  await beat(page);

  await page.getByTestId("pheno-stress-record").click();
  // The local entries list appends even on persistence failure — assert on the
  // saved badge (only shown when onPersist resolved true) plus the mock DB.
  try {
    await page.getByTestId("pheno-stress-saved").waitFor({ state: "visible", timeout: 6000 });
  } catch {
    note("save-failed", "stress observation: no 'Saved to candidate record' badge appeared");
  }
  expect(db.pheno_stress_observations.length >= 1, "no pheno_stress_observations row persisted");
  await beat(page);

  // Row testids are keyed by the uuid echoed back from the INSERT.
  const rowLi = page.locator('[data-testid^="stress-row-"]').first();
  try {
    await rowLi.waitFor({ timeout: 6000 });
  } catch {
    return note("missing-ui", "persisted stress observation row never rendered");
  }
  const rowId = (await rowLi.getAttribute("data-testid")).replace(/^stress-row-/, "");

  await page.getByTestId(`stress-edit-${rowId}`).click();
  await page.getByTestId(`stress-edit-form-${rowId}`).waitFor({ timeout: 6000 });
  await beat(page);
  await page.getByTestId(`stress-edit-rec-${rowId}`).selectOption("watch");
  await page.getByTestId(`stress-edit-intensity-${rowId}`).selectOption("high");
  await page
    .getByTestId(`stress-edit-response-${rowId}`)
    .fill("Confirmed heat-tolerant across two runs.");
  await beat(page);
  await page.getByTestId(`stress-edit-save-${rowId}`).click();
  // saveEdit() unmounts the form only when the update persisted.
  try {
    await page
      .getByTestId(`stress-edit-form-${rowId}`)
      .waitFor({ state: "detached", timeout: 6000 });
  } catch {
    note("save-failed", "stress edit form stayed open — update did not persist");
  }
  expect(
    db.pheno_stress_observations[0]?.recommendation === "watch" &&
      db.pheno_stress_observations[0]?.intensity === "high",
    "stress observation update did not persist",
  );
  await beat(page);

  // Delete goes through a real window.confirm — the dialog handler accepts it.
  await page.getByTestId(`stress-delete-${rowId}`).click();
  try {
    await page.getByTestId(`stress-row-${rowId}`).waitFor({ state: "detached", timeout: 6000 });
  } catch {
    note("defect", "stress row still visible after confirmed delete");
  }
  expect(
    db.pheno_stress_observations.length === 0,
    `stress row still present after delete (${db.pheno_stress_observations.length})`,
  );
  await beat(page);
});

await step(page, "E3 product sampling session", async () => {
  const form = page.getByTestId("pheno-sampling-form");
  if ((await form.count()) === 0) return note("missing-ui", "product sampling form absent");
  await form.scrollIntoViewIfNeeded();
  await beat(page);
  const tester = page.getByTestId("pheno-sampling-tester");
  if ((await tester.count()) > 0) await tester.fill("Matt");
  const cand = page.getByTestId("pheno-sampling-candidate");
  if ((await cand.count()) > 0) await cand.selectOption(IDS.PLANT_A).catch(() => {});
  for (const [tid, v] of [
    ["pheno-sampling-overall", "9"],
    ["pheno-sampling-flavor", "Gas and sherbet"],
    ["pheno-sampling-notes", "Blind sample, no label shown to the taster."],
  ]) {
    const el = page.getByTestId(tid);
    if ((await el.count()) > 0) await el.fill(v).catch(() => {});
  }
  await beat(page);
  await page.getByTestId("pheno-sampling-record").click();
  await page.waitForTimeout(1000);
  await expectVisible(page, "pheno-sampling-summary", "sampling summary");
  await expectVisible(page, "pheno-sampling-session-only-disclosure", "session-only disclosure");
  await beat(page, 2);
});

await step(page, "E4 candidate documentation", async () => {
  const docs = page.getByTestId(`pheno-documentation-candidate-${IDS.PLANT_A}`);
  if ((await docs.count()) === 0) return note("missing-ui", "documentation section absent");
  await docs.scrollIntoViewIfNeeded();
  await beat(page);
  const field = docs.locator('[data-testid^="pheno-doc-field-"]').first();
  if ((await field.count()) > 0) {
    await field.fill("Wet trim, 60/60 dry, 14-day burp cycle.");
    await beat(page);
  }
  const save = page.getByTestId(`pheno-doc-save-candidate-${IDS.PLANT_A}`);
  if ((await save.count()) > 0) {
    await save.click();
    await page.waitForTimeout(800);
    await expectVisible(page, `pheno-doc-saved-candidate-${IDS.PLANT_A}`, "documentation saved");
  } else {
    note("missing-ui", `pheno-doc-save-candidate-${IDS.PLANT_A} absent`);
  }
  await beat(page);
});

await step(page, "E5 filters", async () => {
  const text = page.getByTestId("workspace-filter-text");
  await text.scrollIntoViewIfNeeded();
  await text.fill("Runtz");
  await page.waitForTimeout(1500);
  const textCount = await page.getByTestId("workspace-visible-count").innerText();
  expect(/Showing 3 /.test(textCount), `text filter "Runtz" showed "${textCount}", expected all 3`);
  await beat(page);
  await text.fill("");
  await page.waitForTimeout(1200);

  await page.getByTestId("workspace-filter-decision").selectOption("keep");
  await page.waitForTimeout(1600);
  const keepCount = await page.getByTestId("workspace-visible-count").innerText();
  expect(/Showing 2 /.test(keepCount), `decision=keep filter showed "${keepCount}", expected 2`);
  await beat(page);
  await page.getByTestId("workspace-filter-decision").selectOption("all");
  await page.waitForTimeout(1200);

  await page.getByTestId("workspace-filter-readiness").selectOption("comparison_ready");
  await page.waitForTimeout(800);
  await beat(page);
  await page.getByTestId("workspace-filter-readiness").selectOption("all");
  await page.waitForTimeout(600);
});

await step(page, "E6 CSV export", async () => {
  const btn = page.getByTestId("workspace-export-csv");
  await btn.scrollIntoViewIfNeeded();
  for (let i = 0; i < 20; i++) {
    if (!(await btn.isDisabled())) break;
    await page.waitForTimeout(500);
  }
  if (await btn.isDisabled())
    return note("blocked", "CSV export stayed disabled (evidence never settled)");
  const dl = page.waitForEvent("download", { timeout: 15000 });
  await btn.click();
  try {
    const d = await dl;
    const name = d.suggestedFilename();
    expect(/\.csv$/.test(name), `export produced "${name}" instead of a .csv`);
    await d.saveAs(`${OUT}/${name}`);
    note("info", `CSV exported as ${name}`);
  } catch {
    note("defect", "clicking Export loaded CSV produced no download");
  }
  await beat(page, 2);
});

// ---- Phase F: comparison readiness after evidence
await step(page, "F1 reload — compare should now unlock", async () => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await expectVisible(page, "pheno-workspace", "workspace after reload");
  await page.waitForTimeout(2500);
  const action = page.getByTestId("pheno-workspace-compare-action");
  const enabled = await action.getAttribute("data-enabled");
  const readiness = await action.getAttribute("data-readiness");
  if (enabled !== "true") {
    const reason = (await page.getByTestId("pheno-workspace-compare-action-reason").count())
      ? await page.getByTestId("pheno-workspace-compare-action-reason").innerText()
      : "(no reason shown)";
    note(
      "blocked",
      `compare still disabled after full evidence: data-enabled="${enabled}" readiness="${readiness}" reason="${reason}"`,
    );
  }
  await beat(page, 2);
});

await step(page, "F2 cohort selection", async () => {
  for (const pid of [IDS.PLANT_A, IDS.PLANT_B]) {
    const box = page.getByTestId(`workspace-select-${pid}`);
    if ((await box.count()) === 0) {
      note("missing-ui", `cohort checkbox absent for ${pid}`);
      continue;
    }
    await box.scrollIntoViewIfNeeded();
    await box.click();
    await beat(page);
  }
  const cnt = await page.getByTestId("workspace-cohort-count").innerText();
  expect(/2 selected/.test(cnt), `cohort bar read "${cnt}"`);
  const link = page.getByTestId("workspace-cohort-compare-link");
  if ((await link.count()) === 0) note("missing-ui", "cohort compare link absent with 2 selected");
  await beat(page, 2);
});

await step(page, "F3 open the comparison", async () => {
  const link = page.getByTestId("workspace-cohort-compare-link");
  if ((await link.count()) === 0) {
    await page.goto(`${BASE}/pheno-hunts/${IDS.HUNT}/compare`, { waitUntil: "domcontentloaded" });
  } else {
    await link.click();
  }
  await page.waitForTimeout(2500);
  await expectVisible(page, "pheno-comparison-page", "comparison page");
  const cards = await page.locator('[data-testid^="pheno-candidate-"]').count();
  expect(cards >= 2, `comparison rendered ${cards} candidate cards, expected >= 2`);
  const warn = page.getByTestId("pheno-hunt-compare-readiness-warning");
  if ((await warn.count()) > 0) {
    note("info", `compare readiness warning shown: ${(await warn.innerText()).slice(0, 160)}`);
  }
  await beat(page, 3);
});

// ---- Phase H: keepers and the breeding endgame
await step(page, "H1 open keepers page", async () => {
  await page.goto(`${BASE}/pheno-hunts/${IDS.HUNT}/keepers`, { waitUntil: "domcontentloaded" });
  await expectVisible(page, "pheno-keepers", "keepers page");
  await expectVisible(page, "pheno-keepers-empty", "no keepers yet");
  await beat(page, 2);
});

await step(page, "H2 name a keeper", async () => {
  const sel = page.getByTestId("keepers-promote-plant");
  const opts = await sel.locator("option").all();
  const values = await Promise.all(opts.map((o) => o.getAttribute("value")));
  const target = values.find((v) => v === IDS.PLANT_A) || values.find((v) => v);
  expect(!!target, "keeper promote dropdown had no candidate options");
  if (target) await sel.selectOption(target);
  await page.getByTestId("keepers-promote-name").fill("Gas Runtz");
  await beat(page);
  await page.getByTestId("keepers-promote-save").click();
  await page.waitForTimeout(1800);
  expect(db.pheno_keepers.length >= 1, "no pheno_keepers row persisted");
  await expectVisible(page, `pheno-keeper-${IDS.KEEPER}`, "keeper card");
  await beat(page, 2);
});

await step(page, "H3 clone insurance", async () => {
  const input = page.getByTestId(`keepers-clone-label-${IDS.KEEPER}`);
  if ((await input.count()) === 0) return note("missing-ui", "clone label input absent");
  await input.fill("mother cut");
  await beat(page);
  await page.getByTestId(`keepers-clone-add-${IDS.KEEPER}`).click();
  await page.waitForTimeout(1500);
  expect(db.pheno_keeper_clones.length >= 1, "no pheno_keeper_clones row persisted");
  await expectVisible(page, `keeper-clone-tree-${IDS.KEEPER}`, "clone lineage tree");
  await beat(page, 2);
});

await step(page, "H4 stability ledger — baseline and second grow-out", async () => {
  const ledger = page.getByTestId(`pheno-stability-ledger-${IDS.KEEPER}`);
  if ((await ledger.count()) === 0) return note("missing-ui", "stability ledger absent");
  await ledger.scrollIntoViewIfNeeded();
  for (const [label, date, nose] of [
    ["Baseline run", "2026-03-01", "9"],
    ["Re-grow 1", "2026-06-01", "9"],
  ]) {
    await page.getByTestId(`pheno-stability-label-${IDS.KEEPER}`).fill(label);
    await page.getByTestId(`pheno-stability-date-${IDS.KEEPER}`).fill(date);
    const trait = page.getByTestId(`pheno-stability-trait-${IDS.KEEPER}-nose_loudness`);
    if ((await trait.count()) > 0) await trait.fill(nose);
    await beat(page);
    await page.getByTestId(`pheno-stability-add-${IDS.KEEPER}`).click();
    await page.waitForTimeout(1500);
  }
  const keeper = db.pheno_keepers[0];
  expect(
    Array.isArray(keeper?.stability_runs) && keeper.stability_runs.length === 2,
    `stability_runs persisted as ${JSON.stringify(keeper?.stability_runs)?.slice(0, 120)}`,
  );
  await expectVisible(page, `pheno-stability-verdict-${IDS.KEEPER}`, "stability verdict");
  await beat(page, 2);
});

await step(page, "H5 mark keeper reversed", async () => {
  const sel = page.getByTestId(`keeper-reverse-method-${IDS.KEEPER}`);
  if ((await sel.count()) === 0) return note("missing-ui", "reversal method select absent");
  await sel.selectOption("colloidal_silver").catch(() => {});
  await beat(page);
  await page.getByTestId(`keeper-reverse-${IDS.KEEPER}`).click();
  await page.waitForTimeout(1600);
  expect(db.pheno_reversals.length >= 1, "no pheno_reversals row persisted");
  await expectVisible(page, `keeper-reversed-badge-${IDS.KEEPER}`, "reversed badge");
  await beat(page, 2);
});

await step(page, "H6 record a self (S1) cross", async () => {
  const female = page.getByTestId("keepers-cross-female");
  if ((await female.count()) === 0) return note("missing-ui", "cross form absent");
  await female.scrollIntoViewIfNeeded();
  await female.selectOption(IDS.KEEPER);
  await beat(page);
  await page.getByTestId("keepers-cross-donor").selectOption("__self__");
  await beat(page);
  await page.getByTestId("keepers-cross-name").fill("Gas Runtz S1");
  const preview = page.getByTestId("keepers-cross-preview");
  if ((await preview.count()) > 0) {
    const txt = await preview.innerText();
    expect(/S1/.test(txt), `cross preview read "${txt}", expected an S1 classification`);
  } else {
    const why = page.getByTestId("keepers-cross-disabled-reason");
    note(
      "blocked",
      `cross submit disabled: ${(await why.count()) ? await why.innerText() : "unknown"}`,
    );
  }
  await beat(page);
  await page.getByTestId("keepers-cross-save").click();
  await page.waitForTimeout(1800);
  expect(db.pheno_crosses.length >= 1, "no pheno_crosses row persisted");
  const x = db.pheno_crosses[0];
  expect(
    x?.cross_type === "selfing_s1" && x?.male_keeper_id === null,
    `cross persisted as type="${x?.cross_type}" male="${x?.male_keeper_id}" (expected selfing_s1 / null)`,
  );
  await expectVisible(page, "pheno-crosses", "crosses list");
  await expectVisible(page, "pheno-keepers-activity", "breeding activity timeline");
  await beat(page, 3);
});

// ---- Phase I: showcase and back to the index
await step(page, "I1 hunt showcase", async () => {
  await page.goto(`${BASE}/pheno-hunts/${IDS.HUNT}/showcase`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await expectVisible(page, "pheno-hunt-showcase-page", "showcase page");
  const src = page.getByTestId("pheno-hunt-showcase-source");
  if ((await src.count()) > 0) {
    const t = await src.innerText();
    note("info", `showcase source: ${t.slice(0, 120)}`);
  }
  await expectVisible(page, "pheno-hunt-showcase-pack", "the pack");
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(500);
  }
  await beat(page, 2);
});

await step(page, "I2 back to the index — hunt is listed", async () => {
  await page.goto(`${BASE}/pheno-hunts`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  await expectVisible(page, "pheno-hunts-index-list", "hunts list");
  await expectVisible(page, `pheno-hunts-index-item-${IDS.HUNT}`, "the created hunt");
  const empty = await page.getByTestId("pheno-hunts-index-empty").count();
  expect(empty === 0, "index still shows the empty state after a hunt exists");
  await beat(page, 3);
});

// ---------------------------------------------------------------- teardown
await context.close();
const videoPath = await page.video()?.path();
await browser.close();

const report = {
  base: BASE,
  video: videoPath,
  steps,
  findings,
  writes: writeLog.map((w) => `${w.method} ${w.table}`),
  dbCounts: Object.fromEntries(
    Object.entries(db).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]),
  ),
};
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));

const bad = findings.filter((f) => f.kind !== "info");
console.log(`\n${"=".repeat(60)}`);
console.log(`steps: ${steps.length}  failed: ${steps.filter((s) => s.status !== "ok").length}`);
console.log(`findings: ${bad.length} (excluding info)`);
for (const f of bad) console.log(`  ${f.kind} @ ${f.step}: ${f.detail}`);
console.log(`video: ${videoPath}`);
console.log(`report: ${OUT}/report.json`);
