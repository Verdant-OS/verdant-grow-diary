import { describe, expect, it } from "vitest";

import {
  AUTH_EMAIL_ACTION_TYPES,
  AUTH_EMAIL_FROM,
  AUTH_EMAIL_SENDER_DOMAIN,
  AUTH_EMAIL_SUBJECTS,
  acceptAuthEmailPayload,
  buildAuthEmailSendRequest,
  buildAuthEmailTemplateProps,
  classifySendFailure,
  classifyWebhookVerificationError,
  isAuthEmailActionType,
  truncateErrorMessage,
} from "@/lib/authEmailWebhookRules";

const validPayload = (overrides: Record<string, unknown> = {}) => ({
  version: "1",
  run_id: "run-123",
  data: { action_type: "recovery", email: "grower@example.test", url: "https://x.test/r" },
  ...overrides,
});

describe("auth email webhook rules", () => {
  it("sends from Verdant's own domain through the managed sender", () => {
    expect(AUTH_EMAIL_FROM).toBe("verdantgrowdiary-com <noreply@verdantgrowdiary.com>");
    expect(AUTH_EMAIL_SENDER_DOMAIN).toBe("notify.verdantgrowdiary.com");
  });

  it("covers exactly the six Supabase Auth email actions, each with a subject", () => {
    expect([...AUTH_EMAIL_ACTION_TYPES].sort()).toEqual(
      ["email_change", "invite", "magiclink", "reauthentication", "recovery", "signup"].sort(),
    );
    for (const action of AUTH_EMAIL_ACTION_TYPES) {
      expect(AUTH_EMAIL_SUBJECTS[action]).toMatch(/\S/);
    }
    expect(AUTH_EMAIL_SUBJECTS.recovery).toBe("Reset your password");
  });

  it("recognizes only known action types", () => {
    expect(isAuthEmailActionType("signup")).toBe(true);
    expect(isAuthEmailActionType("phone_change")).toBe(false);
    expect(isAuthEmailActionType(undefined)).toBe(false);
    expect(isAuthEmailActionType(7)).toBe(false);
  });

  it("maps signature and timestamp failures to 401 and anything else to 400", () => {
    for (const code of ["invalid_signature", "missing_timestamp", "invalid_timestamp", "stale_timestamp"]) {
      expect(classifyWebhookVerificationError(code)).toEqual({
        status: 401,
        body: { error: "Invalid signature" },
      });
    }
    for (const code of ["invalid_json", "invalid_payload", "body_too_large", null, undefined]) {
      expect(classifyWebhookVerificationError(code).status).toBe(400);
    }
  });

  it("accepts a well-formed payload", () => {
    expect(acceptAuthEmailPayload(validPayload())).toEqual({
      ok: true,
      runId: "run-123",
      actionType: "recovery",
      recipient: "grower@example.test",
    });
  });

  it("rejects missing run id, wrong version, unknown action and missing recipient", () => {
    const cases: Array<[unknown, number, string]> = [
      [null, 400, "Invalid webhook payload"],
      [validPayload({ run_id: "" }), 400, "Invalid webhook payload"],
      [validPayload({ run_id: undefined }), 400, "Invalid webhook payload"],
      [validPayload({ version: "2" }), 400, "Unsupported payload version"],
      [validPayload({ data: null }), 400, "Invalid webhook payload"],
      [validPayload({ data: { action_type: "phone_change", email: "a@b.test" } }), 400, "Unknown email type"],
      [validPayload({ data: { action_type: "signup", email: "  " } }), 400, "Invalid webhook payload"],
    ];
    for (const [payload, status, error] of cases) {
      const result = acceptAuthEmailPayload(payload as never);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response).toEqual({ status, body: { error } });
      }
    }
  });

  it("never echoes caller-supplied values in a rejection", () => {
    const result = acceptAuthEmailPayload(
      validPayload({ version: "<script>", data: { action_type: "<img>", email: "x@y.test" } }),
    );
    expect(JSON.stringify(result)).not.toContain("<script>");
    const unknown = acceptAuthEmailPayload(
      validPayload({ data: { action_type: "<img>", email: "x@y.test" } }),
    );
    expect(JSON.stringify(unknown)).not.toContain("<img>");
  });

  it("builds template props without passing non-string values through", () => {
    const accepted = acceptAuthEmailPayload(validPayload());
    if (!accepted.ok) throw new Error("expected accepted");
    const props = buildAuthEmailTemplateProps(accepted, {
      url: "https://x.test/r",
      token: 123456,
      old_email: "old@example.test",
      new_email: null,
    });
    expect(props).toEqual({
      siteName: "verdantgrowdiary-com",
      siteUrl: "https://verdantgrowdiary.com",
      recipient: "grower@example.test",
      confirmationUrl: "https://x.test/r",
      token: undefined,
      email: "grower@example.test",
      oldEmail: "old@example.test",
      newEmail: undefined,
    });
  });

  it("builds a send request that is idempotent per webhook run", () => {
    const accepted = acceptAuthEmailPayload(validPayload());
    if (!accepted.ok) throw new Error("expected accepted");
    expect(
      buildAuthEmailSendRequest({ accepted, messageId: "msg-1", html: "<p>h</p>", text: "h" }),
    ).toEqual({
      run_id: "run-123",
      message_id: "msg-1",
      to: "grower@example.test",
      from: "verdantgrowdiary-com <noreply@verdantgrowdiary.com>",
      sender_domain: "notify.verdantgrowdiary.com",
      subject: "Reset your password",
      html: "<p>h</p>",
      text: "h",
      purpose: "transactional",
      label: "recovery",
      idempotency_key: "run-123",
    });
  });

  it("logs a suppressed recipient as suppressed and every other send error as failed", () => {
    expect(classifySendFailure("recipient_suppressed")).toBe("suppressed");
    expect(classifySendFailure("rate_limited")).toBe("failed");
    expect(classifySendFailure(null)).toBe("failed");
  });

  it("caps stored error messages and fills an empty one", () => {
    expect(truncateErrorMessage("x".repeat(5000))).toHaveLength(1000);
    expect(truncateErrorMessage(null)).toBe("Email send failed");
    expect(truncateErrorMessage("")).toBe("Email send failed");
  });
});
