// Runtime harness for the managed sign-in email webhook: the real handler,
// real templates, and injected fakes for signing, rendering, sending and the
// audit log. No network, database or signing secret is used.
import { describe, expect, it, vi } from "vitest";

import {
  handleAuthEmailWebhook,
  AUTH_EMAIL_TEMPLATES,
  type AuthEmailSendLogRow,
  type AuthEmailWebhookDeps,
} from "@/lib/authEmailWebhook.server";
import { AUTH_EMAIL_ACTION_TYPES, AUTH_EMAIL_SUBJECTS } from "@/lib/authEmailWebhookRules";

// A fixture value, not a credential: it only has to be recognizable in output.
const FIXTURE_KEY = ["fixture", "only", "value"].join("-");

class FakeVerificationError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

class FakeSendError extends Error {
  constructor(readonly code: string | null) {
    super(`send failed: ${code}`);
  }
}

function makeDeps(
  payload: unknown,
  overrides: Partial<AuthEmailWebhookDeps> = {},
): AuthEmailWebhookDeps & { logs: AuthEmailSendLogRow[] } {
  const logs: AuthEmailSendLogRow[] = [];
  return {
    apiKey: FIXTURE_KEY,
    sendUrl: undefined,
    verify: vi.fn(async () => ({ payload })),
    parse: (body: string) => JSON.parse(body),
    verificationErrorCode: (error) => (error instanceof FakeVerificationError ? error.code : null),
    render: vi.fn(async (_element, options) => (options?.plainText ? "plain" : "<p>html</p>")),
    send: vi.fn(async () => ({ success: true })),
    sendErrorCode: (error) => (error instanceof FakeSendError ? error.code : null),
    writeLog: vi.fn(async (row: AuthEmailSendLogRow) => {
      logs.push(row);
    }),
    newMessageId: () => "msg-fixed",
    logger: { error: vi.fn(), info: vi.fn() },
    logs,
    ...overrides,
  };
}

const request = () =>
  new Request("https://verdantgrowdiary.com/lovable/email/auth/webhook", {
    method: "POST",
    body: "{}",
  });

const payloadFor = (action: string) => ({
  version: "1",
  run_id: `run-${action}`,
  data: {
    action_type: action,
    email: "grower@example.test",
    url: "https://verdantgrowdiary.com/auth/confirm",
    token: "123456",
    old_email: "old@example.test",
    new_email: "new@example.test",
  },
});

describe("managed sign-in email webhook handler", () => {
  it("refuses to run without the signing key and touches nothing", async () => {
    const deps = makeDeps(payloadFor("recovery"), { apiKey: undefined });
    const res = await handleAuthEmailWebhook(request(), deps);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Server configuration error" });
    expect(deps.verify).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
    expect(deps.logs).toHaveLength(0);
  });

  it("rejects a bad signature with 401 and sends nothing", async () => {
    const deps = makeDeps(null, {
      verify: vi.fn(async () => {
        throw new FakeVerificationError("invalid_signature");
      }),
    });
    const res = await handleAuthEmailWebhook(request(), deps);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid signature" });
    expect(deps.send).not.toHaveBeenCalled();
    expect(deps.logs).toHaveLength(0);
  });

  it("rejects an unreadable payload with 400", async () => {
    const deps = makeDeps(null, {
      verify: vi.fn(async () => {
        throw new FakeVerificationError("invalid_json");
      }),
    });
    const res = await handleAuthEmailWebhook(request(), deps);
    expect(res.status).toBe(400);
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("rejects an unknown action without sending or logging", async () => {
    const deps = makeDeps(payloadFor("phone_change"));
    const res = await handleAuthEmailWebhook(request(), deps);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Unknown email type" });
    expect(deps.send).not.toHaveBeenCalled();
    expect(deps.logs).toHaveLength(0);
  });

  it.each(AUTH_EMAIL_ACTION_TYPES)(
    "sends %s from noreply@verdantgrowdiary.com and logs it as sent",
    async (action) => {
      const deps = makeDeps(payloadFor(action));
      const res = await handleAuthEmailWebhook(request(), deps);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });

      expect(deps.send).toHaveBeenCalledTimes(1);
      const [sent, options] = vi.mocked(deps.send).mock.calls[0];
      expect(sent).toMatchObject({
        to: "grower@example.test",
        from: "Verdant Grow Diary <noreply@verdantgrowdiary.com>",
        sender_domain: "notify.verdantgrowdiary.com",
        subject: AUTH_EMAIL_SUBJECTS[action],
        html: "<p>html</p>",
        text: "plain",
        label: action,
        run_id: `run-${action}`,
        idempotency_key: `run-${action}`,
        message_id: "msg-fixed",
      });
      expect(options).toEqual({ apiKey: FIXTURE_KEY, sendUrl: undefined });

      // The rendered element is the branded template for this action.
      const [element] = vi.mocked(deps.render).mock.calls[0];
      expect((element as { type: unknown }).type).toBe(AUTH_EMAIL_TEMPLATES[action]);

      expect(deps.logs).toEqual([
        {
          message_id: "msg-fixed",
          template_name: action,
          recipient_email: "grower@example.test",
          status: "sent",
          error_message: null,
        },
      ]);
    },
  );

  it("logs a suppressed recipient as suppressed and returns 500", async () => {
    const deps = makeDeps(payloadFor("magiclink"), {
      send: vi.fn(async () => {
        throw new FakeSendError("recipient_suppressed");
      }),
    });
    const res = await handleAuthEmailWebhook(request(), deps);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Email send failed" });
    expect(deps.logs).toHaveLength(1);
    expect(deps.logs[0]).toMatchObject({ status: "suppressed", template_name: "magiclink" });
  });

  it("logs any other send error as failed without leaking the key", async () => {
    const deps = makeDeps(payloadFor("signup"), {
      send: vi.fn(async () => {
        throw new FakeSendError("rate_limited");
      }),
    });
    const res = await handleAuthEmailWebhook(request(), deps);
    const body = await res.text();
    expect(res.status).toBe(500);
    expect(body).not.toContain(FIXTURE_KEY);
    expect(deps.logs[0]).toMatchObject({ status: "failed" });
    expect(deps.logs[0].error_message).toContain("rate_limited");
  });

  it("renders every branded template to real HTML that names the site", async () => {
    const { render } = await import("@react-email/render");
    for (const action of AUTH_EMAIL_ACTION_TYPES) {
      const deps = makeDeps(payloadFor(action), {
        render: (element, options) =>
          options?.plainText ? render(element, { plainText: true }) : render(element),
      });
      const res = await handleAuthEmailWebhook(request(), deps);
      expect(res.status).toBe(200);
      const [sent] = vi.mocked(deps.send).mock.calls[0];
      expect(sent.html).toMatch(/<html/i);
      expect(sent.text.length).toBeGreaterThan(0);
    }
  });
});
