/**
 * Runtime harness for the sign-in email hook: executes the real
 * supabase/functions/auth-email-hook/index.ts entry point with the external
 * libraries substituted (see src/test/helpers/authEmailHookHarness.ts) and
 * asserts what it sends, what it audits and how it answers.
 */
import { describe, expect, it } from "vitest";
import {
  FIXTURE_LOVABLE_VALUE,
  FixtureEmailAPIError,
  authEmailHookHarness,
  authHookPayload,
} from "./helpers/authEmailHookHarness";

const SUBJECTS: Record<string, string> = {
  signup: "Confirm your email",
  invite: "You've been invited",
  magiclink: "Your login link",
  recovery: "Reset your password",
  email_change: "Confirm your new email",
  reauthentication: "Your verification code",
};

describe("auth-email-hook runtime: successful send", () => {
  it("sends one signup email directly from Verdant's domain and audits it as sent", async () => {
    const hook = authEmailHookHarness();
    const result = await hook.deliver(authHookPayload("signup"));

    expect(result).toEqual({ code: 200, body: { success: true } });
    expect(hook.sends).toHaveLength(1);
    const { message, options } = hook.sends[0];
    expect(message).toMatchObject({
      run_id: "run_fixture_1",
      to: "grower@example.invalid",
      from: "verdantgrowdiary-com <noreply@verdantgrowdiary.com>",
      sender_domain: "notify.verdantgrowdiary.com",
      subject: "Confirm your email",
      html: "<p>fixture html</p>",
      text: "fixture text",
      purpose: "transactional",
      label: "signup",
      idempotency_key: "run_fixture_1",
    });
    expect(typeof message.message_id).toBe("string");
    expect(options).toEqual({ apiKey: FIXTURE_LOVABLE_VALUE, sendUrl: undefined });

    expect(hook.auditRows).toEqual([
      {
        table: "email_send_log",
        row: {
          message_id: message.message_id,
          template_name: "signup",
          recipient_email: "grower@example.invalid",
          status: "sent",
          error_message: null,
        },
      },
    ]);
    expect(hook.rpcCalls).toEqual([]);
  });

  it("passes the confirmation link and recipient into the rendered template", async () => {
    const hook = authEmailHookHarness();
    await hook.deliver(authHookPayload("signup"));

    expect(hook.renders.map((r) => [r.template, r.plainText])).toEqual([
      ["SignupEmail", false],
      ["SignupEmail", true],
    ]);
    expect(hook.renders[0].props).toMatchObject({
      siteUrl: "https://verdantgrowdiary.com",
      recipient: "grower@example.invalid",
      confirmationUrl: "https://verdantgrowdiary.com/auth/confirm?fixture=1",
    });
  });

  it.each(Object.entries(SUBJECTS))("sends %s with its own subject", async (type, subject) => {
    const hook = authEmailHookHarness();
    const result = await hook.deliver(authHookPayload(type));

    expect(result.code).toBe(200);
    expect(hook.sends.map((s) => [s.message.label, s.message.subject])).toEqual([[type, subject]]);
    expect(hook.auditRows.map((a) => a.row.status)).toEqual(["sent"]);
  });
});

describe("auth-email-hook runtime: failed send", () => {
  it("audits a suppressed recipient as suppressed and answers 500", async () => {
    const hook = authEmailHookHarness();
    hook.failSendWith(new FixtureEmailAPIError("recipient_suppressed", "Recipient is suppressed"));
    const result = await hook.deliver(authHookPayload("magiclink"));

    expect(result).toEqual({ code: 500, body: { error: "Email send failed" } });
    expect(hook.sends).toHaveLength(1);
    expect(hook.auditRows.map((a) => [a.row.status, a.row.error_message])).toEqual([
      ["suppressed", "Recipient is suppressed"],
    ]);
  });

  it("audits any other send error as failed, with its message, and answers 500", async () => {
    const hook = authEmailHookHarness();
    hook.failSendWith(new Error("provider unavailable"));
    const result = await hook.deliver(authHookPayload("recovery"));

    expect(result).toEqual({ code: 500, body: { error: "Email send failed" } });
    expect(hook.auditRows.map((a) => [a.row.status, a.row.error_message])).toEqual([
      ["failed", "provider unavailable"],
    ]);
    expect(hook.rpcCalls).toEqual([]);
  });

  it("caps a long error message at 1000 characters in the audit row", async () => {
    const hook = authEmailHookHarness();
    hook.failSendWith(new Error("x".repeat(5000)));
    await hook.deliver(authHookPayload("signup"));

    expect(String(hook.auditRows[0].row.error_message)).toHaveLength(1000);
  });
});

describe("auth-email-hook runtime: rejected requests send nothing", () => {
  it("rejects an unsigned request with 401", async () => {
    const hook = authEmailHookHarness();
    const result = await hook.deliver(authHookPayload("signup"), { signed: false });

    expect(result).toEqual({ code: 401, body: { error: "Invalid signature" } });
    expect(hook.sends).toEqual([]);
    expect(hook.auditRows).toEqual([]);
  });

  it("answers 500 without sending when the Lovable env var is missing", async () => {
    const hook = authEmailHookHarness();
    hook.clearLovableEnv();
    const result = await hook.deliver(authHookPayload("signup"));

    expect(result).toEqual({ code: 500, body: { error: "Server configuration error" } });
    expect(hook.sends).toEqual([]);
  });

  it("rejects an unknown email type with 400", async () => {
    const hook = authEmailHookHarness();
    const result = await hook.deliver(authHookPayload("not_a_type"));

    expect(result).toEqual({ code: 400, body: { error: "Unknown email type: not_a_type" } });
    expect(hook.sends).toEqual([]);
    expect(hook.auditRows).toEqual([]);
  });

  it("rejects a payload with no run_id or an unsupported version with 400", async () => {
    const hook = authEmailHookHarness();
    const noRun = await hook.deliver({ ...authHookPayload("signup"), run_id: "" });
    const badVersion = await hook.deliver({ ...authHookPayload("signup"), version: "2" });

    expect(noRun.code).toBe(400);
    expect(badVersion).toEqual({ code: 400, body: { error: "Unsupported payload version: 2" } });
    expect(hook.sends).toEqual([]);
  });
});
