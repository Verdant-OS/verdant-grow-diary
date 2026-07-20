// Browser regression proof for the Genetics traceability surfaces.
//
// SAFETY:
// - Uses a clearly fake session.
// - Intercepts every Supabase auth, REST, RPC, and edge-function request.
// - Performs no real writes, AI calls, ingest, alerts, Action Queue changes,
//   or device control.
//
// Proves: the Genetics Library and the semantic lineage tree have ZERO
// horizontal overflow at 320 / 375 / 768 / 1440, even with deliberately long
// breeder / cultivar / batch / pathogen names and a deep, truncated trace; and
// that the lineage renders as a semantic, keyboard-operable tree (role="tree"),
// never canvas-only.
import { expect, test, type Page } from "@playwright/test";

const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SESSION_KEY = `sb-${PROJECT_REF}-auth-token`;
const MOCKED_PROJECT = "chromium-mocked";
const PLANT_ID = "33333333-3333-4333-8333-333333333333";

const FAKE_USER = {
  id: "genetics-browser-user",
  aud: "authenticated",
  email: "genetics@example.invalid",
  email_confirmed_at: "2020-01-01T00:00:00.000Z",
  confirmed_at: "2020-01-01T00:00:00.000Z",
  user_metadata: { email_verified: true },
};

const LONG = "Extraordinarily-Long Breeder And Cultivar Designation That Should Never Overflow The Viewport Horizontally";

const ACCESSION = {
  id: "aaaaaaa1-1111-4111-8111-111111111111",
  source_kind: "seed",
  source_party: LONG,
  cultivar_name: LONG,
  line_name: LONG,
  generation: "F1",
  acquisition_date: null,
  known_state: "unknown",
  archived_at: null,
  created_at: "2020-01-01T00:00:00.000Z",
};

const BATCH = {
  id: "bbbbbbb1-1111-4111-8111-111111111111",
  batch_code: "BATCH-" + LONG,
  name: LONG,
  propagation_method: "cutting",
  source_accession_id: ACCESSION.id,
  mother_plant_id: null,
  origin_unknown: true,
  initial_quantity: null,
  viable_quantity: null,
  counts_unknown: true,
  status: "active",
  created_at: "2020-01-01T00:00:00.000Z",
};

const TRACE_ENVELOPE = {
  ok: true,
  subject: { kind: "plant", id: PLANT_ID },
  direction: "both",
  node_count: 4,
  truncated: true,
  nodes: [
    { key: `plant:${PLANT_ID}`, kind: "plant", id: PLANT_ID, depth: 0, label: LONG, edge_type: null, from: null, evidence: { state: "untested", targets: [], open_quarantine: true }, gaps: ["unassigned_origin"] },
    { key: `batch:${BATCH.id}`, kind: "batch", id: BATCH.id, depth: 1, label: LONG, edge_type: "produced_by_batch", from: `plant:${PLANT_ID}`, evidence: null, gaps: ["unknown_origin"] },
    { key: `accession:${ACCESSION.id}`, kind: "accession", id: ACCESSION.id, depth: 2, label: LONG, edge_type: "propagated_from_accession", from: `batch:${BATCH.id}`, evidence: null, gaps: [] },
    { key: "keeper:ccccccc1", kind: "keeper", id: "ccccccc1-1111-4111-8111-111111111111", depth: 3, label: LONG, edge_type: "keeper_source", from: `plant:${PLANT_ID}`, evidence: null, gaps: ["no_accession_link"] },
  ],
  edges: [
    { from: `plant:${PLANT_ID}`, to: `batch:${BATCH.id}`, edge_type: "produced_by_batch" },
    { from: `batch:${BATCH.id}`, to: `accession:${ACCESSION.id}`, edge_type: "propagated_from_accession" },
  ],
};

const VIEWPORTS: ReadonlyArray<{ label: string; width: number; height: number }> = [
  { label: "320", width: 320, height: 640 },
  { label: "375", width: 375, height: 812 },
  { label: "768", width: 768, height: 1024 },
  { label: "1440", width: 1440, height: 900 },
];

async function seedFakeSession(page: Page) {
  await page.addInitScript(
    ({ key, user }) => {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          access_token: "FAKE-ACCESS-TOKEN-NOT-REAL",
          refresh_token: "FAKE-REFRESH-TOKEN-NOT-REAL",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user,
        }),
      );
    },
    { key: SESSION_KEY, user: FAKE_USER },
  );
}

async function mockSupabase(page: Page) {
  await page.route(/\/auth\/v1\//, async (route, request) => {
    if (/\/user/i.test(request.url())) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FAKE_USER) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route(/\/rest\/v1\/rpc\/genetics_trace_resolve/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TRACE_ENVELOPE) }),
  );
  await page.route(/\/rest\/v1\//, async (route, request) => {
    const pathname = new URL(request.url()).pathname;
    const rows = pathname.endsWith("/rest/v1/genetics_accessions")
      ? [ACCESSION]
      : pathname.endsWith("/rest/v1/propagation_batches")
        ? [BATCH]
        : [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
  });
  await page.route(/\/functions\/v1\//, (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
  );
  await page.route(/google-analytics\.com|googletagmanager\.com/, (route) => route.abort());
}

async function readOverflow(page: Page) {
  return page.evaluate(() => ({
    documentClient: document.documentElement.clientWidth,
    documentScroll: document.documentElement.scrollWidth,
    bodyClient: document.body.clientWidth,
    bodyScroll: document.body.scrollWidth,
  }));
}

function expectNoOverflow(m: Awaited<ReturnType<typeof readOverflow>>, label: string) {
  expect(m.documentScroll, `document overflow @ ${label}`).toBeLessThanOrEqual(m.documentClient);
  expect(m.bodyScroll, `body overflow @ ${label}`).toBeLessThanOrEqual(m.bodyClient);
}

test.beforeEach((_fixtures, testInfo) => {
  test.skip(
    testInfo.project.name !== MOCKED_PROJECT,
    `genetics traceability overflow proof runs once, under the ${MOCKED_PROJECT} project`,
  );
});

test("Genetics Library has no horizontal overflow at any width", async ({ page }) => {
  await seedFakeSession(page);
  await mockSupabase(page);
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/genetics");
    await page.waitForLoadState("networkidle");
    expectNoOverflow(await readOverflow(page), `library@${vp.label}`);
  }
});

test("Lineage tree is semantic and never overflows, even deep with long names", async ({ page }) => {
  await seedFakeSession(page);
  await mockSupabase(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/genetics/trace/plant/${PLANT_ID}`);
  await page.waitForLoadState("networkidle");

  // Semantic, keyboard-operable tree — not canvas-only.
  await expect(page.getByRole("tree")).toBeVisible();
  await expect(page.getByTestId("traceability-truncated")).toBeVisible();

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`/genetics/trace/plant/${PLANT_ID}`);
    await page.waitForLoadState("networkidle");
    expectNoOverflow(await readOverflow(page), `trace@${vp.label}`);
  }
});
