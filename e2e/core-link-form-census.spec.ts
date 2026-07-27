// Runtime browser census for Verdant's grower surfaces, including the
// completed Claude Daily Check, pricing, credit-pack, and Pheno work.
//
// SAFETY:
// - Runs only in the chromium-mocked project.
// - Uses either no session or a clearly fake session.
// - Intercepts every Supabase auth, REST, storage, and edge-function request.
// - Blocks every unapproved mutation and external fetch.
// - Never submits a form, invokes AI, uploads a file, changes billing, writes
//   Action Queue state, ingests sensor data, or controls a device.
// - Exercises Claude-finished surfaces without reviving superseded branches.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { APP_ROUTES } from "../src/lib/appRouteManifest";
import {
  AUTHENTICATED_CORE_CENSUS_ROUTES,
  PUBLIC_CORE_CENSUS_ROUTES,
  classifyLink,
  isReadOnlyEdgeFunction,
  isSafelyFillableFieldType,
  placeholderValueForField,
  type CoreCensusRoute,
  type LinkClassification,
} from "./lib/coreLinkFormCensus";

const MOCKED_PROJECT = "chromium-mocked";
const APP_ORIGIN = new URL(process.env.E2E_BASE_URL?.trim() || "http://localhost:5173").origin;
const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SESSION_KEY = `sb-${PROJECT_REF}-auth-token`;
const USER_ID = "99999999-9999-4999-8999-999999999999";
const GROW_ID = "11111111-1111-4111-8111-111111111111";
const TENT_ID = "22222222-2222-4222-8222-222222222222";
const PLANT_ID = "33333333-3333-4333-8333-333333333333";
const SECOND_PLANT_ID = "66666666-6666-4666-8666-666666666666";
const PHENO_HUNT_ID = "55555555-5555-4555-8555-555555555555";
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
  notes: "Mocked observation. Not live cultivation evidence.",
  details: { event_type: "observation" },
  created_at: "2026-07-26T13:00:00.000Z",
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
      return [GROW];
    case "tents":
      return [TENT];
    case "plants":
      return [PLANT, SECOND_PLANT];
    case "pheno_hunts":
      return [PHENO_HUNT];
    case "diary_entries":
      return [DIARY_ENTRY];
    case "user_agreement_acceptances":
      return CURRENT_AGREEMENTS;
    case "billing_subscriptions":
    case "subscriptions":
      return BILLING_SUBSCRIPTIONS;
    default:
      return [];
  }
}

function isReadOnlyRpc(rpcName: string): boolean {
  return /^(can_|check_|count_|get_|has_|is_|list_|preview_|resolve_)/.test(rpcName);
}

async function seedFakeSession(page: Page) {
  await page.addInitScript(
    ({ key, user }) => {
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
    },
    { key: SESSION_KEY, user: FAKE_USER },
  );
}

async function installNetworkFence(page: Page, signedIn: boolean, network: NetworkAudit) {
  // Register the broad external fence first. Playwright runs the most recently
  // registered matching route first, so the explicit safe mocks below win.
  await page.route("**/*", async (route, request) => {
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

  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/css", body: "" }),
  );
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort("blockedbyclient"));
  await page.route(
    /google-analytics\.com|googletagmanager\.com|doubleclick\.net|posthog\.com|sentry\.io|clarity\.ms/,
    (route) => route.abort("blockedbyclient"),
  );

  await page.route(/\/auth\/v1\//, async (route, request) => {
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

  await page.route(/\/rest\/v1\//, async (route, request) => {
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
      const body = rpcName === "has_role" || rpcName.startsWith("is_") ? false : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
      return;
    }

    const table = url.pathname.match(/\/rest\/v1\/([^/]+)/i)?.[1] ?? "";
    const rows = rowsForTable(table);
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

  await page.route(/\/storage\/v1\//, async (route, request) => {
    if (!["GET", "HEAD"].includes(request.method())) {
      network.blockedMutations.push(`${request.method()} ${request.url()}`);
      await route.abort("blockedbyclient");
      return;
    }
    network.mockedReadRequests += 1;
    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.route(/\/functions\/v1\//, async (route, request) => {
    const functionName = new URL(request.url()).pathname.split("/").filter(Boolean).at(-1) ?? "";
    const readLike = isReadOnlyEdgeFunction(functionName);
    if (!readLike) {
      network.blockedMutations.push(`${request.method()} ${request.url()}`);
    } else {
      network.mockedReadRequests += 1;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "Synthetic census: edge function not invoked" }),
    });
  });
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

