// Temporary live browser QA only. Never merge this test branch.
import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

const BASE_URL = (process.env.E2E_BASE_URL ?? "https://verdantgrowdiary-com.lovable.app").replace(/\/$/, "");
const RUN_ID = process.env.GITHUB_RUN_ID ?? String(Date.now());
const RUN_DATE = new Date().toISOString().slice(0, 10);
const QA_PREFIX = `QA ${RUN_DATE} ${RUN_ID}`;
const APP_PASSWORD = `VqA!${RUN_ID}z7#Aa`;
const REPORT_DIR = path.join(process.cwd(), "artifacts", "qa-fake-account");

interface StepReceipt {
  name: string;
  status: "pass" | "fail" | "skip";
  detail?: string;
}

interface RouteReceipt {
  route: string;
  status: "pass" | "fail";
  title: string;
  heading: string;
  detail?: string;
}

interface Mailbox {
  id: string;
  address: string;
  password: string;
  token: string;
}

const report: {
  generatedAt: string;
  baseUrl: string;
  runId: string;
  account: { email: string | null; verified: boolean; sessionCreated: boolean; passwordRecipe: string };
  records: Record<string, string | null>;
  steps: StepReceipt[];
  routes: RouteReceipt[];
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
  httpErrors: string[];
  bugs: Array<{ severity: "critical" | "high" | "medium" | "low"; title: string; reproduction: string; expected: string; actual: string }>;
  safety: Record<string, boolean>;
} = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  runId: RUN_ID,
  account: {
    email: null,
    verified: false,
    sessionCreated: false,
    passwordRecipe: "VqA!<GitHub Actions run id>z7#Aa",
  },
  records: {
    growName: null,
    growId: null,
    tentName: null,
    tentId: null,
    plantName: null,
    plantId: null,
    quickLogNote: null,
    manualSnapshot: null,
  },
  steps: [],
  routes: [],
  consoleErrors: [],
  pageErrors: [],
  requestFailures: [],
  httpErrors: [],
  bugs: [],
  safety: {
    codeEdited: false,
    schemaChanged: false,
    rlsChanged: false,
    existingAccountTouched: false,
    deviceControlUsed: false,
    billingUsed: false,
    adminControlsUsed: false,
  },
};

function sanitize(value: string): string {
  return value
    .replace(/(access_token|refresh_token|token|code)=([^&\s]+)/gi, "$1=[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
    .replace(APP_PASSWORD, "[REDACTED]")
    .slice(0, 1200);
}

function addBug(
  severity: "critical" | "high" | "medium" | "low",
  title: string,
  reproduction: string,
  expected: string,
  actual: string,
) {
  report.bugs.push({ severity, title, reproduction, expected, actual: sanitize(actual) });
}

async function receipt(name: string, fn: () => Promise<string | void>): Promise<boolean> {
  try {
    const detail = await fn();
    report.steps.push({ name, status: "pass", detail: detail ? sanitize(detail) : undefined });
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    report.steps.push({ name, status: "fail", detail: sanitize(detail) });
    return false;
  }
}

async function createMailbox(): Promise<Mailbox> {
  const domainResponse = await fetch("https://api.mail.tm/domains?page=1");
  if (!domainResponse.ok) throw new Error(`mailbox domain lookup failed: ${domainResponse.status}`);
  const domainPayload = (await domainResponse.json()) as { "hydra:member"?: Array<{ domain?: string; isActive?: boolean }> };
  const domain = domainPayload["hydra:member"]?.find((d) => d.domain && d.isActive !== false)?.domain;
  if (!domain) throw new Error("mailbox service returned no active domain");

  const localPart = `verdant-qa-${RUN_ID}-${randomUUID().slice(0, 8)}`.toLowerCase();
  const address = `${localPart}@${domain}`;
  const password = `Mail!${RUN_ID}${randomUUID().slice(0, 8)}Aa`;

  const accountResponse = await fetch("https://api.mail.tm/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, password }),
  });
  if (!accountResponse.ok) throw new Error(`mailbox account creation failed: ${accountResponse.status}`);
  const account = (await accountResponse.json()) as { id?: string };
  if (!account.id) throw new Error("mailbox account response omitted id");

  const tokenResponse = await fetch("https://api.mail.tm/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, password }),
  });
  if (!tokenResponse.ok) throw new Error(`mailbox token creation failed: ${tokenResponse.status}`);
  const tokenPayload = (await tokenResponse.json()) as { token?: string };
  if (!tokenPayload.token) throw new Error("mailbox token response omitted token");

  return { id: account.id, address, password, token: tokenPayload.token };
}

