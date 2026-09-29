import { test, expect } from "./lib/authedTest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { installSignedInReadonlyProof } from "./lib/signedInReadonlyProof";
import {
  readLivePerformanceIdentity,
  measureSignedInPerformance,
} from "./lib/signedInPerformanceProbe";
import { ANALYTICS_CONSENT_STORAGE_KEY } from "../src/lib/analyticsConsent";
import {
  buildPerformanceReceipt,
  PERFORMANCE_ORIGIN,
  type PerformanceContext,
} from "./lib/signedInPerformanceRules";

const enabled = process.env.E2E_MEASURE_SIGNED_IN_PERFORMANCE === "true";
test.use({ trace: "off", video: "off", screenshot: "off", serviceWorkers: "block" });

// Uses existing auth setup. This proof verifies only the fixture account, not
// an active owned plant. Quick Log's separate write proof remains unchanged.
// HTTP mutations and WebSockets are blocked; only the proved fixture's existing
// operator role SELECT is permitted through its normal POST transport.
test.describe("signed-in route performance evidence", () => {
  test.describe.configure({ retries: 0 });
  test.skip(
    !enabled,
    "Set E2E_MEASURE_SIGNED_IN_PERFORMANCE=true for the explicit measurement lane.",
  );

  for (const target of [
    {
      operation: "dashboard-ready",
      route: "/dashboard",
      control: "dashboard-daily-grow-check-entry",
    },
    { operation: "timeline-ready", route: "/timeline", control: "timeline-search-input" },
    { operation: "sensors-ready", route: "/sensors", control: "sensors-manual-reading-anchor" },
  ] as const) {
    test(target.operation, async ({ page }, testInfo) => {
      test.skip(
        testInfo.project.name !== "chromium-authed",
        "Requires the normal authenticated fixture.",
      );
      test.setTimeout(45_000);
      const proof = await installSignedInReadonlyProof(page);
      const context: PerformanceContext = {
        operation: target.operation,
        origin: PERFORMANCE_ORIGIN,
        expectedSha: process.env.E2E_EXPECTED_SHA ?? "",
        fixtureVerified: false,
        accountVerified: false,
      };
      let receipt = buildPerformanceReceipt(context);
      await page.addInitScript(
        (key) => localStorage.setItem(key, "denied"),
        ANALYTICS_CONSENT_STORAGE_KEY,
      );
      try {
        await page.goto(PERFORMANCE_ORIGIN + "/dashboard");
        await proof.waitForAccount();
        context.accountVerified = true;
        const result = await measureSignedInPerformance(context, {
          readIdentity: () => readLivePerformanceIdentity(page),
          assertReady: proof.waitForAccount,
          assertComplete: proof.waitForAccount,
          run: async () => {
            await page.goto(PERFORMANCE_ORIGIN + target.route);
            await expect(page).toHaveURL(PERFORMANCE_ORIGIN + target.route);
            const control = page.getByTestId(target.control);
            await expect(control).toBeVisible();
            if (target.operation === "sensors-ready")
              await expect(control.locator("input").first()).toBeEnabled();
            else await expect(control).toBeEnabled();
          },
        });
        receipt = result.receipt;
        expect(result.receipt.status, result.receipt.reason).toBe("PASS");
      } catch {
        if (!context.accountVerified)
          receipt = { ...receipt, reason: "read_only_account_precondition_failed" };
        throw new Error(`performance_proof_${receipt.status}:${receipt.reason}`);
      } finally {
        // End all browser activity before finalizing the receipt: a delayed
        // effect must not write or change accounts just after the last check.
        await page.context().close();
        if (receipt.status === "PASS") {
          try {
            await proof.assertReady();
          } catch {
            receipt = {
              ...receipt,
              status: "BLOCKED",
              reason: "operation_postcondition_failed",
              elapsedMs: null,
            };
          }
        }
        const receiptPath = testInfo.outputPath(target.operation + "-performance.json");
        mkdirSync(dirname(receiptPath), { recursive: true });
        writeFileSync(
          receiptPath,
          JSON.stringify(
            {
              ...receipt,
              blockedWrites: proof.blockedWrites(),
              blockedRequests: proof.blockedRequests(),
              allowedRoleReads: proof.allowedRoleReads(),
            },
            null,
            2,
          ),
        );
        await testInfo.attach(target.operation + "-performance", {
          path: receiptPath,
          contentType: "application/json",
        });
        proof.dispose();
      }
      expect(receipt.status, receipt.reason).toBe("PASS");
    });
  }
});
