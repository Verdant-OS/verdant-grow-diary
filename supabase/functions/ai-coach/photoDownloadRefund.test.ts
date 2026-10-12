// Executes the coach download-failure path and observes ai_credit_refund.
// Injected client and fetch only. No network, no secrets.
import { handleAiCoachRequest } from "./index.ts";

const SUPABASE_URL = "https://project.supabase.co";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SPEND_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const IDEMPOTENCY_KEY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PHOTO_URL = `${SUPABASE_URL}/storage/v1/object/sign/diary-photos/leaf.jpg?token=t`;

type RpcCall = { name: string; params?: Record<string, unknown> };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function installEnv(): void {
  Deno.env.set("SUPABASE_URL", SUPABASE_URL);
  Deno.env.set("SUPABASE_ANON_KEY", "test-anon-key");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  Deno.env.set("PAYMENTS_ENVIRONMENT", "live");
  Deno.env.set("GEMINI_API_KEY", "test-gemini-key-not-a-secret");
}

function createFakeClient(calls: RpcCall[]) {
  return (_url: string, _key: string, _options?: Record<string, unknown>) => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: USER_ID } } }),
    },
    rpc: (name: string, params?: Record<string, unknown>) => {
      calls.push({ name, params });
      if (name === "ai_credit_spend") {
        return Promise.resolve({
          data: {
            ok: true,
            status: "spent",
            spend_id: SPEND_ID,
            feature: "ai_coach",
            model_tier: "standard",
            grow_id: null,
          },
          error: null,
        });
      }
      if (name === "ai_credit_refund") {
        return Promise.resolve({ data: { ok: true, status: "refunded" }, error: null });
      }
      return Promise.resolve({ data: null, error: { message: "unexpected rpc" } });
    },
    from: () => {
      throw new Error("table read was not expected");
    },
  });
}

async function expectPhotoDownloadRefund(
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>,
): Promise<void> {
  installEnv();
  const calls: RpcCall[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = fetchImpl as typeof fetch;
  try {
    const response = await handleAiCoachRequest(
      new Request(`${SUPABASE_URL}/functions/v1/ai-coach`, {
        method: "POST",
        headers: {
          Authorization: "Bearer test-jwt",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "diagnose",
          idempotencyKey: IDEMPOTENCY_KEY,
          photoUrl: PHOTO_URL,
        }),
      }),
      { createClient: createFakeClient(calls), photoTimeoutMs: 20 },
    );
    assert(response.status === 200, `status ${response.status}`);
    const body = await response.json();
    assert(body.ok === false && body.reason === "invalid", `body ${JSON.stringify(body)}`);
    const spends = calls.filter((call) => call.name === "ai_credit_spend");
    const refunds = calls.filter((call) => call.name === "ai_credit_refund");
    assert(spends.length === 1, `spend count ${spends.length}`);
    assert(refunds.length === 1, `refund count ${refunds.length}`);
    assert(
      JSON.stringify(refunds[0]?.params) ===
        JSON.stringify({
          p_expected_user_id: USER_ID,
          p_spend_id: SPEND_ID,
          p_idempotency_key: `refund:${SPEND_ID}`,
          p_reason: "photo_download_failed",
        }),
      `refund params ${JSON.stringify(refunds[0]?.params)}`,
    );
  } finally {
    globalThis.fetch = previous;
  }
}

Deno.test("refunds when cancelling a failed photo response is rejected", async () => {
  await expectPhotoDownloadRefund(
    async () =>
      new Response(
        new ReadableStream({
          pull() {
            return new Promise(() => undefined);
          },
          cancel() {
            return Promise.reject(new Error("cancel refused"));
          },
        }),
        { status: 500 },
      ),
  );
});

Deno.test("refunds when the in-flight photo fetch aborts", async () => {
  let abortSeen = false;
  await expectPhotoDownloadRefund(
    (_input, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error("no signal"));
          return;
        }
        const abort = () => {
          abortSeen = true;
          reject(new DOMException("The operation was aborted.", "AbortError"));
        };
        if (signal.aborted) {
          abort();
          return;
        }
        signal.addEventListener("abort", abort, { once: true });
      }),
  );
  assert(abortSeen, "abort was not observed");
});

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);

Deno.test("refunds when the Gemini response body stalls until abort", async () => {
  installEnv();
  const calls: RpcCall[] = [];
  const previous = globalThis.fetch;
  let geminiAborted = false;
  const started = Date.now();
  globalThis.fetch = ((input: string, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/storage/v1/object/sign/")) {
      return Promise.resolve(new Response(JPEG, { status: 200 }));
    }
    if (url.includes("generativelanguage.googleapis.com")) {
      const signal = init?.signal;
      if (signal) {
        const mark = () => {
          geminiAborted = true;
        };
        if (signal.aborted) mark();
        else signal.addEventListener("abort", mark, { once: true });
      }
      return Promise.resolve(
        new Response(
          new ReadableStream({
            pull() {
              return new Promise(() => undefined);
            },
          }),
          { status: 200 },
        ),
      );
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  }) as typeof fetch;
  let hangTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const pending = handleAiCoachRequest(
      new Request(`${SUPABASE_URL}/functions/v1/ai-coach`, {
        method: "POST",
        headers: {
          Authorization: "Bearer test-jwt",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "diagnose",
          idempotencyKey: IDEMPOTENCY_KEY,
          photoUrl: PHOTO_URL,
        }),
      }),
      { createClient: createFakeClient(calls), photoTimeoutMs: 20, providerTimeoutMs: 20 },
    );
    const winner = await Promise.race([
      pending.then((response) => ({ kind: "response" as const, response })),
      new Promise<{ kind: "timeout" }>((resolve) => {
        hangTimer = setTimeout(() => resolve({ kind: "timeout" }), 1000);
      }),
    ]);
    assert(geminiAborted, "abort was not observed");
    assert(winner.kind === "response", "handler exceeded 1s");
    if (winner.kind !== "response") return;
    assert(Date.now() - started < 1000, `elapsed ${Date.now() - started}`);
    assert(winner.response.status === 200, `status ${winner.response.status}`);
    const body = await winner.response.json();
    assert(body.ok === false && body.reason === "timeout", `body ${JSON.stringify(body)}`);
    const refunds = calls.filter((call) => call.name === "ai_credit_refund");
    assert(refunds.length === 1, `refund count ${refunds.length}`);
    assert(
      refunds[0]?.params?.p_reason === "upstream_network",
      `refund params ${JSON.stringify(refunds[0]?.params)}`,
    );
  } finally {
    if (hangTimer !== undefined) clearTimeout(hangTimer);
    globalThis.fetch = previous;
  }
});

Deno.test("refunds when the photo response body stalls until abort", async () => {
  await expectPhotoDownloadRefund(
    async () =>
      new Response(
        new ReadableStream({
          pull() {
            return new Promise(() => undefined);
          },
        }),
        { status: 200 },
      ),
  );
});