async function waitForVerificationLink(mailbox: Mailbox, timeoutMs = 120_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const listResponse = await fetch("https://api.mail.tm/messages?page=1", {
      headers: { authorization: `Bearer ${mailbox.token}` },
    });
    if (listResponse.ok) {
      const list = (await listResponse.json()) as { "hydra:member"?: Array<{ id?: string; subject?: string }> };
      for (const item of list["hydra:member"] ?? []) {
        if (!item.id) continue;
        const messageResponse = await fetch(`https://api.mail.tm/messages/${item.id}`, {
          headers: { authorization: `Bearer ${mailbox.token}` },
        });
        if (!messageResponse.ok) continue;
        const message = (await messageResponse.json()) as { text?: string; html?: string[] | string; subject?: string };
        const html = Array.isArray(message.html) ? message.html.join("\n") : message.html ?? "";
        const body = `${message.subject ?? item.subject ?? ""}\n${message.text ?? ""}\n${html}`
          .replace(/&amp;/g, "&")
          .replace(/&#x3D;/gi, "=");
        const links = body.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
        const verification = links.find((link) =>
          /\/auth\/v1\/verify|token=|token_hash=|type=signup/i.test(link),
        );
        if (verification) return verification.replace(/[),.;]+$/, "");
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error("email verification message did not arrive within 120 seconds");
}

async function deleteMailbox(mailbox: Mailbox) {
  await fetch(`https://api.mail.tm/accounts/${mailbox.id}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${mailbox.token}` },
  }).catch(() => undefined);
}

async function isAuthenticated(page: Page): Promise<boolean> {
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2_000);
  return page.getByRole("button", { name: "Sign out" }).isVisible().catch(() => false);
}

