import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = (process.env.E2E_BASE_URL ?? "https://verdantgrowdiary-com.lovable.app").replace(/\/$/, "");
const PHASE = process.env.QA_PHASE ?? "signup";
const EMAIL = process.env.QA_EMAIL ?? "";
const PASSWORD = process.env.QA_PASSWORD ?? "";
const RUN_ID = process.env.GITHUB_RUN_ID ?? String(Date.now());
const QA_PREFIX = `QA ${new Date().toISOString().slice(0, 10)} ${RUN_ID}`;
const REPORT_DIR = path.join(process.cwd(), "artifacts", "qa-gmail-account");

type Status = "pass" | "fail" | "skip";
interface Step { name: string; status: Status; detail?: string }
interface RouteResult { route: string; status: "pass" | "fail"; heading: string; detail?: string }

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  runId: RUN_ID,
  phase: PHASE,
  account: { email: EMAIL, signupAccepted: false, authenticated: false },
  records: {
    growName: null as string | null,
    growId: null as string | null,
    tentName: null as string | null,
    tentId: null as string | null,
    plantName: null as string | null,
    plantId: null as string | null,
    quickLogNote: null as string | null,
    manualSnapshot: null as string | null,
  },
  steps: [] as Step[],
  routes: [] as RouteResult[],
  consoleErrors: [] as string[],
  pageErrors: [] as string[],
  requestFailures: [] as string[],
  httpErrors: [] as string[],
  safety: {
    existingAccountTouched: false,
    deviceControlUsed: false,
    billingUsed: false,
    adminControlsUsed: false,
    aiModelInvoked: false,
    sensorSourceWasManual: false,
  },
};

function clean(text: string): string {
  return text
    .replace(PASSWORD, "[REDACTED]")
    .replace(/(access_token|refresh_token|token|code)=([^&\s]+)/gi, "$1=[REDACTED]")
    .slice(0, 1200);
}

async function runStep(name: string, fn: () => Promise<string | void>): Promise<boolean> {
  try {
    const detail = await fn();
    report.steps.push({ name, status: "pass", detail: detail ? clean(detail) : undefined });
    return true;
  } catch (error) {
    report.steps.push({ name, status: "fail", detail: clean(error instanceof Error ? error.message : String(error)) });
    return false;
  }
}

async function saveReport() {
  await mkdir(REPORT_DIR, { recursive: true });
  report.generatedAt = new Date().toISOString();
  await writeFile(path.join(REPORT_DIR, `report-${PHASE}.json`), JSON.stringify(report, null, 2), "utf8");
  const lines = [
    `# Verdant Gmail-owned QA account — ${PHASE}`,
    "",
    `- Generated: ${report.generatedAt}`,
    `- Run: ${report.runId}`,
    `- Account: ${report.account.email}`,
    `- Signup accepted: ${report.account.signupAccepted}`,
    `- Authenticated: ${report.account.authenticated}`,
    "",
    "## Steps",
    "",
    ...report.steps.map((s) => `- ${s.status.toUpperCase()}: ${s.name}${s.detail ? ` — ${s.detail}` : ""}`),
    "",
    "## Routes",
    "",
    ...report.routes.map((r) => `- ${r.status.toUpperCase()}: ${r.route} — ${r.heading}${r.detail ? ` — ${r.detail}` : ""}`),
    "",
    "## Records",
    "",
    ...Object.entries(report.records).map(([key, value]) => `- ${key}: ${value ?? "not created"}`),
    "",
    "## Browser signals",
    "",
    `- Console errors: ${report.consoleErrors.length}`,
    `- Page errors: ${report.pageErrors.length}`,
    `- Request failures: ${report.requestFailures.length}`,
    `- HTTP errors: ${report.httpErrors.length}`,
    "",
    "## Safety",
    "",
    ...Object.entries(report.safety).map(([key, value]) => `- ${key}: ${value}`),
  ];
  await writeFile(path.join(REPORT_DIR, `report-${PHASE}.md`), lines.join("\n"), "utf8");
}

