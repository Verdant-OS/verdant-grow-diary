/**
 * GoTrue's native Send Email hook against the real auth-email-hook entry.
 *
 * The Lovable runtime harness is scorer-locked and stubs signature checks.
 * This file loads the same entry in its own vm so the Standard Webhooks
 * HMAC, timestamp window and { user, email_data } parser run as written.
 * No server, secret store, mailbox or database is used. Fixture values are
 * not credentials.
 */
import { createHmac, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const HOOK = resolve(__dirname, "../../supabase/functions/auth-email-hook/index.ts");
const FIXTURE_KEY = Buffer.from("fixture-send-email-hook-key");
const FIXTURE_SECRET = `v1,whsec_${FIXTURE_KEY.toString("base64")}`;
const FIXTURE_LOVABLE = "fixture-lovable-value";
const OTP = "otp-fixture-do-not-log";
const TOKEN_HASH = "hashfixture123";

type Row = Record<string, unknown>;

function sign(id: string, timestamp: string, rawBody: string): string {
  const mac = createHmac("sha256", FIXTURE_KEY)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  return `v1,${mac}`;
}

function nativeBody(action: string): Row {
  return {
    user: { id: "user_fixture", email: "grower@example.invalid" },
    email_data: {
      email_action_type: action,
      token: OTP,
      token_hash: TOKEN_HASH,
      redirect_to: "https://verdantgrowdiary.com/reset",
      site_url: "https://fixture.supabase.co",
      token_new: "",
      token_hash_new: "",
    },
  };
}

function confirmationUrl(action: string, tokenHash = TOKEN_HASH): string {
  const params = new URLSearchParams({
    token: tokenHash,
    type: action,
    redirect_to: "https://verdantgrowdiary.com/reset",
  });
  return `https://fixture.supabase.co/auth/v1/verify?${params.toString()}`;
}

function nativeHook() {
  const env = new Map<string, string>([
    ["LOVABLE_API_KEY", FIXTURE_LOVABLE],
    ["SEND_EMAIL_HOOK_SECRET", FIXTURE_SECRET],
  ]);
  const sends: Array<{ message: Row; options: Row }> = [];
  const auditRows: Array<{ table: string; row: Row }> = [];
  const renders: Array<{ template: string; props: Row }> = [];
  const logs: string[] = [];
  const record = (...args: unknown[]) => {
    logs.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };
  const client = {
    from(table: string) {
      return {
        async insert(row: Row) {
          auditRows.push({ table, row: structuredClone(row) });
          return { error: null };
        },
      };
    },
  };
  let handler!: (request: Request) => Promise<Response>;
  const context = createContext({
    Request,
    Response,
    URL,
    URLSearchParams,
    TextEncoder,
    Uint8Array,
    Date,
    crypto: webcrypto,
    structuredClone,
    Error,
    console: { log: record, error: record, warn: record },
    Deno: {
      env: {
        get: (key: string) =>
          env.get(key) ?? (key.startsWith("SUPABASE_") ? "https://fixture.invalid" : undefined),
      },
      serve: (fn: typeof handler) => {
        handler = fn;
      },
    },
  });
  const modules = new Map<string, { exports: Row }>();
  const load = (file: string): Row => {
    const cached = modules.get(file);
    if (cached) return cached.exports;
    const mod = { exports: {} as Row };
    modules.set(file, mod);
    const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React,
      },
      fileName: file,
    });
    const requireFixture = (name: string): unknown => {
      if (name === "npm:react@18.3.1")
        return { createElement: (type: unknown, props: Row | null) => ({ type, props }) };
      if (name.startsWith("npm:@react-email/components")) {
        const stub = {
          renderAsync: async (
            element: { type: { name?: string }; props: Row },
            options?: { plainText?: boolean },
          ) => {
            renders.push({ template: element.type?.name ?? "", props: element.props });
            return options?.plainText === true ? "fixture text" : "<p>fixture html</p>";
          },
        };
        return new Proxy(stub, {
          get: (target, key: string) => target[key as keyof typeof target] ?? (() => null),
        });
      }
      if (name.startsWith("npm:@lovable.dev/email-js")) {
        return {
          parseEmailWebhookPayload: (raw: unknown) => raw,
          EmailAPIError: class EmailAPIError extends Error {},
          sendLovableEmail: async (message: Row, options: Row) => {
            sends.push({ message: structuredClone(message), options: structuredClone(options) });
            return { id: "fixture-send" };
          },
        };
      }
      if (name.startsWith("npm:@lovable.dev/webhooks-js")) {
        return {
          WebhookError: class WebhookError extends Error {},
          verifyWebhookRequest: async () => ({ payload: {} }),
        };
      }
      if (name === "npm:@supabase/supabase-js@2") return { createClient: () => client };
      if (!name.startsWith(".")) throw new Error(`Unexpected external import: ${name}`);
      return load(resolve(dirname(file), name));
    };
    runInContext(`(function(require, module, exports) {${outputText}\n})`, context, {
      filename: file,
    })(requireFixture, mod, mod.exports);
    return mod.exports;
  };
  load(HOOK);

  async function post(rawBody: string, headers: Record<string, string>) {
    const response = await handler(
      new Request("https://fixture.invalid/auth-email-hook", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: rawBody,
      }),
    );
    const text = await response.text();
    return { code: response.status, body: text.startsWith("{") ? JSON.parse(text) : text };
  }

  function signed(
    rawBody: string,
    timestamp = String(Math.floor(Date.now() / 1000)),
    id = "msg_fixture",
  ) {
    return post(rawBody, {
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": sign(id, timestamp, rawBody),
    });
  }

  return {
    post,
    signed,
    sends,
    auditRows,
    renders,
    logs,
    clearHookSecret: () => env.delete("SEND_EMAIL_HOOK_SECRET"),
  };
}