async function signIn(page: Page, email: string) {
  await page.goto(`${BASE_URL}/auth`, { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Sign in" }).click();
  const button = page.getByRole("button", { name: "Sign in" }).last();
  const form = button.locator("xpath=ancestor::form");
  await form.locator('input[type="email"]').fill(email);
  await form.locator('input[type="password"]').fill(APP_PASSWORD);
  await button.click();
  await page.waitForTimeout(2_500);
}

async function visitRoute(page: Page, route: string, label: string) {
  try {
    const response = await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => undefined);
    const title = await page.title();
    const heading =
      (await page.locator("h1").first().textContent().catch(() => null)) ??
      (await page.locator("h2").first().textContent().catch(() => null)) ??
      label;
    const body = (await page.locator("body").innerText()).trim();
    const badStatus = response && response.status() >= 400;
    const blank = body.length < 20;
    const notFound = /page not found|404/i.test(body) && route !== "/welcome";
    if (badStatus || blank || notFound) {
      const detail = `HTTP ${response?.status() ?? "unknown"}; blank=${blank}; notFound=${notFound}`;
      report.routes.push({ route, status: "fail", title, heading: heading.trim(), detail });
      addBug("high", `Route failed: ${route}`, `Open ${route}`, "A rendered page with working navigation", detail);
      return;
    }
    report.routes.push({ route, status: "pass", title, heading: heading.trim() });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    report.routes.push({ route, status: "fail", title: "", heading: label, detail: sanitize(detail) });
    addBug("high", `Route crashed: ${route}`, `Open ${route}`, "A rendered page", detail);
  }
}

async function writeReport() {
  await mkdir(REPORT_DIR, { recursive: true });
  report.generatedAt = new Date().toISOString();
  await writeFile(path.join(REPORT_DIR, "report.json"), JSON.stringify(report, null, 2), "utf8");

  const lines: string[] = [
    "# Verdant disposable-account browser QA",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Base URL: ${report.baseUrl}`,
    `- GitHub Actions run: ${report.runId}`,
    `- QA account: ${report.account.email ?? "not created"}`,
    `- Email verified: ${report.account.verified}`,
    `- Authenticated session created: ${report.account.sessionCreated}`,
    "",
    "## Steps",
    "",
    "| Step | Result | Detail |",
    "|---|---|---|",
    ...report.steps.map((s) => `| ${s.name} | ${s.status.toUpperCase()} | ${(s.detail ?? "").replace(/\|/g, "\\|")} |`),
    "",
    "## Routes",
    "",
    "| Route | Result | Heading | Detail |",
    "|---|---|---|---|",
    ...report.routes.map((r) => `| ${r.route} | ${r.status.toUpperCase()} | ${r.heading.replace(/\|/g, "\\|")} | ${(r.detail ?? "").replace(/\|/g, "\\|")} |`),
    "",
    "## Records created",
    "",
    ...Object.entries(report.records).map(([key, value]) => `- ${key}: ${value ?? "not created"}`),
    "",
    "## Bugs",
    "",
    ...(report.bugs.length
      ? report.bugs.flatMap((bug, index) => [
          `### ${index + 1}. [${bug.severity.toUpperCase()}] ${bug.title}`,
          `- Reproduction: ${bug.reproduction}`,
          `- Expected: ${bug.expected}`,
          `- Actual: ${bug.actual}`,
          "",
        ])
      : ["No application bug was confirmed by this run.", ""]),
    "## Browser errors",
    "",
    `- Console errors: ${report.consoleErrors.length}`,
    `- Page errors: ${report.pageErrors.length}`,
    `- Request failures: ${report.requestFailures.length}`,
    `- HTTP >= 400 responses: ${report.httpErrors.length}`,
    "",
    "## Safety",
    "",
    ...Object.entries(report.safety).map(([key, value]) => `- ${key}: ${value}`),
  ];
  await writeFile(path.join(REPORT_DIR, "report.md"), lines.join("\n"), "utf8");
}