async function login(page: Page) {
  await page.goto(`${BASE_URL}/auth`, { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Sign in" }).click();
  const button = page.getByRole("button", { name: "Sign in" }).last();
  const form = button.locator("xpath=ancestor::form");
  await form.locator('input[type="email"]').fill(EMAIL);
  await form.locator('input[type="password"]').fill(PASSWORD);
  await button.click();
  await page.waitForTimeout(3_000);
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2_000);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  report.account.authenticated = true;
}

async function routeCheck(page: Page, route: string, label: string) {
  try {
    const response = await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    const body = (await page.locator("body").innerText()).trim();
    const heading =
      (await page.locator("h1").first().textContent().catch(() => null)) ??
      (await page.locator("h2").first().textContent().catch(() => null)) ??
      label;
    if ((response?.status() ?? 200) >= 400 || body.length < 20 || /page not found|404/i.test(body)) {
      report.routes.push({ route, status: "fail", heading: heading.trim(), detail: `HTTP ${response?.status() ?? "unknown"}; body=${body.length}` });
    } else {
      report.routes.push({ route, status: "pass", heading: heading.trim() });
    }
  } catch (error) {
    report.routes.push({ route, status: "fail", heading: label, detail: clean(error instanceof Error ? error.message : String(error)) });
  }
}

test("create and use a Gmail-owned Verdant QA account", async ({ page }) => {
  test.setTimeout(240_000);
  if (!EMAIL || !PASSWORD) throw new Error("QA_EMAIL and QA_PASSWORD are required");

  page.on("console", (message) => {
    if (message.type() === "error") report.consoleErrors.push(clean(message.text()));
  });
  page.on("pageerror", (error) => report.pageErrors.push(clean(error.message)));
  page.on("requestfailed", (request) => {
    if (!request.url().includes("google-analytics.com")) {
      report.requestFailures.push(clean(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "failed"}`));
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) report.httpErrors.push(clean(`${response.status()} ${response.request().method()} ${response.url()}`));
  });

  const failures: string[] = [];
  try {
    if (PHASE === "signup") {
      const ok = await runStep("Create account through the normal signup UI", async () => {
        await page.goto(`${BASE_URL}/auth`, { waitUntil: "domcontentloaded" });
        await page.getByRole("tab", { name: "Create account" }).click();
        const button = page.getByRole("button", { name: "Create account" }).last();
        const form = button.locator("xpath=ancestor::form");
        await form.locator('input[type="email"]').fill(EMAIL);
        await form.locator('input[type="password"]').fill(PASSWORD);
        await button.click();
        await page.waitForTimeout(4_000);
        const toast = await page.locator("[data-sonner-toast]").last().innerText().catch(() => "");
        if (/invalid|error|rate limit|already registered|not allowed/i.test(toast)) {
          throw new Error(`signup rejected: ${toast}`);
        }
        report.account.signupAccepted = true;
        return toast || "Signup request accepted; confirmation email expected";
      });
      if (!ok) failures.push("signup");
    } else if (PHASE === "login-core") {
      const loginOk = await runStep("Sign in after email confirmation", async () => {
        await login(page);
        return "Authenticated session established";
      });
      if (!loginOk) failures.push("login");

      const growName = `${QA_PREFIX} One-Tent Loop`;
      const tentName = `${QA_PREFIX} Tent`;
      const plantName = `${QA_PREFIX} Plant`;
      const logNote = "QA browser test — verified account and One-Tent Loop exercise.";

      const growOk = await runStep("Create one QA grow", async () => {
        await page.goto(`${BASE_URL}/grows`, { waitUntil: "domcontentloaded" });
        await page.getByRole("button", { name: /^(New|Create grow)$/ }).first().click();
        const dialog = page.getByRole("dialog");
        await dialog.getByPlaceholder(/Tent #1, Backyard, Mothers/i).fill(growName);
        await dialog.getByRole("button", { name: "Create grow" }).click();
        const link = page.locator('a[data-testid="grow-card-link"]').filter({ hasText: growName }).first();
        await expect(link).toBeVisible();
        const href = await link.getAttribute("href");
        report.records.growName = growName;
        report.records.growId = href?.split("/").filter(Boolean).at(-1) ?? null;
        if (!report.records.growId) throw new Error("new grow id missing");
      });
      if (!growOk) failures.push("grow");

      const tentOk = await runStep("Create one grow-scoped QA tent", async () => {
        if (!report.records.growId) throw new Error("grow id missing");
        await page.goto(`${BASE_URL}/tents?growId=${report.records.growId}`, { waitUntil: "domcontentloaded" });
        await page.getByRole("button", { name: /New tent/i }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByPlaceholder("Tent #1").fill(tentName);
        await dialog.getByRole("button", { name: "Create tent" }).click();
        const link = page.locator('a[href^="/tents/"]').filter({ hasText: tentName }).first();
        await expect(link).toBeVisible();
        const href = await link.getAttribute("href");
        report.records.tentName = tentName;
        report.records.tentId = href?.split("/").filter(Boolean).at(-1) ?? null;
        if (!report.records.tentId) throw new Error("new tent id missing");
      });
      if (!tentOk) failures.push("tent");

      const plantOk = await runStep("Create one QA plant assigned to the QA tent", async () => {
        if (!report.records.growId) throw new Error("grow id missing");
        await page.goto(`${BASE_URL}/plants?growId=${report.records.growId}`, { waitUntil: "domcontentloaded" });
        await page.getByRole("button", { name: /New plant/i }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByPlaceholder("Plant A").fill(plantName);
        const combos = dialog.getByRole("combobox");
        await combos.nth(1).click();
        await page.getByRole("option", { name: tentName }).click();
        await dialog.getByText("Optional details (enrich later)").click();
        await dialog.getByPlaceholder("Blue Dream").fill("QA Test Cultivar");
        await dialog.getByRole("button", { name: "Create plant" }).click();
        const link = page.locator('a[data-testid="plant-card"]').filter({ hasText: plantName }).first();
        await expect(link).toBeVisible();
        const href = await link.getAttribute("href");
        report.records.plantName = plantName;
        report.records.plantId = href?.split("/").filter(Boolean).at(-1) ?? null;
        if (!report.records.plantId) throw new Error("new plant id missing");
      });
      if (!plantOk) failures.push("plant");

      const logOk = await runStep("Create one Quick Log observation", async () => {
        await page.getByRole("button", { name: "Quick log" }).first().click();
        const dialog = page.getByRole("dialog");
        if (await dialog.getByTestId("quick-log-plant-error").isVisible().catch(() => false)) {
          await dialog.getByTestId("quick-log-plant-select").click();
          await page.getByRole("option", { name: new RegExp(plantName) }).click();
        }
        await dialog.getByTestId("quicklog-note").fill(logNote);
        await dialog.getByTestId("quick-log-save").click();
        await expect(dialog.getByTestId("quick-log-post-save")).toBeVisible();
        report.records.quickLogNote = logNote;
        await dialog.getByTestId("quick-log-view-target-plant").click();
        await page.waitForURL(new RegExp(`/plants/${report.records.plantId}`));
        await expect(page.getByText(logNote, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
      });
      if (!logOk) failures.push("quick-log");

      const sensorOk = await runStep("Save one explicitly manual QA sensor snapshot", async () => {
        await page.goto(`${BASE_URL}/sensors`, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("manual-sensor-reading-card")).toBeVisible();
        const tentSelect = page.getByTestId("manual-reading-tent-select");
        await tentSelect.click();
        await page.getByRole("option", { name: tentName }).click();
        const helper = await page.getByTestId("manual-reading-helper").innerText();
        if (!/manual snapshot/i.test(helper) || !/not live sensor data/i.test(helper)) {
          throw new Error(`manual provenance helper failed: ${helper}`);
        }
        await page.locator("#m-air-temp").fill("75");
        await page.locator("#m-humidity").fill("55");
        await page.getByTestId("manual-reading-save").click();
        await expect(page.locator("#m-air-temp")).toHaveValue("");
        report.records.manualSnapshot = "75°F / 55% RH — manual QA snapshot";
        report.safety.sensorSourceWasManual = true;
      });
      if (!sensorOk) failures.push("manual-sensor");

      await runStep("Inspect AI Doctor without invoking a model", async () => {
        await page.goto(`${BASE_URL}/doctor`, { waitUntil: "domcontentloaded" });
        if (!/doctor|coach|readiness|context/i.test(await page.locator("body").innerText())) {
          throw new Error("AI Doctor readiness content missing");
        }
        report.safety.aiModelInvoked = false;
      });
      await runStep("Inspect Alerts read-only", async () => {
        await page.goto(`${BASE_URL}/alerts`, { waitUntil: "domcontentloaded" });
        if (!/alert/i.test(await page.locator("body").innerText())) throw new Error("Alerts page missing");
      });
      await runStep("Inspect approval-required Action Queue read-only", async () => {
        await page.goto(`${BASE_URL}/actions`, { waitUntil: "domcontentloaded" });
        if (!/action/i.test(await page.locator("body").innerText())) throw new Error("Action Queue page missing");
      });

      for (const [route, label] of [
        ["/", "Dashboard"], ["/grows", "Grows"], ["/tents", "Tents"], ["/plants", "Plants"],
        ["/timeline", "Timeline"], ["/sensors", "Sensors"], ["/doctor", "AI Doctor"],
        ["/alerts", "Alerts"], ["/actions", "Action Queue"], ["/reports", "Reports"],
        ["/tasks", "Tasks"], ["/settings", "Settings"], ["/pricing", "Pricing"],
        ["/hardware-integrations", "Hardware Integrations"], ["/welcome", "Landing"],
      ] as Array<[string, string]>) {
        await routeCheck(page, route, label);
      }
      if (report.routes.some((r) => r.status === "fail")) failures.push("routes");
    } else {
      throw new Error(`Unknown QA_PHASE: ${PHASE}`);
    }
  } finally {
    await saveReport();
  }

  expect(failures, `QA failures: ${failures.join(", ")}`).toEqual([]);
});
