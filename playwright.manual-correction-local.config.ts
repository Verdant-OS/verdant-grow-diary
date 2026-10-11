import { defineConfig } from "@playwright/test";
import nativeLocal from "./playwright.native-local.config";

// Inherit the exact disposable-stack guard, one worker, zero retries and secret
// separation. Keep this proposed lane independent of the locked native harness.
export default defineConfig(nativeLocal, {
  testMatch: ["native-manual-correction-recovery.spec.ts"],
  reporter: [["list"], ["json", { outputFile: "manual-correction-local-results/report.json" }]],
  outputDir: "manual-correction-local-results/browser",
});
