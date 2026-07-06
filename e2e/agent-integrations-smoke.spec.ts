// Playwright smoke test for /settings/agent-integrations.
//
// SAFETY:
// - All Supabase /auth/v1/** and /rest/v1/** traffic is intercepted via
//   page.route(). No real Supabase calls, no real OAuth, no service_role.
// - Uses a mocked signed-in user (fake token strings clearly labeled).
// - Asserts no visible token/secret-like strings render.
import { test, expect, type Page } from "@playwright/test";

async function mockSignedInSupabase(page: Page) {
  await page.route(/\/auth\/v1\//, async (route, req) => {
    const url = req.url();
    if (/\/user/i.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "test-user-id",
          aud: "authenticated",
          email: "x@example.invalid",
        }),
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
    await mockSignedInSupabase(page);
  });

  test("page loads with fingerprint, tools, checklist, and safe verify default", async ({ page }) => {
    await page.goto("/settings/agent-integrations");

    await expect(page.getByTestId("manifest-identity")).toBeVisible();
    await expect(page.getByTestId("manifest-version")).toBeVisible();
    await expect(page.getByTestId("manifest-fingerprint")).toBeVisible();
    await expect(page.getByTestId("manifest-tool-count")).toContainText(
      "Tools advertised: 3",
    );

    // Exact tool names present.
    for (const name of [
      "list_grows",
      "list_recent_diary_entries",
      "get_latest_sensor_snapshot",
    ]) {
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
    await expect(page.getByTestId("verify-tool-checked")).toContainText(
      "list_grows",
    );

    // After clicking Verify with the default browser harness, we get
    // harness_unavailable — never authorized without a harness.
    await page.getByTestId("verify-tool-access-button").click();
    await expect(panel).toHaveAttribute("data-status", "harness_unavailable");
    await expect(page.getByTestId("verify-next-step")).toContainText(
      /configured local harness/i,
    );

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
