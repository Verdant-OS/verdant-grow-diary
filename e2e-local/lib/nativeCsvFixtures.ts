import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import {
  createLocalFixture,
  localEnvironment,
  signIn,
  type LocalFixture,
} from "./nativeLocalFixtures";

export interface CsvFixture extends LocalFixture {
  /** Canonical subscription setup only in the explicitly fenced disposable stack. */
  setHistoryAccess: (
    environment: "sandbox" | "live" | null,
    target?: "owner" | "other",
  ) => Promise<void>;
}

/** Extend the shared fixture without changing the other native acceptance lanes. */
export async function createCsvFixture(): Promise<CsvFixture> {
  const env = localEnvironment();
  const admin = createClient(env.api, env.service, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        localEnvironment();
        const request = new Request(input, init);
        if (new URL(request.url).origin !== env.api) {
          throw new Error("Blocked non-local CSV fixture request.");
        }
        return fetch(request, { redirect: "error" });
      },
    },
  });
  const fixture = await createLocalFixture();
  const subscriptionId = "native-local-history-" + randomUUID();
  const removeHistoryAccess = async (target: "owner" | "other") => {
    localEnvironment();
    const account = fixture[target];
    const { error } = await admin
      .from("subscriptions")
      .delete()
      .eq("user_id", account.id)
      .eq("paddle_subscription_id", subscriptionId + "-" + account.id);
    if (error) throw new Error("Local CSV history subscription cleanup failed.");
  };
  return {
    ...fixture,
    setHistoryAccess: async (environment, target = "owner") => {
      await removeHistoryAccess(target);
      if (environment === null) return;
      const account = fixture[target];
      const { error } = await admin.from("subscriptions").insert({
        user_id: account.id,
        paddle_subscription_id: subscriptionId + "-" + account.id,
        paddle_customer_id: "native-local-customer-" + account.id,
        product_id: "native-local-pro",
        price_id: "pro_annual",
        status: "active",
        environment,
        current_period_end: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      if (error) throw new Error("Local CSV history subscription setup failed.");
    },
    cleanup: async () => {
      // Remove only this extension's two subscription identities, then always
      // run the shared data/user cleanup even if subscription removal failed.
      let failed = false;
      for (const target of ["owner", "other"] as const) {
        try {
          await removeHistoryAccess(target);
        } catch {
          failed = true;
        }
      }
      try {
        await fixture.cleanup();
      } catch {
        failed = true;
      }
      if (failed) throw new Error("Local CSV fixture cleanup failed.");
    },
  };
}

/** Real per-tab UI authentication; already-accepted agreements remain server-owned. */
export async function signInCsvFixture(
  page: Page,
  fixture: LocalFixture,
  acceptNewAgreements = true,
): Promise<void> {
  if (acceptNewAgreements) return signIn(page, fixture);
  localEnvironment();
  try {
    await page.goto(fixture.env.ui + "/auth");
    await page.locator("#signin-email").fill(fixture.owner.email);
    await page.locator("#signin-password").fill(fixture.owner.password);
    await page
      .getByRole("button", { name: /sign in|log in|continue/i })
      .first()
      .click();
    await page.waitForURL((url) => url.origin === fixture.env.ui && url.pathname !== "/auth");
    await page.goto(fixture.env.ui + "/plants/" + fixture.primary.plantId);
    await page.getByTestId("agreement-reconsent-gate").waitFor({ state: "hidden" });
    await page.getByTestId("header-quick-log-trigger").waitFor({ state: "visible" });
  } catch {
    // A Playwright fill error can include its value. Never propagate credentials.
    throw new Error("Real local CSV sign-in did not reach the authenticated application.");
  }
}
