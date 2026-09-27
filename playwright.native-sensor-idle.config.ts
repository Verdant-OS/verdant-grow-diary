import { defineConfig } from "@playwright/test";
import native from "./playwright.native-local.config";

// Inherit the exact loopback/auth boundary, zero retries and one worker.
export default defineConfig({
  ...native,
  testMatch: ["native-sensor-idle-aging.spec.ts"],
});
