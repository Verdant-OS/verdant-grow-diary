import { test, expect } from "./lib/authedTest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { installSignedInReadonlyProof } from "./lib/signedInReadonlyProof";
import { readLivePerformanceIdentity } from "./lib/signedInPerformanceProbe";
import { PERFORMANCE_ORIGIN } from "./lib/signedInPerformanceRules";
import { QUICKLOG_SMOKE_BACKEND_ORIGIN } from "./lib/productionQuickLogFixtureRules";
import {
  buildSettingsProofReceipt,
  hasCurrentSettingsAgreements,
  isOwnSettingsRead,
  readMarketingPreference,
  settingsFixtureUserId,
  SETTINGS_PROOF_CHECKS,
  type SettingsProofOperation,
  type SettingsProofSample,
} from "./lib/settingsAccountProofRules";
import { ANALYTICS_CONSENT_STORAGE_KEY } from "../src/lib/analyticsConsent";
import { CURRENT_AGREEMENT_LIST } from "../src/constants/agreements";

// Real fixture account and real application responses. No profile/consent,
// subscription, AI, account-deletion or Action Queue mutation is permitted.
// Preference saves affect only this disposable browser context's local storage.
test.use({ trace: "off", video: "off", screenshot: "off", serviceWorkers: "block" });
test.describe("production settings/account/consent proof", () => {
  test.describe.configure({ retries: 0 });
  test.skip(
    process.env.E2E_MEASURE_SETTINGS_ACCOUNT !== "true",
    "Requires the explicit production proof lane.",
  );
  for (const operation of Object.keys(SETTINGS_PROOF_CHECKS) as SettingsProofOperation[]) {
    test(operation, async ({ page }, testInfo) => {
      test.skip(
        testInfo.project.name !== "chromium-authed",
        "Normal fixture authentication required.",
      );
      test.setTimeout(75_000);
      const proof = await installSignedInReadonlyProof(page);
      const sample: SettingsProofSample = {
        operation,
        expectedSha: process.env.E2E_EXPECTED_SHA ?? "",
        accountVerified: false,
        before: null,
        after: null,
        checks: {},
        barrierPassed: false,
        blockedWrites: 0,
        applicationErrors: 0,
        elapsedMs: null,
      };
      let receipt = buildSettingsProofReceipt(sample);
      let stage = "fixture-precondition";
      let analyticsRequests = 0;
      page.on("pageerror", () => sample.applicationErrors++);
      page.on("request", (request) => {
        try {
          const url = new URL(request.url());
          const hostname = url.hostname;
          if (
            /(^|\.)(google-analytics\.com|googletagmanager\.com|doubleclick\.net|vercel-insights\.com|vercel-analytics\.com)$/.test(
              hostname,
            ) ||
            (url.origin === PERFORMANCE_ORIGIN &&
              /^\/_vercel\/(insights|speed-insights)(\/|$)/.test(url.pathname))
          )
            analyticsRequests++;
        } catch {
          /* No request URL enters the receipt. */
        }
      });
      // Fresh context only. Never changes the auth setup's persistent files.
      await page.addInitScript(
        ({ key, unset }) => {
          const marker = "verdant:settings-proof-initialized";
          if (unset) {
            if (sessionStorage.getItem(marker) !== "true") {
              localStorage.removeItem(key);
              sessionStorage.setItem(marker, "true");
            }
          } else localStorage.setItem(key, "denied");
        },
        { key: ANALYTICS_CONSENT_STORAGE_KEY, unset: operation === "analytics-refusal" },
      );
      let failed = false;
      try {
        const authRead = page.waitForResponse(
          (response) =>
            response.request().method() === "GET" &&
            response.url().split("?")[0] === QUICKLOG_SMOKE_BACKEND_ORIGIN + "/auth/v1/user",
          { timeout: 20_000 },
        );
        await page.goto(PERFORMANCE_ORIGIN + "/settings");
        const authResponse = await authRead;
        const owner =
          authResponse.status() === 200 ? settingsFixtureUserId(await authResponse.json()) : null;
        await proof.waitForAccount();
        if (!owner) throw new Error("unproved_fixture");
        sample.accountVerified = true;
        sample.before = await readLivePerformanceIdentity(page);
        if (!sample.before || sample.before.commit !== sample.expectedSha)
          throw new Error("unproved_deployment");
        const started = performance.now();
        if (operation === "browser-preferences") {
          stage = "start-screen-reload";
          await page.getByTestId("start-screen-option-timeline").check();
          await page.getByTestId("start-screen-save").click();
          await expect(page.getByTestId("start-screen-saved")).toHaveText(
            "Start screen preference saved.",
          );
          await proof.waitForAccount();
          await page.reload();
          await expect(page.getByTestId("start-screen-option-timeline")).toBeChecked();
          await proof.waitForAccount();
          sample.checks["start-screen-reload"] = true;
          stage = "temperature-reload";
          await page.getByTestId("temperature-unit-option-celsius").check();
          await page.getByTestId("temperature-unit-save").click();
          await expect(page.getByTestId("temperature-unit-saved")).toHaveText(
            "Display temperature preference saved.",
          );
          await proof.waitForAccount();
          await page.reload();
          await expect(page.getByTestId("temperature-unit-option-celsius")).toBeChecked();
          await proof.waitForAccount();
          sample.checks["temperature-reload"] = true;
          stage = "temperature-reset-reload";
          await page.getByTestId("temperature-unit-reset").click();
          await expect(page.getByTestId("temperature-unit-saved")).toHaveText(
            "Reverted to Fahrenheit default.",
          );
          await proof.waitForAccount();
          await page.reload();
          await expect(page.getByTestId("temperature-unit-option-fahrenheit")).toBeChecked();
          sample.checks["temperature-reset-reload"] = true;
        } else if (operation === "account-readback") {
          stage = "own-account-reads";
          const profileRead = page.waitForResponse(
            (response) =>
              isOwnSettingsRead(response.request().method(), response.url(), owner, "profiles"),
            { timeout: 20_000 },
          );
          const agreementRead = page.waitForResponse(
            (response) =>
              isOwnSettingsRead(
                response.request().method(),
                response.url(),
                owner,
                "user_agreement_acceptances",
              ),
            { timeout: 20_000 },
          );
          await page.goto(PERFORMANCE_ORIGIN + "/account/preferences");
          const [profile, agreements] = await Promise.all([profileRead, agreementRead]);
          const marketingPreference = readMarketingPreference(
            await profile.json(),
            profile.status(),
          );
          if (marketingPreference === null) throw new Error("profile_unproved");
          sample.checks["own-profile-read"] = true;
          if (!hasCurrentSettingsAgreements(await agreements.json(), agreements.status()))
            throw new Error("agreement_read_unproved");
          sample.checks["current-agreements-read"] = true;
          stage = "account-ui-readback";
          const toggle = page.getByRole("switch", { name: "Marketing opt-in toggle" });
          await expect(toggle).toBeEnabled();
          await expect(toggle).toHaveAttribute("aria-checked", String(marketingPreference));
          sample.checks["marketing-ui-matches"] = true;
          await expect(page.getByText("Up to date", { exact: true })).toHaveCount(
            CURRENT_AGREEMENT_LIST.length,
          );
          for (const agreement of CURRENT_AGREEMENT_LIST) {
            const matchingCopies = CURRENT_AGREEMENT_LIST.filter(
              (item) =>
                item.version === agreement.version &&
                item.effectiveDate === agreement.effectiveDate,
            ).length;
            await expect(
              page.getByText(
                `Current version ${agreement.version} · effective ${agreement.effectiveDate}`,
                { exact: true },
              ),
            ).toHaveCount(matchingCopies);
          }
          await expect(
            page.getByRole("button", { name: "Accept current versions", exact: true }),
          ).toHaveCount(0);
          await expect(page.getByRole("alert")).toHaveCount(0);
          sample.checks["current-agreements-ui"] = true;
        } else {
          stage = "initial-analytics-unset";
          await expect(page.getByTestId("analytics-consent-banner")).toBeVisible();
          sample.checks["initial-unset"] = true;
          stage = "decline-stored";
          await page.getByTestId("analytics-consent-decline").click();
          await expect(page.getByTestId("analytics-consent-banner")).toHaveCount(0);
          expect(
            await page.evaluate((key) => localStorage.getItem(key), ANALYTICS_CONSENT_STORAGE_KEY),
          ).toBe("denied");
          sample.checks["decline-stored"] = true;
          stage = "refusal-reload";
          await proof.waitForAccount();
          await page.goto(PERFORMANCE_ORIGIN + "/settings/analytics");
          await expect(page.getByTestId("analytics-consent-status")).toHaveText("Analytics off");
          await proof.waitForAccount();
          await page.reload();
          await expect(page.getByTestId("analytics-consent-status")).toHaveText("Analytics off");
          await expect(page.getByTestId("analytics-consent-settings-revoke")).toBeDisabled();
          await expect(page.getByTestId("analytics-consent-settings-grant")).toBeEnabled();
          await expect(page.getByTestId("analytics-consent-banner")).toHaveCount(0);
          expect(
            await page.evaluate((key) => localStorage.getItem(key), ANALYTICS_CONSENT_STORAGE_KEY),
          ).toBe("denied");
          sample.checks["refusal-reload"] = true;
          sample.checks["no-analytics-requests"] = analyticsRequests === 0;
        }
        // A ready UI can precede the normal auth/role reads. Settle those before
        // metadata reads and teardown, while retaining the final post-close fence.
        await proof.waitForAccount();
        sample.elapsedMs = performance.now() - started;
        sample.after = await readLivePerformanceIdentity(page);
        await proof.waitForAccount();
      } catch {
        failed = true;
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
        if (operation === "analytics-refusal")
          sample.checks["no-analytics-requests"] = analyticsRequests === 0;
        receipt = buildSettingsProofReceipt(sample);
        const receiptPath = testInfo.outputPath(operation + "-settings-proof.json");
        mkdirSync(dirname(receiptPath), { recursive: true });
        writeFileSync(
          receiptPath,
          JSON.stringify(
            {
              ...receipt,
              stage,
              blockedWrites: sample.blockedWrites,
              applicationErrors: sample.applicationErrors,
              blockedRequests: proof.blockedRequests(),
              allowedRoleReads: proof.allowedRoleReads(),
              allowedPhotoReads: proof.allowedPhotoReads(),
              analyticsRequests,
            },
            null,
            2,
          ),
        );
        await testInfo.attach(operation + "-settings-proof", {
          path: receiptPath,
          contentType: "application/json",
        });
        proof.dispose();
      }
      if (failed || receipt.status !== "PASS")
        throw new Error(`settings_proof_${receipt.status}:${receipt.reason}:${stage}`);
    });
  }
});
