// Local Supabase only. A direct PostgREST call with the kill switch at its
// default (enabled = false) must create no badge_awards row.
// Never point E2E_LOCAL_SUPABASE_URL at https://verdantgrowdiary.com.
import { test, expect } from "@playwright/test";

const LOCAL_URL = process.env.E2E_LOCAL_SUPABASE_URL?.trim() ?? "";
const ANON_KEY = process.env.E2E_LOCAL_SUPABASE_ANON_KEY?.trim() ?? "";

function assertLoopback(url: string) {
  const host = new URL(url).hostname.toLowerCase();
  if (host === "verdantgrowdiary.com" || host.endsWith(".verdantgrowdiary.com")) {
    throw new Error("refusing production host");
  }
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error(`refusing non-loopback supabase host ${host}`);
  }
}

test("direct evaluate with the switch off creates no award row", async ({ request }) => {
  test.skip(!LOCAL_URL || !ANON_KEY, "E2E_LOCAL_SUPABASE_URL or anon key is unset");
  assertLoopback(LOCAL_URL);

  const email = `badge-kill-${Date.now()}@example.invalid`;
  const signupSecret = ["local", "kill", "switch", Date.now().toString(36)].join("-");
  const signup = await request.post(`${LOCAL_URL}/auth/v1/signup`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
    data: { email, password: signupSecret },
  });
  if (!signup.ok()) {
    test.skip(true, `local signup unavailable (${signup.status()})`);
  }
  const session = (await signup.json()) as { access_token?: string };
  if (!session.access_token) {
    test.skip(true, "local signup did not return an access token");
  }

  const rpc = await request.post(`${LOCAL_URL}/rest/v1/rpc/badge_awards_evaluate_owner`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    data: { badge_key: "first_diary_entry" },
  });
  expect(rpc.ok(), await rpc.text()).toBe(true);
  const evaluation = (await rpc.json()) as { status?: string };
  expect(evaluation.status).toBe("disabled");

  const rows = await request.get(`${LOCAL_URL}/rest/v1/badge_awards?select=id`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  expect(rows.ok(), await rows.text()).toBe(true);
  expect(await rows.json()).toEqual([]);
});
