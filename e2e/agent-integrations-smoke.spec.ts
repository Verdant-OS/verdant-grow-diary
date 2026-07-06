// Playwright smoke test for /settings/agent-integrations.
//
// SAFETY:
// - All Supabase /auth/v1/** and /rest/v1/** traffic is intercepted via
//   page.route(). No real Supabase calls, no real OAuth, no service_role.
// - Uses a mocked signed-in user (fake token strings clearly labeled).
// - Asserts no visible token/secret-like strings render.
import { test, expect, type Page } from "@playwright/test";

// supabase-js derives its auth storage key as
// `sb-${hostname.split(".")[0]}-auth-token` and (per this app's hardened
// client) persists it in sessionStorage. Seed a CLEARLY-FAKE local session
// under that key before the app boots so the protected /settings route's
// guard renders the presenter-only page instead of redirecting to /auth.
// No real token — every /auth + /rest request is still intercepted below,
// so getUser() (used by useRequireAuth) resolves against the mock.
//
// NOTE: @supabase/auth-js v2 stores the session object DIRECTLY (validated
// by _isValidSession requiring top-level access_token/refresh_token/
// expires_at). It is NOT wrapped in the legacy `{ currentSession }` shape.
const SB_PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SB_SESSION_KEY = `sb-${SB_PROJECT_REF}-auth-token`;

// Fake, clearly-labeled signed-in user. Carries email_confirmed_at +
// user_metadata.email_verified so AppShell's isEmailVerificationPending
// gate (which fails CLOSED for unverified users, replacing the route
// Outlet with a verification banner) treats this account as verified and
// renders the Agent Integrations page.
const FAKE_USER = {
  id: "test-user-id",
  aud: "authenticated",
  email: "x@example.invalid",
  email_confirmed_at: "2020-01-01T00:00:00.000Z",
  confirmed_at: "2020-01-01T00:00:00.000Z",
  user_metadata: { email_verified: true },
};

async function seedFakeSession(page: Page) {
  await page.addInitScript(
    ({ key, user }) => {
      const fakeSession = {
        access_token: "FAKE-ACCESS-TOKEN-NOT-REAL",
        refresh_token: "FAKE-REFRESH-TOKEN-NOT-REAL",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user,
      };
      try {
        sessionStorage.setItem(key, JSON.stringify(fakeSession));
      } catch {
        /* ignore */
      }
    },
    { key: SB_SESSION_KEY, user: FAKE_USER },
  );
}

async function mockSignedInSupabase(page: Page) {
  await page.route(/\/auth\/v1\//, async (route, req) => {
    const url = req.url();
    if (/\/user/i.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FAKE_USER),
      });
      return;
    }
    if (/\/token/i.test(url) && req.method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "FAKE-NOT-REAL",
          refresh_token: "FAKE-NOT-REAL",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: "test-user-id", aud: "authenticated", email: "x@example.invalid" },
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route(/\/rest\/v1\//, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
}

const SECRET_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "JWT", re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/ },
  { label: "bearer", re: /bearer\s+[A-Za-z0-9._-]{10,}/i },
  { label: "service_role", re: /service_role/i },
  { label: "refresh_token", re: /refresh_token/i },
  { label: "bridge_token", re: /bridge[_-]?token/i },
  { label: "client_secret", re: /client[_-]?secret/i },
  { label: "access_token", re: /access[_-]?token/i },
];

test.describe("Agent Integrations settings smoke (mocked, 1280x800)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await seedFakeSession(page);
    await mockSignedInSupabase(page);
  });

  test("page loads with fingerprint, tools, checklist, and safe verify default", async ({
    page,
  }) => {
    await page.goto("/settings/agent-integrations");

    await expect(page.getByTestId("manifest-identity")).toBeVisible();
    await expect(page.getByTestId("manifest-version")).toBeVisible();
    await expect(page.getByTestId("manifest-fingerprint")).toBeVisible();
    await expect(page.getByTestId("manifest-tool-count")).toContainText("Tools advertised: 3");

    // Exact tool names present.
    for (const name of ["list_grows", "list_recent_diary_entries", "get_latest_sensor_snapshot"]) {
      await expect(page.getByTestId(`mcp-tool-${name}`)).toBeVisible();
    }

    // Tool reference anchor exists.
    const ref = page.locator("#agent-tool-reference");
    await expect(ref).toHaveCount(1);

    // Checklist.
    await expect(page.getByTestId("connect-agent-checklist")).toBeVisible();

    // OAuth consent link points to the consent route.
    const consent = page.getByTestId("open-oauth-consent-link");
    await expect(consent).toHaveAttribute("href", /\/\.lovable\/oauth\/consent$/);
    await expect(consent).toHaveAttribute("rel", /noopener/);
    await expect(consent).toHaveAttribute("aria-label", /OAuth consent/i);

    // Manifest link safe target/rel.
    const manifestLink = page.getByTestId("view-mcp-manifest-link");
    await expect(manifestLink).toHaveAttribute("target", "_blank");
    await expect(manifestLink).toHaveAttribute("rel", /noopener/);

    // Verify tool access section + default not_checked panel.
    await expect(page.getByTestId("verify-tool-access")).toBeVisible();
    const panel = page.getByTestId("verify-tool-access-result");
    await expect(panel).toHaveAttribute("data-status", "not_checked");
    await expect(page.getByTestId("verify-tool-checked")).toContainText("list_grows");

    // After clicking Verify with the default browser harness, we get
    // harness_unavailable — never authorized without a harness.
    await page.getByTestId("verify-tool-access-button").click();
    await expect(panel).toHaveAttribute("data-status", "harness_unavailable");
    await expect(page.getByTestId("verify-next-step")).toContainText(/configured local harness/i);

    // Manifest summary modal opens + shows safe projection.
    await page.getByTestId("open-manifest-summary-modal").click();
    await expect(page.getByTestId("manifest-summary-modal")).toBeVisible();
    await expect(page.getByTestId("manifest-summary-safety-note")).toContainText(
      /does not include tokens/i,
    );
    await page.getByTestId("manifest-summary-close").click();

    // No secret-like strings visible anywhere on the page.
    const bodyText = (await page.locator("body").innerText()).toLowerCase();
    for (const { label, re } of SECRET_PATTERNS) {
      expect(bodyText, `Agent Integrations page leaked ${label}`).not.toMatch(re);
    }
  });
});
