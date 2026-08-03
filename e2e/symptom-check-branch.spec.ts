/**
 * Branch-backed Symptom Check browser proof.
 *
 * Exercises the real local React app from Plant Detail through the full
 * Quick Log dialog, canonical quicklog_save_event boundary, and Timeline
 * evidence card. Every remote request is intercepted before transport:
 * Supabase auth/REST/RPC/function calls receive deterministic fake responses,
 * and every other remote origin is aborted.
 *
 * Safety:
 * - Clearly fake `.invalid` identity and fake bearer strings only.
 * - No real Supabase, analytics, function, storage, or third-party request.
 * - No service role, schema mutation, AI call, Action Queue write, or device
 *   control.
 */
import { expect, test, type Page, type Request, type Route } from "@playwright/test";

const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SESSION_KEY = `sb-${PROJECT_REF}-auth-token`;
const MOCKED_PROJECT = "chromium-mocked";

const FAKE_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FAKE_GROW_ID = "11111111-1111-4111-8111-111111111111";
const FAKE_TENT_ID = "22222222-2222-4222-8222-222222222222";
const FAKE_PLANT_ID = "33333333-3333-4333-8333-333333333333";
const FAKE_GROW_EVENT_ID = "44444444-4444-4444-8444-444444444444";
const FAKE_DIARY_ENTRY_ID = "55555555-5555-4555-8555-555555555555";
const OBSERVED_AT = "2026-08-01T12:00:00.000Z";
const SYMPTOM_NOTE = "Lower leaves are pale; no cause assumed.";

const FAKE_USER = {
  id: FAKE_USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "symptom-check-branch@example.invalid",
  email_confirmed_at: "2020-01-01T00:00:00.000Z",
  confirmed_at: "2020-01-01T00:00:00.000Z",
  user_metadata: { email_verified: true },
};

const FAKE_GROW = {
  id: FAKE_GROW_ID,
  user_id: FAKE_USER_ID,
  name: "Symptom Browser Proof Grow",
  stage: "flower",
  is_archived: false,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
};

const FAKE_TENT = {
  id: FAKE_TENT_ID,
  user_id: FAKE_USER_ID,
  grow_id: FAKE_GROW_ID,
  name: "Symptom Browser Proof Tent",
  brand: "",
  size: "2x2",
  stage: "flower",
  light_on: true,
  light_schedule: "12/12",
  light_wattage: 300,
  is_archived: false,
  created_at: "2026-07-01T00:00:00.000Z",
};

const FAKE_PLANT = {
  id: FAKE_PLANT_ID,
  user_id: FAKE_USER_ID,
  grow_id: FAKE_GROW_ID,
  tent_id: FAKE_TENT_ID,
  name: "Symptom Browser Proof Plant",
  strain: "Clearly fake cultivar",
  stage: "flower",
  started_at: "2026-06-01T00:00:00.000Z",
  health: "watch",
  plant_type: "unknown",
  photo_url: null,
  last_note: null,
  is_archived: false,
  medium: "soil",
  pot_size: "3 gal",
  created_at: "2026-07-01T00:00:00.000Z",
};

interface MockNetworkState {
  savedDiaryEntry: Record<string, unknown> | null;
  quickLogEventPayloads: Record<string, unknown>[];
  directMutationPaths: string[];
  functionMutationPaths: string[];
  remoteRequests: string[];
  abortedRemoteRequests: string[];
}

function createMockNetworkState(): MockNetworkState {
  return {
    savedDiaryEntry: null,
    quickLogEventPayloads: [],
    directMutationPaths: [],
    functionMutationPaths: [],
    remoteRequests: [],
    abortedRemoteRequests: [],
  };
}

async function seedClearlyFakeSession(page: Page) {
  await page.addInitScript(
    ({ sessionKey, user, activeGrowKey, growId }) => {
      const session = {
        access_token: "FAKE-ACCESS-TOKEN-NOT-REAL",
        refresh_token: "FAKE-REFRESH-TOKEN-NOT-REAL",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user,
      };
      sessionStorage.setItem(sessionKey, JSON.stringify(session));
      localStorage.setItem(activeGrowKey, growId);
    },
    {
      sessionKey: SESSION_KEY,
      user: FAKE_USER,
      activeGrowKey: `verdant.activeGrow.${FAKE_USER_ID}`,
      growId: FAKE_GROW_ID,
    },
  );
}

function isSupabaseRequest(url: URL): boolean {
  return url.hostname.endsWith(".supabase.co");
}

function rowsForTable(pathname: string, state: MockNetworkState): unknown[] {
  if (pathname.endsWith("/rest/v1/user_agreement_acceptances")) {
    return [
      { agreement_type: "terms", version: "2026-07-13" },
      { agreement_type: "privacy", version: "2026-07-13" },
    ];
  }
  if (pathname.endsWith("/rest/v1/grows")) return [FAKE_GROW];
  if (pathname.endsWith("/rest/v1/tents")) return [FAKE_TENT];
  if (pathname.endsWith("/rest/v1/plants")) return [FAKE_PLANT];
  if (pathname.endsWith("/rest/v1/diary_entries")) {
    return state.savedDiaryEntry ? [state.savedDiaryEntry] : [];
  }
  return [];
}