describe("auth-email-hook native Send Email hook", () => {
  it.each(["recovery", "signup"])(
    "accepts a valid signature for %s, sends, and audits",
    async (action) => {
      const hook = nativeHook();
      const raw = JSON.stringify(nativeBody(action));
      const result = await hook.signed(raw, String(Math.floor(Date.now() / 1000)), `msg_${action}`);

      expect(result).toEqual({ code: 200, body: {} });
      expect(hook.sends).toHaveLength(1);
      expect(hook.sends[0].message).toMatchObject({
        to: "grower@example.invalid",
        from: "verdantgrowdiary-com <noreply@verdantgrowdiary.com>",
        sender_domain: "notify.verdantgrowdiary.com",
        label: action,
        idempotency_key: `msg_${action}`,
        purpose: "transactional",
      });
      expect(hook.sends[0].options).toMatchObject({ apiKey: FIXTURE_LOVABLE });
      expect(hook.auditRows).toEqual([
        {
          table: "email_send_log",
          row: {
            message_id: hook.sends[0].message.message_id,
            template_name: action,
            recipient_email: "grower@example.invalid",
            status: "sent",
            error_message: null,
          },
        },
      ]);
      expect(hook.renders[0].props.confirmationUrl).toBe(confirmationUrl(action));
    },
  );

  it("rejects a bad signature with 401 and sends nothing", async () => {
    const hook = nativeHook();
    const raw = JSON.stringify(nativeBody("recovery"));
    const result = await hook.post(raw, {
      "webhook-id": "msg_bad",
      "webhook-timestamp": String(Math.floor(Date.now() / 1000)),
      "webhook-signature": "v1,aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    expect(result).toEqual({
      code: 401,
      body: { error: { http_code: 401, message: "Invalid signature" } },
    });
    expect(hook.sends).toEqual([]);
    expect(hook.auditRows).toEqual([]);
  });

  it("rejects missing Standard Webhooks headers with 401", async () => {
    const hook = nativeHook();
    const result = await hook.post(JSON.stringify(nativeBody("signup")), {
      "webhook-id": "msg_missing",
    });

    expect(result).toEqual({
      code: 401,
      body: { error: { http_code: 401, message: "Invalid signature" } },
    });
    expect(hook.sends).toEqual([]);
    expect(hook.auditRows).toEqual([]);
  });

  it("rejects a future timestamp, a non-numeric timestamp, and a missing hook secret", async () => {
    const hook = nativeHook();
    const raw = JSON.stringify(nativeBody("recovery"));
    const future = String(Math.floor(Date.now() / 1000) + 10 * 60);
    const futureResult = await hook.signed(raw, future, "msg_future");
    expect(futureResult).toEqual({
      code: 401,
      body: { error: { http_code: 401, message: "Stale timestamp" } },
    });

    const nonNumeric = await hook.signed(raw, "not-a-timestamp", "msg_nan");
    expect(nonNumeric).toEqual({
      code: 401,
      body: { error: { http_code: 401, message: "Invalid signature" } },
    });

    hook.clearHookSecret();
    const missingSecret = await hook.signed(
      raw,
      String(Math.floor(Date.now() / 1000)),
      "msg_nosecret",
    );
    expect(missingSecret).toEqual({
      code: 401,
      body: { error: { http_code: 401, message: "Invalid signature" } },
    });
    expect(hook.sends).toEqual([]);
    expect(hook.logs.join("\n")).not.toContain(FIXTURE_SECRET);
  });

  it("rejects a stale timestamp", async () => {
    const hook = nativeHook();
    const raw = JSON.stringify(nativeBody("recovery"));
    const stale = String(Math.floor(Date.now() / 1000) - 10 * 60);
    const result = await hook.signed(raw, stale, "msg_stale");

    expect(result).toEqual({
      code: 401,
      body: { error: { http_code: 401, message: "Stale timestamp" } },
    });
    expect(hook.sends).toEqual([]);
    expect(hook.auditRows).toEqual([]);
  });

  it("rejects a malformed payload with 400", async () => {
    const hook = nativeHook();
    const raw = "{";
    const result = await hook.signed(raw, String(Math.floor(Date.now() / 1000)), "msg_bad_json");

    expect(result).toEqual({
      code: 400,
      body: { error: { http_code: 400, message: "Invalid webhook payload" } },
    });
    expect(hook.sends).toEqual([]);
    expect(hook.auditRows).toEqual([]);
  });

  it("sends an email-change link for the new address, and the current address only when token_hash_new is set", async () => {
    const hook = nativeHook();
    const secure = JSON.stringify({
      user: {
        id: "user_fixture",
        email: "current@example.invalid",
        new_email: "next@example.invalid",
      },
      email_data: {
        email_action_type: "email_change",
        token: "otp-current-do-not-log",
        token_new: "otp-new-do-not-log",
        token_hash: "hash-for-new-address",
        token_hash_new: "hash-for-current-address",
        redirect_to: "https://verdantgrowdiary.com/reset",
        site_url: "https://fixture.supabase.co",
      },
    });
    const secureResult = await hook.signed(
      secure,
      String(Math.floor(Date.now() / 1000)),
      "msg_change",
    );

    expect(secureResult).toEqual({ code: 200, body: {} });
    expect(hook.sends.map((send) => [send.message.to, send.message.idempotency_key])).toEqual([
      ["next@example.invalid", "msg_change:new"],
      ["current@example.invalid", "msg_change:current"],
    ]);
    expect(hook.renders.map((render) => [render.props.recipient, render.props.token])).toEqual([
      ["next@example.invalid", "otp-new-do-not-log"],
      ["next@example.invalid", "otp-new-do-not-log"],
      ["current@example.invalid", "otp-current-do-not-log"],
      ["current@example.invalid", "otp-current-do-not-log"],
    ]);
    expect(hook.renders.map((render) => render.props.confirmationUrl)).toEqual([
      confirmationUrl("email_change", "hash-for-new-address"),
      confirmationUrl("email_change", "hash-for-new-address"),
      confirmationUrl("email_change", "hash-for-current-address"),
      confirmationUrl("email_change", "hash-for-current-address"),
    ]);
    expect(
      hook.auditRows.map((row) => [row.row.recipient_email, row.row.template_name, row.row.status]),
    ).toEqual([
      ["next@example.invalid", "email_change", "sent"],
      ["current@example.invalid", "email_change", "sent"],
    ]);
    const logged = hook.logs.join("\n");
    expect(logged).not.toContain("hash-for-new-address");
    expect(logged).not.toContain("hash-for-current-address");
    expect(logged).not.toContain("otp-new-do-not-log");
    expect(logged).not.toContain("otp-current-do-not-log");

    const insecureHook = nativeHook();
    const insecure = JSON.stringify({
      user: {
        id: "user_fixture",
        email: "current@example.invalid",
        new_email: "next@example.invalid",
      },
      email_data: {
        email_action_type: "email_change",
        token: "otp-new-do-not-log",
        token_hash: "hash-for-new-address",
        token_hash_new: "",
        redirect_to: "https://verdantgrowdiary.com/reset",
        site_url: "https://fixture.supabase.co",
      },
    });
    const insecureResult = await insecureHook.signed(
      insecure,
      String(Math.floor(Date.now() / 1000)),
      "msg_change_one",
    );

    expect(insecureResult.code).toBe(200);
    expect(insecureHook.sends.map((send) => send.message.to)).toEqual(["next@example.invalid"]);
    expect(insecureHook.renders[0].props.token).toBe("otp-new-do-not-log");
    expect(String(insecureHook.renders[0].props.confirmationUrl)).toContain("hash-for-new-address");
    expect(String(insecureHook.renders[0].props.confirmationUrl)).not.toContain(
      "hash-for-current-address",
    );
  });

  it("does not write the secret, token, token hash, or rendered body to logs", async () => {
    const hook = nativeHook();
    const raw = JSON.stringify(nativeBody("recovery"));
    await hook.signed(raw, String(Math.floor(Date.now() / 1000)), "msg_logs");

    const written = hook.logs.join("\n");
    expect(written).not.toContain(FIXTURE_SECRET);
    expect(written).not.toContain(FIXTURE_KEY.toString("base64"));
    expect(written).not.toContain(OTP);
    expect(written).not.toContain(TOKEN_HASH);
    expect(written).not.toContain("fixture html");
    expect(written).not.toContain("fixture text");
    expect(hook.sends[0].message.html).toBe("<p>fixture html</p>");
  });
});
