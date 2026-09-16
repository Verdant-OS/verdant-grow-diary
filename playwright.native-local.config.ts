import { defineConfig, devices } from "@playwright/test";

// This opt-in lane creates disposable users and data only in the CI replay stack.
// Keep it outside ./e2e so hosted and mocked projects cannot discover these writes.
const uiUrl = "http://127.0.0.1:5173";
const apiUrl = "http://127.0.0.1:54321";
if (
  process.env.NATIVE_LOCAL_BROWSER !== "1" ||
  process.env.NATIVE_LOCAL_UI_URL !== uiUrl ||
  process.env.SUPABASE_URL !== apiUrl ||
  process.env.VITE_SUPABASE_URL !== apiUrl ||
  !process.env.SUPABASE_ANON_KEY ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY ||
  !process.env.NATIVE_LOCAL_FIXTURE_PASSWORD ||
  process.env.SUPABASE_SERVICE_ROLE_KEY === process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY !== process.env.SUPABASE_ANON_KEY
) {
  throw new Error(
    "Native browser proof requires the explicit disposable local stack and public-key mapping.",
  );
}

export default defineConfig({
  testDir: "./e2e-local",
  testMatch: "native-save-retrieve.spec.ts",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [
    ["list"],
    ["json", { outputFile: "native-local-results/report.json" }],
  ],
  outputDir: "native-local-results/browser",
  use: {
    baseURL: uiUrl,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // Even temporary real sessions must never appear in downloadable traces.
    trace: "off",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
  webServer: {
    command: "bunx vite --host 127.0.0.1 --port 5173 --strictPort",
    url: uiUrl,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: apiUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_ANON_KEY,
      // The runner retains admin setup credentials; the app server does not.
      SUPABASE_SERVICE_ROLE_KEY: "",
      SUPABASE_ANON_KEY: "",
      SUPABASE_DB_URL: "",
      SUPABASE_JWT_SECRET: "",
      NATIVE_LOCAL_FIXTURE_PASSWORD: "",
    },
  },
  projects: [
    {
      name: "chromium-native-local",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