async function fulfillRows(route: Route, request: Request, rows: unknown[]) {
  const wantsObject = (request.headers()["accept"] ?? "").includes("vnd.pgrst.object");
  const contentType = wantsObject ? "application/vnd.pgrst.object+json" : "application/json";
  const headers: Record<string, string> = {};
  if (!wantsObject) {
    headers["content-range"] = rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : "*/0";
  }
  await route.fulfill({
    status: 200,
    contentType,
    headers,
    body: request.method() === "HEAD" ? "" : JSON.stringify(wantsObject ? (rows[0] ?? null) : rows),
  });
}

function parseJsonBody(request: Request): Record<string, unknown> {
  const raw = request.postData();
  if (!raw) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected the canonical Quick Log RPC body to be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

async function fulfillSupabaseRequest(route: Route, request: Request, state: MockNetworkState) {
  const url = new URL(request.url());
  const { pathname } = url;

  if (pathname.startsWith("/auth/v1/")) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(pathname.endsWith("/user") ? FAKE_USER : {}),
    });
    return;
  }

  if (pathname === "/rest/v1/rpc/quicklog_save_event") {
    const payload = parseJsonBody(request);
    state.quickLogEventPayloads.push(payload);
    state.savedDiaryEntry = {
      id: FAKE_DIARY_ENTRY_ID,
      note: payload.p_note ?? "(quick log)",
      photo_url: null,
      stage: "flower",
      details: {
        ...((payload.p_details as Record<string, unknown> | null) ?? {}),
        event_type: "observation",
        quick_log_version: 2,
        linked_grow_event_id: FAKE_GROW_EVENT_ID,
      },
      entry_at: OBSERVED_AT,
      plant_id: FAKE_PLANT_ID,
      tent_id: FAKE_TENT_ID,
      grow_id: FAKE_GROW_ID,
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, grow_event_id: FAKE_GROW_EVENT_ID, reused: false }),
    });
    return;
  }

  if (pathname.startsWith("/rest/v1/rpc/")) {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    return;
  }

  if (pathname.startsWith("/rest/v1/")) {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method())) {
      state.directMutationPaths.push(`${request.method()} ${pathname}`);
    }
    await fulfillRows(route, request, rowsForTable(pathname, state));
    return;
  }

  if (pathname.startsWith("/functions/v1/")) {
    if (request.method() !== "GET" && request.method() !== "HEAD") {
      state.functionMutationPaths.push(`${request.method()} ${pathname}`);
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    return;
  }

  if (pathname.startsWith("/storage/v1/")) {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    return;
  }

  await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
}

async function installFailClosedNetworkMock(page: Page, state: MockNetworkState) {
  // Register the remote catch-all first and the Supabase mock second because
  // Playwright gives the most recently registered matching route priority.
  // Limiting interception to HTTPS keeps every local Vite module on its fast
  // native path while still failing closed on all remote app traffic.
  await page.route("https://**/*", async (route, request) => {
    state.remoteRequests.push(request.url());
    state.abortedRemoteRequests.push(request.url());
    await route.abort("blockedbyclient");
  });

  await page.route("https://*.supabase.co/**", async (route, request) => {
    state.remoteRequests.push(request.url());
    await fulfillSupabaseRequest(route, request, state);
  });
}

async function acceptReconsentGateIfShown(page: Page) {
  const gate = page.getByTestId("agreement-reconsent-gate");
  const shown = await gate
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) return;
  await gate.locator("#reconsent-accept").click();
  await gate.getByRole("button", { name: /accept and continue/i }).click();
  await gate.waitFor({ state: "hidden", timeout: 15_000 });
}

