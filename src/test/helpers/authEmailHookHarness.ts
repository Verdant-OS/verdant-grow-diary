/**
 * Runs the real auth-email-hook Edge entry point in a Node vm context.
 *
 * TypeScript only transpiles the Deno source (npm: imports become require()).
 * The loader substitutes external IO and third-party libraries: Lovable's
 * webhook verifier and sender, React Email rendering, and the Supabase client.
 * Everything the hook decides itself (routing, validation, template choice,
 * sender identity, idempotency key, audit status, HTTP response) runs as
 * written. No server, credentials, email delivery or real database is used.
 * Same approach as supabase/functions/payments-webhook/rawWireTestHarness.ts.
 */
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";

export type Row = Record<string, unknown>;

const HOOK = resolve(__dirname, "../../../supabase/functions/auth-email-hook/index.ts");
/** Placeholder value for the hook's Lovable env var. Not a credential. */
export const FIXTURE_LOVABLE_VALUE = "fixture-lovable-value";
const SIGNATURE_HEADER = "x-lovable-signature";

export class FixtureWebhookError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export class FixtureEmailAPIError extends Error {
  constructor(
    public code: string,
    message = code,
  ) {
    super(message);
  }
}

export function authHookPayload(actionType = "signup", overrides: Row = {}): Row {
  return {
    version: "1",
    type: "auth",
    run_id: "run_fixture_1",
    data: {
      action_type: actionType,
      email: "grower@example.invalid",
      url: "https://verdantgrowdiary.com/auth/confirm?fixture=1",
      token: "123456",
      ...overrides,
    },
  };
}

export function authEmailHookHarness() {
  // The Supabase client is substituted, so any SUPABASE_* name the hook reads
  // gets an inert placeholder; the harness never names or reads a real one.
  const env = new Map([["LOVABLE_API_KEY", FIXTURE_LOVABLE_VALUE]]);
  const envGet = (key: string) =>
    env.get(key) ?? (key.startsWith("SUPABASE_") ? "https://fixture.invalid" : undefined);
  const sends: Array<{ message: Row; options: Row }> = [];
  const auditRows: Array<{ table: string; row: Row }> = [];
  const rpcCalls: Array<{ name: string; args: Row }> = [];
  const renders: Array<{ template: string; props: Row; plainText: boolean }> = [];
  let sendFailure: Error | null = null;

  const client = {
    from(table: string) {
      return {
        async insert(row: Row) {
          auditRows.push({ table, row: structuredClone(row) });
          return { error: null };
        },
      };
    },
    async rpc(name: string, args: Row) {
      rpcCalls.push({ name, args: structuredClone(args) });
      return { data: null, error: null };
    },
  };

  const reactStub = {
    createElement: (type: unknown, props: Row | null) => ({ type, props: props ?? {} }),
  };
  const reactEmailStub = new Proxy(
    {
      renderAsync: async (
        element: { type: { name?: string }; props: Row },
        options?: { plainText?: boolean },
      ) => {
        const plainText = options?.plainText === true;
        renders.push({ template: element.type.name ?? "", props: element.props, plainText });
        return plainText ? "fixture text" : "<p>fixture html</p>";
      },
    } as Row,
    { get: (target, key: string) => target[key] ?? (() => null) },
  );
  const emailJsStub = {
    parseEmailWebhookPayload: (raw: unknown) => raw,
    EmailAPIError: FixtureEmailAPIError,
    sendLovableEmail: async (message: Row, options: Row) => {
      sends.push({ message: structuredClone(message), options: structuredClone(options) });
      if (sendFailure) throw sendFailure;
      return { id: "fixture-send" };
    },
  };
  const webhooksJsStub = {
    WebhookError: FixtureWebhookError,
    verifyWebhookRequest: async ({
      req,
      secret,
      parser,
    }: {
      req: Request;
      secret: string;
      parser: (raw: unknown) => unknown;
    }) => {
      if (req.headers.get(SIGNATURE_HEADER) !== `fixture-signed:${secret}`) {
        throw new FixtureWebhookError("invalid_signature");
      }
      let raw: unknown;
      try {
        raw = JSON.parse(await req.text());
      } catch {
        throw new FixtureWebhookError("invalid_json");
      }
      return { payload: parser(raw) };
    },
  };

  let handler!: (request: Request) => Promise<Response>;
  const context = createContext({
    Request,
    Response,
    URL,
    TextEncoder,
    Uint8Array,
    crypto: webcrypto,
    structuredClone,
    // Errors thrown by the substituted libraries come from this realm.
    Error,
    console: { log() {}, error() {}, warn() {} },
    Deno: {
      env: { get: envGet },
      serve: (fn: typeof handler) => {
        handler = fn;
      },
    },
  });

  const modules = new Map<string, { exports: Row }>();
  function load(file: string): Row {
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
      if (name === "npm:react@18.3.1") return reactStub;
      if (name.startsWith("npm:@react-email/components")) return reactEmailStub;
      if (name.startsWith("npm:@lovable.dev/email-js")) return emailJsStub;
      if (name.startsWith("npm:@lovable.dev/webhooks-js")) return webhooksJsStub;
      if (name === "npm:@supabase/supabase-js@2") return { createClient: () => client };
      if (!name.startsWith(".")) throw new Error(`Unexpected external import: ${name}`);
      return load(resolve(dirname(file), name));
    };
    runInContext(`(function(require, module, exports) {${outputText}\n})`, context, {
      filename: file,
    })(requireFixture, mod, mod.exports);
    return mod.exports;
  }
  load(HOOK);

  async function deliver(payload: unknown, options: { signed?: boolean; path?: string } = {}) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (options.signed !== false) {
      headers[SIGNATURE_HEADER] = `fixture-signed:${FIXTURE_LOVABLE_VALUE}`;
    }
    const response = await handler(
      new Request(`https://fixture.invalid/auth-email-hook${options.path ?? ""}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }),
    );
    const text = await response.text();
    return { code: response.status, body: text.startsWith("{") ? JSON.parse(text) : text };
  }

  return {
    deliver,
    sends,
    auditRows,
    rpcCalls,
    renders,
    failSendWith: (error: Error | null) => {
      sendFailure = error;
    },
    clearLovableEnv: () => env.delete("LOVABLE_API_KEY"),
  };
}