async function accessibleNameForControl(locator: Locator): Promise<string> {
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

async function controlType(locator: Locator): Promise<string> {
  return locator.evaluate((element) => {
    if (element instanceof HTMLInputElement) return element.type || "text";
    if (element instanceof HTMLTextAreaElement) return "textarea";
    if (element instanceof HTMLSelectElement) return "select";
    return element.getAttribute("role") || element.tagName.toLowerCase();
  });
}

async function isVisuallyHiddenImplementationControl(locator: Locator): Promise<boolean> {
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

  for (let index = 0; index < (await controls.count()); index += 1) {
    const control = controls.nth(index);
    if (!(await control.isVisible())) continue;
    if (await isVisuallyHiddenImplementationControl(control)) continue;

    const name = normalizeText(await accessibleNameForControl(control));
    const type = await controlType(control);
    expect(name, `${route.path} has a visible ${type} field without a user-facing name`).not.toBe(
      "",
    );

    const disabled = await control.isDisabled().catch(() => false);
    const editable = await control.isEditable().catch(() => false);
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
      const original = await control.inputValue();
      const alternative = await control.evaluate((element) => {
        const select = element as HTMLSelectElement;
        return Array.from(select.options).find(
          (option) => !option.disabled && option.value !== select.value && option.value !== "",
        )?.value;
      });
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
      await control.selectOption(alternative);
      await expect(control).toHaveValue(alternative);
      await control.selectOption(original);
      audits.push({ route: route.path, name, type, exercised: true });
      continue;
    }

    const original = await control.inputValue().catch(() => "");
    const field = {
      type,
      accessibleName: name,
      min: await control.getAttribute("min"),
      max: await control.getAttribute("max"),
      step: await control.getAttribute("step"),
    };
    const placeholder = placeholderValueForField(field);
    await control.fill(placeholder);
    await expect(control).toHaveValue(placeholder);
    await control.fill(original);
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

async function navigateForAudit(page: Page, route: CoreCensusRoute) {
  const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
  expect(response?.status() ?? 200, `${route.path} document response`).toBeLessThan(400);
  await assertMeaningfulPage(page, route.path);
  const finalPath = new URL(page.url()).pathname;
  const expectedPathname = route.expectedPathname ?? new URL(route.path, APP_ORIGIN).pathname;
  expect(finalPath, `${route.path} unexpectedly redirected`).toBe(expectedPathname);
  return finalPath;
}

async function findVisibleLinkByHref(page: Page, href: string): Promise<Locator | null> {
  const anchors = page.locator("a[href]");
  for (let index = 0; index < (await anchors.count()); index += 1) {
    const anchor = anchors.nth(index);
    if ((await anchor.getAttribute("href")) === href && (await anchor.isVisible())) {
      return anchor;
    }
  }
  return null;
}

async function clickEverySafeInternalHref(
  page: Page,
  linkAudits: readonly LinkAudit[],
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
      await expect
        .poll(async () => (await findVisibleLinkByHref(page, link.href)) !== null, {
          message: `${link.href} must remain visible on ${link.sourcePath}`,
          timeout: 10_000,
        })
        .toBe(true);
      const anchor = await findVisibleLinkByHref(page, link.href);
      expect(anchor, `${link.href} disappeared from ${link.sourcePath}`).not.toBeNull();
      if (!anchor) return;

      const target = await anchor.getAttribute("target");
      if (target === "_blank") {
        const popupPromise = page.context().waitForEvent("page");
        await anchor.click();
        const popup = await popupPromise;
        await popup.waitForLoadState("domcontentloaded");
        await assertMeaningfulPage(popup, link.classification.pathname ?? link.href);
        await popup.close();
      } else {
        await anchor.click();
        await page.waitForLoadState("domcontentloaded");
        await assertMeaningfulPage(page, link.classification.pathname ?? link.href);
        expect(new URL(page.url()).pathname).toBe(link.classification.pathname);
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

  page.on("pageerror", (error) => report.pageErrors.push(`${page.url()}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      report.consoleErrors.push(`${page.url()}: ${message.text()}`);
    }
  });

  if (signedIn) await seedFakeSession(page);
  await installNetworkFence(page, signedIn, network);

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

  report.clickedInternalHrefs = await clickEverySafeInternalHref(page, report.linkAudits);

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
    test.setTimeout(300_000);
    const report = await runLaneCensus(page, "authenticated", AUTHENTICATED_CORE_CENSUS_ROUTES);
    expect(report.routeAudits).toHaveLength(AUTHENTICATED_CORE_CENSUS_ROUTES.length);
    expect(report.fieldAudits.length).toBeGreaterThan(0);
    expect(report.linkAudits.length).toBeGreaterThan(0);
    expect(report.clickedInternalHrefs.length).toBeGreaterThan(0);
  });
});