test.describe("Plant Detail Symptom Check — local mocked branch proof", () => {
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== MOCKED_PROJECT,
      `branch-backed symptom proof runs once, under the ${MOCKED_PROJECT} project`,
    );
  });

  test("renders the authenticated plant shell with mocked data", async ({ page, baseURL }) => {
    expect(baseURL, "the mocked proof requires Playwright's local Vite base URL").toBeTruthy();
    const state = createMockNetworkState();
    await seedClearlyFakeSession(page);
    await installFailClosedNetworkMock(page, state);

    await page.goto(`/plants/${FAKE_PLANT_ID}`);
    await acceptReconsentGateIfShown(page);

    await expect(page.getByRole("heading", { name: FAKE_PLANT.name, exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "This page ran into an unexpected error", exact: true }),
    ).not.toBeVisible();
  });

  test("saves one confirmed Symptom Check and follows it to the Timeline evidence card", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    expect(baseURL, "the mocked proof requires Playwright's local Vite base URL").toBeTruthy();
    const state = createMockNetworkState();
    await seedClearlyFakeSession(page);
    await installFailClosedNetworkMock(page, state);

    await page.goto(`/plants/${FAKE_PLANT_ID}`);
    await acceptReconsentGateIfShown(page);
    await expect(page.getByRole("heading", { name: FAKE_PLANT.name, exact: true })).toBeVisible();

    // Open the actual full Quick Log dialog from Plant Detail. Choosing Note
    // only establishes the verified plant target; the grower still explicitly
    // starts and confirms Symptom Check before any write can occur.
    await page.getByTestId("global-fast-add-trigger").click();
    await page.getByTestId("global-fast-add-action-diary_note").click();
    const dialog = page.getByRole("dialog", { name: /quick log/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("quick-log-target-plant")).toContainText(FAKE_PLANT.name);

    const symptomPrefix = "quick-log-dialog-all-activities";
    await dialog.getByTestId(`${symptomPrefix}-start-symptom-check`).click();
    await expect(dialog.getByTestId(`${symptomPrefix}-symptom-fields`)).toBeVisible();

    // Selection is draft-only. Stage, symptom, location, and confirmation
    // cannot write until the explicit Save click.
    await dialog.getByTestId(`${symptomPrefix}-symptom-stage`).selectOption("flower");
    await dialog.getByTestId(`${symptomPrefix}-symptom-yellowing`).click();
    await dialog.locator(`#${symptomPrefix}-symptom-location`).selectOption("lower_leaves");
    await dialog.getByTestId(`${symptomPrefix}-note`).fill(SYMPTOM_NOTE);
    expect(state.quickLogEventPayloads).toHaveLength(0);
    expect(state.directMutationPaths).toHaveLength(0);
    expect(state.functionMutationPaths).toHaveLength(0);

    const saveButton = dialog.getByTestId(`${symptomPrefix}-save`);
    await expect(saveButton).toBeDisabled();
    await dialog.getByTestId(`${symptomPrefix}-symptom-stage-confirmed`).check();
    await expect(saveButton).toBeEnabled();

    const quickLogResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/rest/v1/rpc/quicklog_save_event" &&
        response.request().method() === "POST",
    );
    await saveButton.click();
    expect((await quickLogResponse).ok()).toBe(true);

    expect(state.quickLogEventPayloads).toHaveLength(1);
    expect(state.quickLogEventPayloads[0]).toEqual({
      p_idempotency_key: expect.stringMatching(
        /^qla-issue_observation-\d+-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      p_grow_id: FAKE_GROW_ID,
      p_event_type: "observation",
      p_tent_id: FAKE_TENT_ID,
      p_plant_id: FAKE_PLANT_ID,
      p_note: SYMPTOM_NOTE,
      p_photo_url: null,
      p_sensor_snapshot: null,
      p_occurred_at: null,
      p_details: {
        subtype: "issue",
        event_type: "observation",
        observedSign: "discoloration",
        observationLocation: "lower_leaves",
        observation_stage: "flower",
      },
    });
    expect(state.directMutationPaths).toHaveLength(0);
    expect(state.functionMutationPaths).toHaveLength(0);

    const reviewLink = dialog.getByTestId(`${symptomPrefix}-review-symptom-evidence`);
    await expect(reviewLink).toHaveAttribute(
      "href",
      `/timeline?growId=${FAKE_GROW_ID}#timeline-entry-${FAKE_GROW_EVENT_ID}`,
    );
    await reviewLink.click();
    await expect(page).toHaveURL(
      new RegExp(`/timeline\\?growId=${FAKE_GROW_ID}#timeline-entry-${FAKE_GROW_EVENT_ID}$`),
    );
    await page.keyboard.press("Escape");

    const linkedAnchor = page.locator(`#timeline-entry-${FAKE_GROW_EVENT_ID}`);
    await expect(linkedAnchor).toHaveAttribute(
      "data-timeline-entry-alias-for",
      `timeline-entry-${FAKE_DIARY_ENTRY_ID}`,
    );

    const evidenceCard = page.getByTestId("symptom-evidence-checklist");
    await expect(evidenceCard).toBeVisible();
    await expect(evidenceCard).toContainText(
      "Yellowing / discoloration: verify the record before changing anything",
    );
    await expect(
      evidenceCard.getByRole("link", { name: "Review the symptom guide" }),
    ).toHaveAttribute("href", "/guides/cannabis-leaves-turning-yellow");
    await expect(evidenceCard.getByRole("link", { name: "Open the symptom hub" })).toHaveAttribute(
      "href",
      "/guides/cannabis-leaf-symptoms",
    );

    expect(state.quickLogEventPayloads).toHaveLength(1);
    expect(state.directMutationPaths).toHaveLength(0);
    expect(state.functionMutationPaths).toHaveLength(0);
    expect(
      state.remoteRequests.every(
        (requestUrl) =>
          isSupabaseRequest(new URL(requestUrl)) ||
          state.abortedRemoteRequests.includes(requestUrl),
      ),
    ).toBe(true);
  });
});