test("create an isolated fake account and exercise Verdant through the normal UI", async ({ page }) => {
  test.setTimeout(240_000);
  let mailbox: Mailbox | null = null;
  const coreFailures: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") report.consoleErrors.push(sanitize(message.text()));
  });
  page.on("pageerror", (error) => report.pageErrors.push(sanitize(error.message)));
  page.on("requestfailed", (request) => {
    report.requestFailures.push(sanitize(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "failed"}`));
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      report.httpErrors.push(sanitize(`${response.status()} ${response.request().method()} ${response.url()}`));
    }
  });

  try {
    const mailboxOk = await receipt("Create disposable QA mailbox", async () => {
      mailbox = await createMailbox();
      report.account.email = mailbox.address;
      return `Created ${mailbox.address}`;
    });
    if (!mailboxOk || !mailbox) {
      coreFailures.push("mailbox");
      return;
    }

    const signupOk = await receipt("Create account through Verdant signup UI", async () => {
      await page.goto(`${BASE_URL}/auth`, { waitUntil: "domcontentloaded" });
      await page.getByRole("tab", { name: "Create account" }).click();
      const createButton = page.getByRole("button", { name: "Create account" }).last();
      const form = createButton.locator("xpath=ancestor::form");
      await form.locator('input[type="email"]').fill(mailbox!.address);
      await form.locator('input[type="password"]').fill(APP_PASSWORD);
      await createButton.click();
      await page.waitForTimeout(3_000);

      const toast = await page.locator("[data-sonner-toast]").last().innerText().catch(() => "");
      if (/invalid|error|rate limit|already registered|not allowed/i.test(toast)) {
        throw new Error(`signup toast: ${toast}`);
      }

      let authenticated = await isAuthenticated(page);
      if (!authenticated) {
        const verificationLink = await waitForVerificationLink(mailbox!);
        await page.goto(verificationLink, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3_000);
        report.account.verified = true;
        authenticated = await isAuthenticated(page);
      } else {
        report.account.verified = true;
      }

      if (!authenticated) {
        await signIn(page, mailbox!.address);
        authenticated = await isAuthenticated(page);
      }
      if (!authenticated) throw new Error("signup completed but no authenticated session could be established");

      report.account.sessionCreated = true;
      return `Authenticated ${mailbox!.address}`;
    });
    if (!signupOk) {
      coreFailures.push("signup");
      return;
    }

    await deleteMailbox(mailbox);

    const growName = `${QA_PREFIX} One-Tent Loop`;
    const tentName = `${QA_PREFIX} Tent`;
    const plantName = `${QA_PREFIX} Plant`;
    const strainName = "QA Test Cultivar";
    const quickLogNote = "QA browser test — normal signup and core loop verification.";

    const growOk = await receipt("Create one QA grow", async () => {
      await page.goto(`${BASE_URL}/grows`, { waitUntil: "domcontentloaded" });
      const openButton = page.getByRole("button", { name: /^(New|Create grow)$/ }).first();
      await openButton.click();
      const dialog = page.getByRole("dialog");
      await dialog.getByPlaceholder(/Tent #1, Backyard, Mothers/i).fill(growName);
      await dialog.getByRole("button", { name: "Create grow" }).click();
      const link = page.locator('a[data-testid="grow-card-link"]').filter({ hasText: growName }).first();
      await expect(link).toBeVisible();
      const href = await link.getAttribute("href");
      const growId = href?.split("/").filter(Boolean).at(-1) ?? null;
      if (!growId) throw new Error("grow card did not expose a grow id");
      report.records.growName = growName;
      report.records.growId = growId;
      return growId;
    });
    if (!growOk || !report.records.growId) coreFailures.push("grow");

    const tentOk = await receipt("Create one grow-scoped QA tent", async () => {
      if (!report.records.growId) throw new Error("grow id unavailable");
      await page.goto(`${BASE_URL}/tents?growId=${report.records.growId}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: /New tent/i }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByPlaceholder("Tent #1").fill(tentName);
      await dialog.getByRole("button", { name: "Create tent" }).click();
      const link = page.locator('a[href^="/tents/"]').filter({ hasText: tentName }).first();
      await expect(link).toBeVisible();
      const href = await link.getAttribute("href");
      const tentId = href?.split("/").filter(Boolean).at(-1) ?? null;
      if (!tentId) throw new Error("tent card did not expose a tent id");
      report.records.tentName = tentName;
      report.records.tentId = tentId;
      return tentId;
    });
    if (!tentOk || !report.records.tentId) coreFailures.push("tent");

    const plantOk = await receipt("Create one QA plant assigned to the QA tent", async () => {
      if (!report.records.growId) throw new Error("grow id unavailable");
      await page.goto(`${BASE_URL}/plants?growId=${report.records.growId}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: /New plant/i }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByPlaceholder("Plant A").fill(plantName);
      const comboBoxes = dialog.getByRole("combobox");
      if ((await comboBoxes.count()) < 2) throw new Error("plant dialog tent selector was not rendered");
      await comboBoxes.nth(1).click();
      await page.getByRole("option", { name: tentName }).click();
      await dialog.getByText("Optional details (enrich later)").click();
      await dialog.getByPlaceholder("Blue Dream").fill(strainName);
      await dialog.getByRole("button", { name: "Create plant" }).click();
      const link = page.locator('a[data-testid="plant-card"]').filter({ hasText: plantName }).first();
      await expect(link).toBeVisible();
      const href = await link.getAttribute("href");
      const plantId = href?.split("/").filter(Boolean).at(-1) ?? null;
      if (!plantId) throw new Error("plant card did not expose a plant id");
      report.records.plantName = plantName;
      report.records.plantId = plantId;
      return plantId;
    });
    if (!plantOk || !report.records.plantId) coreFailures.push("plant");

    const logOk = await receipt("Create one Quick Log observation", async () => {
      await page.getByRole("button", { name: "Quick log" }).first().click();
      const dialog = page.getByRole("dialog");
      const plantError = dialog.getByTestId("quick-log-plant-error");
      if (await plantError.isVisible().catch(() => false)) {
        await dialog.getByTestId("quick-log-plant-select").click();
        await page.getByRole("option", { name: new RegExp(plantName) }).click();
      }
      await dialog.getByTestId("quicklog-note").fill(quickLogNote);
      await dialog.getByTestId("quick-log-save").click();
      await expect(dialog.getByTestId("quick-log-post-save")).toBeVisible();
      report.records.quickLogNote = quickLogNote;
      await dialog.getByTestId("quick-log-view-target-plant").click();
      await page.waitForURL(new RegExp(`/plants/${report.records.plantId}`));
      return "Quick Log saved and opened target plant";
    });
    if (!logOk) coreFailures.push("quick-log");

    await receipt("Confirm Quick Log appears in plant memory", async () => {
      await expect(page.getByText(quickLogNote, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
      return "Plant detail rendered the saved note";
    });

    await receipt("Add one clearly manual QA sensor snapshot", async () => {
      await page.goto(`${BASE_URL}/sensors`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("manual-sensor-reading-card")).toBeVisible();
      const tentSelect = page.getByTestId("manual-reading-tent-select");
      if (await tentSelect.isVisible().catch(() => false)) {
        await tentSelect.click();
        await page.getByRole("option", { name: tentName }).click();
      }
      await page.locator("#m-air-temp").fill("75");
      await page.locator("#m-humidity").fill("55");
      const helper = await page.getByTestId("manual-reading-helper").innerText();
      if (!/manual snapshot/i.test(helper) || /live sensor data/i.test(helper) === false) {
        throw new Error(`manual source helper was unclear: ${helper}`);
      }
      await page.getByTestId("manual-reading-save").click();
      await expect(page.locator("#m-air-temp")).toHaveValue("");
      report.records.manualSnapshot = "75°F / 55% RH — manual QA snapshot";
      return "Saved as manual; helper explicitly says not live sensor data";
    });

    await receipt("Inspect AI Doctor readiness without spending credits", async () => {
      await page.goto(`${BASE_URL}/doctor`, { waitUntil: "domcontentloaded" });
      const body = await page.locator("body").innerText();
      if (!/doctor|coach|readiness|context/i.test(body)) throw new Error("AI Doctor page lacked readiness/context copy");
      if (/purchase|checkout|charge now/i.test(body)) return "Page loaded; paid action was not invoked";
      return "Page loaded; no external model action invoked";
    });

    await receipt("Inspect Alerts without creating actions", async () => {
      await page.goto(`${BASE_URL}/alerts`, { waitUntil: "domcontentloaded" });
      const body = await page.locator("body").innerText();
      if (!/alert/i.test(body)) throw new Error("Alerts page did not render alert copy");
      return "Read-only inspection only";
    });

    await receipt("Inspect Action Queue without approval, simulation, or execution", async () => {
      await page.goto(`${BASE_URL}/actions`, { waitUntil: "domcontentloaded" });
      const body = await page.locator("body").innerText();
      if (!/action/i.test(body)) throw new Error("Action Queue page did not render action copy");
      report.safety.deviceControlUsed = false;
      return "No action controls were invoked";
    });

    const routes: Array<[string, string]> = [
      ["/", "Dashboard"],
      ["/grows", "Grows"],
      ["/tents", "Tents"],
      ["/plants", "Plants"],
      ["/timeline", "Timeline"],
      ["/sensors", "Sensors"],
      ["/doctor", "AI Doctor"],
      ["/alerts", "Alerts"],
      ["/actions", "Action Queue"],
      ["/reports", "Reports"],
      ["/tasks", "Tasks"],
      ["/settings", "Settings"],
      ["/pricing", "Pricing"],
      ["/hardware-integrations", "Hardware Integrations"],
      ["/welcome", "Landing"],
    ];
    for (const [route, label] of routes) await visitRoute(page, route, label);

    const routeFailures = report.routes.filter((route) => route.status === "fail");
    if (routeFailures.length > 0) coreFailures.push(`${routeFailures.length} route(s)`);
  } finally {
    if (mailbox) await deleteMailbox(mailbox);
    await writeReport();
  }

  expect(coreFailures, `Core QA failures: ${coreFailures.join(", ")}`).toEqual([]);
});
