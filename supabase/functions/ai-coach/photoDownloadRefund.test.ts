// Executes the coach download-failure path and observes ai_credit_refund.
// Injected client and fetch only. No network, no secrets.
import { handleAiCoachRequest } from "./index.ts";
import { downloadSignedStorageObject } from "../_shared/geminiInlineImage.ts";

const SUPABASE_URL = "https://project.supabase.co";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SPEND_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const IDEMPOTENCY_KEY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PHOTO_URL = `${SUPABASE_URL}/storage/v1/object/sign/diary-photos/leaf.jpg?token=t`;
const GEMINI_CHAT_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const SIGNED_PHOTO_PATH = "/storage/v1/object/sign/diary-photos/leaf.jpg";

function parseFetchUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function isSignedDiaryPhoto(input: string): boolean {
  const parsed = parseFetchUrl(input);
  return parsed?.origin === SUPABASE_URL && parsed.pathname === SIGNED_PHOTO_PATH;
}

function isGeminiChatEndpoint(input: string): boolean {
  const parsed = parseFetchUrl(input);
  const expected = parseFetchUrl(GEMINI_CHAT_URL);
  return (
    parsed !== null &&
    expected !== null &&
    parsed.origin === expected.origin &&
    parsed.pathname === expected.pathname
  );
}

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

Deno.test("signed photo and Gemini endpoints match structurally", () => {
  assert(isSignedDiaryPhoto(PHOTO_URL), "fixture photo");
  assert(
    isSignedDiaryPhoto(
      "https://evil.example/storage/v1/object/sign/diary-photos/leaf.jpg?token=t",
    ) === false,
    "lookalike storage host",
  );
  assert(
    isSignedDiaryPhoto(`${SUPABASE_URL}/storage/v1/object/sign/other-bucket/leaf.jpg?token=t`) ===
      false,
    "other object path",
  );
  assert(isGeminiChatEndpoint(GEMINI_CHAT_URL), "fixture gemini");
  assert(
    isGeminiChatEndpoint("https://evil.example/?host=generativelanguage.googleapis.com") === false,
    "gemini host in the query",
  );
  assert(
    isGeminiChatEndpoint("https://generativelanguage.googleapis.com/other") === false,
    "gemini host with another path",
  );
  assert(
    isGeminiChatEndpoint(
      "https://generativelanguage.googleapis.com.evil.example/v1beta/openai/chat/completions",
    ) === false,
    "gemini host suffix",
  );
});

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
    if (isSignedDiaryPhoto(url)) {
      return Promise.resolve(new Response(JPEG, { status: 200 }));
    }
    if (isGeminiChatEndpoint(url)) {
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

Deno.test("a stalled photo download refunds inside the photo deadline", async () => {
  installEnv();
  const calls: RpcCall[] = [];
  const previous = globalThis.fetch;
  const started = Date.now();
  let geminiSeen = false;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  globalThis.fetch = ((input: string, init?: RequestInit) => {
    const url = String(input);
    if (isSignedDiaryPhoto(url)) {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        const abort = () => reject(new DOMException("The operation was aborted.", "AbortError"));
        if (!signal) {
          reject(new Error("no signal"));
          return;
        }
        if (signal.aborted) {
          abort();
          return;
        }
        signal.addEventListener("abort", abort, { once: true });
      });
    }
    if (isGeminiChatEndpoint(url)) {
      geminiSeen = true;
      return Promise.resolve(new Response("{}", { status: 200 }));
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  }) as typeof fetch;
  const hang = new Promise<never>((_resolve, reject) => {
    watchdog = setTimeout(() => reject(new Error("photo deadline missed")), 1_000);
  });
  try {
    const response = await Promise.race([
      handleAiCoachRequest(
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
      ),
      hang,
    ]);
    assert(Date.now() - started < 1_000, "elapsed past the photo deadline");
    assert(geminiSeen === false, "provider fetch ran during a photo stall");
    const body = await response.json();
    assert(body.ok === false && body.reason === "invalid", `body ${JSON.stringify(body)}`);
    const refunds = calls.filter((call) => call.name === "ai_credit_refund");
    assert(refunds.length === 1, `refund count ${refunds.length}`);
    assert(refunds[0]?.params?.p_reason === "photo_download_failed", "refund reason");
  } finally {
    if (watchdog !== undefined) clearTimeout(watchdog);
    globalThis.fetch = previous;
  }
});

Deno.test("refunds when the photo response body stalls until the photo deadline", async () => {
  await expectPhotoDownloadRefund((_input, _init) =>
    Promise.resolve(
      new Response(
        new ReadableStream({
          pull() {
            return new Promise(() => undefined);
          },
        }),
        { status: 200 },
      ),
    ),
  );
});

async function expectBoundedPhotoRefund(
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>,
  refundReason: string,
): Promise<void> {
  installEnv();
  const calls: RpcCall[] = [];
  const previous = globalThis.fetch;
  const started = Date.now();
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  globalThis.fetch = fetchImpl as typeof fetch;
  const hang = new Promise<never>((_resolve, reject) => {
    watchdog = setTimeout(() => reject(new Error("photo deadline missed")), 200);
  });
  try {
    const response = await Promise.race([
      handleAiCoachRequest(
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
      ),
      hang,
    ]);
    assert(Date.now() - started < 200, `elapsed ${Date.now() - started}`);
    assert(response.status === 200, `status ${response.status}`);
    const body = await response.json();
    assert(body.ok === false && body.reason === "invalid", `body ${JSON.stringify(body)}`);
    const refunds = calls.filter((call) => call.name === "ai_credit_refund");
    assert(refunds.length === 1, `refund count ${refunds.length}`);
    assert(
      refunds[0]?.params?.p_reason === refundReason,
      `refund reason ${refunds[0]?.params?.p_reason}`,
    );
  } finally {
    if (watchdog !== undefined) clearTimeout(watchdog);
    globalThis.fetch = previous;
  }
}

function neverSettlingStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    pull() {
      return new Promise(() => undefined);
    },
    cancel() {
      return new Promise(() => undefined);
    },
  });
}

Deno.test("refunds when a failed photo response cancel never settles", async () => {
  await expectBoundedPhotoRefund(
    async () => new Response(neverSettlingStream(), { status: 500 }),
    "photo_download_failed",
  );
});

Deno.test("refunds when an oversized photo response cancel never settles", async () => {
  await expectBoundedPhotoRefund(
    async () =>
      new Response(neverSettlingStream(), {
        status: 200,
        headers: { "content-length": String(8 * 1024 * 1024) },
      }),
    "photo_too_large",
  );
});

Deno.test("an aborted oversized stream does not wait on cancel", async () => {
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), 20);
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const hang = new Promise<never>((_resolve, reject) => {
    watchdog = setTimeout(() => reject(new Error("photo deadline missed")), 200);
  });
  try {
    const result = await Promise.race([
      downloadSignedStorageObject({
        photoUrl: PHOTO_URL,
        allowedPrefix: `${SUPABASE_URL}/storage/v1/object/sign/`,
        maxBytes: 1,
        signal: controller.signal,
        fetchImpl: async () =>
          new Response(
            new ReadableStream({
              pull(streamController) {
                streamController.enqueue(new Uint8Array([1, 2]));
                return new Promise(() => undefined);
              },
              cancel() {
                return new Promise(() => undefined);
              },
            }),
            { status: 200 },
          ),
      }),
      hang,
    ]);
    assert(result.ok === false && result.reason === "too_large", JSON.stringify(result));
  } finally {
    clearTimeout(abortTimer);
    if (watchdog !== undefined) clearTimeout(watchdog);
  }
});
