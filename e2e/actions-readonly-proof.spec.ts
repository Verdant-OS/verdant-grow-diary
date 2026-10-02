import { test, expect } from "./lib/authedTest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { installSignedInReadonlyProof } from "./lib/signedInReadonlyProof";
import { readLivePerformanceIdentity } from "./lib/signedInPerformanceProbe";
import { PERFORMANCE_ORIGIN } from "./lib/signedInPerformanceRules";
import { QUICKLOG_SMOKE_BACKEND_ORIGIN } from "./lib/productionQuickLogFixtureRules";
import { ANALYTICS_CONSENT_STORAGE_KEY } from "../src/lib/analyticsConsent";
import {
  actionsFixtureUserId,
  buildActionsReadonlyReceipt,
  chooseOwnedActionsGrow,
  isActionsGrowRead,
  isScopedActionsRead,
  readScopedActions,
  type ActionsReadonlySample,
  type ReadonlyAction,
} from "./lib/actionsReadonlyProofRules";

// Real own-fixture reads only. No transitions, suggestions, AI, equipment,
// customer data or persisted fixture changes. The existing barrier stays intact.
test.use({ trace: "off", video: "off", screenshot: "off", serviceWorkers: "block" });
test.describe("production Actions read-only proof", () => {
  test.describe.configure({ retries: 0 });
  test.skip(
    process.env.E2E_MEASURE_ACTIONS_READONLY !== "true",
    "Requires explicit read-only proof lane.",
  );
  test("owned queue readback and refresh preserve approval-required framing", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-authed", "Normal fixture sign-in required.");
    test.setTimeout(75_000);
    const proof = await installSignedInReadonlyProof(page);
    const sample: ActionsReadonlySample = {
      expectedSha: process.env.E2E_EXPECTED_SHA ?? "",
      accountVerified: false,
      before: null,
      after: null,
      checks: {},
      initialCount: null,
      refreshedCount: null,
      barrierPassed: false,
      blockedWrites: 0,
      applicationErrors: 0,
      elapsedMs: null,
    };
    let stage = "fixture-account-and-grow",
      failed = false;
    page.on("pageerror", () => sample.applicationErrors++);
    await page.addInitScript(
      (key) => localStorage.setItem(key, "denied"),
      ANALYTICS_CONSENT_STORAGE_KEY,
    );

    const assertReadback = async (rows: ReadonlyAction[]) => {
      await expect(page.getByTestId("action-queue-refresh-button")).toBeEnabled();
      await expect(page.getByTestId("action-queue-last-updated")).toBeVisible();
      await expect(page.getByTestId("action-queue-missing-context")).toHaveCount(0);
      const visible = rows.slice(0, 25);
      await expect(page.getByTestId("action-queue-row")).toHaveCount(visible.length);
      for (const row of visible) {
        const rendered = page.locator(
          '[data-testid="action-queue-row"][data-action-id="' + row.id + '"]',
        );
        await expect(rendered).toHaveCount(1);
        await expect(rendered.getByRole("heading", { name: row.title, exact: true })).toBeVisible();
      }
      await expect(
        page.getByRole("heading", {
          name:
            "Needs Review (" + visible.filter((r) => r.status === "pending_approval").length + ")",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByTestId("action-queue-pagination-range")).toHaveText(
        rows.length === 0 ? "0 of 0" : "Showing 1–" + visible.length + " of " + rows.length,
      );
      if (!visible.some((r) => r.status === "pending_approval")) {
        await expect(page.getByTestId("action-queue-empty-pending")).toBeVisible();
        await expect(page.getByTestId("one-tent-loop-action-queue-empty")).toHaveText(
          "No approval-required actions are pending.",
        );
      }
      await expect(page.getByRole("dialog")).toHaveCount(0);
    };

    try {
      const authRead = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          response.url().split("?")[0] === QUICKLOG_SMOKE_BACKEND_ORIGIN + "/auth/v1/user",
        { timeout: 20_000 },
      );
      const growRead = page.waitForResponse(
        (response) => isActionsGrowRead(response.request().method(), response.url()),
        { timeout: 20_000 },
      );
      await page.goto(PERFORMANCE_ORIGIN + "/grows");
      const [auth, grows] = await Promise.all([authRead, growRead]);
      const owner = auth.status() === 200 ? actionsFixtureUserId(await auth.json()) : null;
      await proof.waitForAccount();
      if (!owner) throw new Error("fixture_identity_unproved");
      sample.accountVerified = true;
      const grow = chooseOwnedActionsGrow(await grows.json(), grows.status(), owner);
      if (!grow) throw new Error("owned_active_grow_unproved");
      sample.checks["owned-active-grow"] = true;
      sample.before = await readLivePerformanceIdentity(page);
      if (!sample.before || sample.before.commit !== sample.expectedSha)
        throw new Error("deployment_unproved");
      const started = performance.now();
      stage = "initial-queue-read";
      const initialRead = page.waitForResponse(
        (response) => isScopedActionsRead(response.request().method(), response.url(), grow),
        { timeout: 20_000 },
      );
      await page.goto(PERFORMANCE_ORIGIN + "/actions?growId=" + grow);
      const initial = await initialRead;
      const rows = readScopedActions(await initial.json(), initial.status(), grow);
      if (!rows) throw new Error("queue_read_unproved");
      sample.initialCount = rows.length;
      sample.checks["initial-successful-read"] = true;
      stage = "initial-ui-readback";
      await assertReadback(rows);
      sample.checks["initial-ui-readback"] = true;
      await expect(page.getByTestId("one-tent-loop-action-queue-landing-title")).toHaveText(
        "Approval-required Action Queue",
      );
      await expect(page.getByTestId("one-tent-loop-action-queue-landing-note")).toHaveText(
        "Verdant suggests. Grower approves.",
      );
      await expect(
        page.getByText(
          "Suggestions are approval-gated. Verdant never sends commands to equipment.",
          { exact: true },
        ),
      ).toBeVisible();
      sample.checks["approval-required-framing"] = true;
      await proof.waitForAccount();
      stage = "refresh-queue-read";
      const refreshRead = page.waitForResponse(
        (response) => isScopedActionsRead(response.request().method(), response.url(), grow),
        { timeout: 20_000 },
      );
      // The only clicked control is the audited existing GET-only refresh.
      await page.getByTestId("action-queue-refresh-button").click();
      const refreshed = await refreshRead;
      const refreshedRows = readScopedActions(await refreshed.json(), refreshed.status(), grow);
      if (!refreshedRows) throw new Error("queue_refresh_unproved");
      sample.refreshedCount = refreshedRows.length;
      sample.checks["refresh-successful-read"] = true;
      stage = "refresh-ui-readback";
      await assertReadback(refreshedRows);
      sample.checks["refresh-ui-readback"] = true;
      await proof.waitForAccount();
      sample.elapsedMs = performance.now() - started;
      sample.after = await readLivePerformanceIdentity(page);
      await proof.waitForAccount();
    } catch {
      failed = true; // No raw exception, action text or private row ids exported.
    } finally {
      if (sample.before && !sample.after) sample.after = await readLivePerformanceIdentity(page);
      await page.context().close();
      try {
        await proof.assertReady();
        sample.barrierPassed = true;
      } catch {
        sample.barrierPassed = false;
      }
      sample.blockedWrites = proof.blockedWrites();
      const receipt = buildActionsReadonlyReceipt(sample);
      const path = testInfo.outputPath("actions-readonly-proof.json");
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        JSON.stringify(
          {
            ...receipt,
            stage,
            blockedWrites: sample.blockedWrites,
            applicationErrors: sample.applicationErrors,
            blockedRequests: proof.blockedRequests(),
            allowedRoleReads: proof.allowedRoleReads(),
            allowedPhotoReads: proof.allowedPhotoReads(),
          },
          null,
          2,
        ),
      );
      await testInfo.attach("actions-readonly-proof", { path, contentType: "application/json" });
      proof.dispose();
    }
    const receipt = buildActionsReadonlyReceipt(sample);
    if (failed || receipt.status !== "PASS")
      throw new Error("actions_readonly_" + receipt.status + ":" + receipt.reason + ":" + stage);
  });
});
