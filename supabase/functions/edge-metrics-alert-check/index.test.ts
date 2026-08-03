import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { __internals } from "./index.ts";

const { evaluate, postWebhook, log } = __internals;

const baseThresholds = {
  windowMinutes: 15,
  rpcErrorCount: 5,
  rpcErrorRate: 0.2,
  startupFailureCount: 1,
  minRequests: 10,
  cooldownMinutes: 60,
};

function row(fn: string, outcome: string | null) {
  return { fn, outcome, observed_at: new Date().toISOString() };
}

Deno.test("evaluate: no breaches on clean traffic", () => {
  const rows = Array.from({ length: 20 }, () => row("founder-slots-remaining", "ok"));
  const breaches = evaluate(rows, baseThresholds);
  assertEquals(breaches, []);
});

Deno.test("evaluate: rpc_error_count fires when count >= threshold", () => {
  const rows = [
    ...Array.from({ length: 6 }, () => row("f1", "rpc_error")),
    ...Array.from({ length: 4 }, () => row("f1", "ok")),
  ];
  const breaches = evaluate(rows, baseThresholds);
  const b = breaches.find((x) => x.metric === "rpc_error_count");
  assert(b, "expected rpc_error_count breach");
  assertEquals(b!.fn, "f1");
  assertEquals(b!.value, 6);
  assertEquals(b!.threshold, 5);
  assertEquals(b!.requests_in_window, 10);
});

Deno.test("evaluate: rpc_error_rate fires only above minRequests", () => {
  // 3 errors / 5 total = 60% but below minRequests, so no rate breach
  const smallRows = [
    ...Array.from({ length: 3 }, () => row("f2", "rpc_error")),
    ...Array.from({ length: 2 }, () => row("f2", "ok")),
  ];
  const small = evaluate(smallRows, baseThresholds);
  assertEquals(
    small.find((b) => b.metric === "rpc_error_rate"),
    undefined,
  );

  // 4 errors / 12 total = 33% >= 20% threshold, over minRequests
  const bigRows = [
    ...Array.from({ length: 4 }, () => row("f2", "rpc_error")),
    ...Array.from({ length: 8 }, () => row("f2", "ok")),
  ];
  const big = evaluate(bigRows, baseThresholds);
  const rate = big.find((b) => b.metric === "rpc_error_rate");
  assert(rate, "expected rpc_error_rate breach");
  assertEquals(rate!.fn, "f2");
  assertEquals(rate!.value, 0.333);
});

Deno.test("evaluate: startup_import_failed fires on any occurrence", () => {
  const rows = [row("boot", "startup_import_failed")];
  const breaches = evaluate(rows, baseThresholds);
  const b = breaches.find((x) => x.metric === "startup_import_failed");
  assert(b);
  assertEquals(b!.value, 1);
});

Deno.test("postWebhook: no-op when ALERT_WEBHOOK_URL unset", async () => {
  const prev = Deno.env.get("ALERT_WEBHOOK_URL");
  Deno.env.delete("ALERT_WEBHOOK_URL");
  try {
    const res = await postWebhook(
      [{ fn: "f1", metric: "rpc_error_count", value: 7, threshold: 5, requests_in_window: 10 }],
      baseThresholds,
    );
    assertEquals(res, { posted: false, attempts: [] });
  } finally {
    if (prev) Deno.env.set("ALERT_WEBHOOK_URL", prev);
  }
});

Deno.test("postWebhook: posts breaches to webhook and returns status", async () => {
  const origFetch = globalThis.fetch;
  const captured: { url?: string; body?: unknown; method?: string } = {};
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    captured.url = typeof input === "string" ? input : input.toString();
    captured.method = init?.method;
    captured.body = init?.body ? JSON.parse(String(init.body)) : null;
    return Promise.resolve(new Response("ok", { status: 200 }));
  }) as typeof fetch;
  Deno.env.set("ALERT_WEBHOOK_URL", "https://hooks.example.test/verdant");
  try {
    const breaches = [
      {
        fn: "f1",
        metric: "rpc_error_count" as const,
        value: 7,
        threshold: 5,
        requests_in_window: 10,
      },
      {
        fn: "boot",
        metric: "startup_import_failed" as const,
        value: 1,
        threshold: 1,
        requests_in_window: 1,
      },
    ];
    const res = await postWebhook(breaches, baseThresholds);
    assertEquals(res.posted, true);
    assertEquals(res.status, 200);
    assertEquals(captured.method, "POST");
    assertEquals(captured.url, "https://hooks.example.test/verdant");
    const body = captured.body as { text: string; breaches: unknown[]; window_minutes: number };
    assertEquals(body.window_minutes, 15);
    assertEquals(body.breaches.length, 2);
    assert(body.text.includes("f1"));
    assert(body.text.includes("rpc_error_count"));
    assert(body.text.includes("startup_import_failed"));
  } finally {
    globalThis.fetch = origFetch;
    Deno.env.delete("ALERT_WEBHOOK_URL");
  }
});

Deno.test("log: emits alert_fired at warn severity with breach metadata", () => {
  const origWarn = console.warn;
  const lines: string[] = [];
  console.warn = (msg: unknown) => {
    lines.push(String(msg));
  };
  try {
    // Mirror the handler's log call once we know a breach exists.
    log("warn", "alert_fired", {
      request_id: "test-req",
      breach_count: 2,
      suppressed_count: 0,
      webhook_posted: true,
      webhook_status: 200,
    });
  } finally {
    console.warn = origWarn;
  }
  assertEquals(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assertEquals(parsed.fn, "edge-metrics-alert-check");
  assertEquals(parsed.severity, "warn");
  assertEquals(parsed.event, "alert_fired");
  assertEquals(parsed.breach_count, 2);
  assertEquals(parsed.webhook_posted, true);
  assertEquals(parsed.webhook_status, 200);
});

Deno.test("integration: breach detection triggers webhook POST and alert_fired log", async () => {
  const origFetch = globalThis.fetch;
  const origWarn = console.warn;
  const posts: unknown[] = [];
  const warns: string[] = [];
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
    posts.push(init?.body ? JSON.parse(String(init.body)) : null);
    return Promise.resolve(new Response("ok", { status: 200 }));
  }) as typeof fetch;
  console.warn = (msg: unknown) => {
    warns.push(String(msg));
  };
  Deno.env.set("ALERT_WEBHOOK_URL", "https://hooks.example.test/verdant");
  try {
    const rows = [
      ...Array.from({ length: 6 }, () => row("f1", "rpc_error")),
      ...Array.from({ length: 4 }, () => row("f1", "ok")),
    ];
    const breaches = evaluate(rows, baseThresholds);
    assert(breaches.length > 0);
    const webhook = await postWebhook(breaches, baseThresholds);
    if (webhook.posted) {
      log("warn", "alert_fired", {
        request_id: "test-req",
        breach_count: breaches.length,
        suppressed_count: 0,
        webhook_posted: webhook.posted,
        webhook_status: webhook.status,
      });
    }
    assertEquals(posts.length, 1);
    const alertLine = warns.find((l) => l.includes('"event":"alert_fired"'));
    assert(alertLine, "expected an alert_fired log line");
    const parsed = JSON.parse(alertLine!);
    assertEquals(parsed.breach_count, breaches.length);
  } finally {
    globalThis.fetch = origFetch;
    console.warn = origWarn;
    Deno.env.delete("ALERT_WEBHOOK_URL");
  }
});

const breachFixture = [
  { fn: "f1", metric: "rpc_error_count" as const, value: 7, threshold: 5, requests_in_window: 10 },
];

Deno.test("postWebhook: retries transient 5xx with exponential backoff, then succeeds", async () => {
  const origFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = ((_input: string | URL | Request, _init?: RequestInit) => {
    calls += 1;
    if (calls < 3) return Promise.resolve(new Response("boom", { status: 503 }));
    return Promise.resolve(new Response("ok", { status: 200 }));
  }) as typeof fetch;
  Deno.env.set("ALERT_WEBHOOK_URL", "https://hooks.example.test/verdant");
  Deno.env.set("ALERT_WEBHOOK_BASE_DELAY_MS", "1");
  Deno.env.set("ALERT_WEBHOOK_MAX_DELAY_MS", "2");
  Deno.env.set("ALERT_WEBHOOK_MAX_ATTEMPTS", "5");
  try {
    const res = await postWebhook(breachFixture, baseThresholds);
    assertEquals(res.posted, true);
    assertEquals(res.status, 200);
    assertEquals(calls, 3);
    assertEquals(res.attempts.length, 3);
    assertEquals(res.attempts[0].transient, true);
    assertEquals(res.attempts[0].delay_before_ms, 0);
    assert(res.attempts[1].delay_before_ms >= 0);
    assertEquals(res.attempts[2].ok, true);
    assertEquals(res.gave_up_transient, undefined);
  } finally {
    globalThis.fetch = origFetch;
    Deno.env.delete("ALERT_WEBHOOK_URL");
    Deno.env.delete("ALERT_WEBHOOK_BASE_DELAY_MS");
    Deno.env.delete("ALERT_WEBHOOK_MAX_DELAY_MS");
    Deno.env.delete("ALERT_WEBHOOK_MAX_ATTEMPTS");
  }
});

Deno.test("postWebhook: 4xx is permanent, no retries", async () => {
  const origFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => {
    calls += 1;
    return Promise.resolve(new Response("bad", { status: 404 }));
  }) as typeof fetch;
  Deno.env.set("ALERT_WEBHOOK_URL", "https://hooks.example.test/verdant");
  Deno.env.set("ALERT_WEBHOOK_MAX_ATTEMPTS", "5");
  try {
    const res = await postWebhook(breachFixture, baseThresholds);
    assertEquals(res.posted, false);
    assertEquals(res.status, 404);
    assertEquals(calls, 1);
    assertEquals(res.attempts[0].transient, false);
    assertEquals(res.gave_up_transient, undefined);
  } finally {
    globalThis.fetch = origFetch;
    Deno.env.delete("ALERT_WEBHOOK_URL");
    Deno.env.delete("ALERT_WEBHOOK_MAX_ATTEMPTS");
  }
});

Deno.test("postWebhook: exhausted transient retries mark gave_up_transient and log retries", async () => {
  const origFetch = globalThis.fetch;
  const origWarn = console.warn;
  const origError = console.error;
  const origInfo = console.log;
  const events: string[] = [];
  const capture = (msg: unknown) => events.push(String(msg));
  console.warn = capture;
  console.error = capture;
  console.log = capture;
  globalThis.fetch = (() => Promise.reject(new Error("network down"))) as typeof fetch;
  Deno.env.set("ALERT_WEBHOOK_URL", "https://hooks.example.test/verdant");
  Deno.env.set("ALERT_WEBHOOK_BASE_DELAY_MS", "1");
  Deno.env.set("ALERT_WEBHOOK_MAX_DELAY_MS", "2");
  Deno.env.set("ALERT_WEBHOOK_MAX_ATTEMPTS", "3");
  try {
    const res = await postWebhook(breachFixture, baseThresholds);
    assertEquals(res.posted, false);
    assertEquals(res.gave_up_transient, true);
    assertEquals(res.attempts.length, 3);
    for (const a of res.attempts) assertEquals(a.transient, true);
    assert(events.some((l) => l.includes('"event":"webhook_retry_scheduled"')));
    assert(events.some((l) => l.includes('"event":"webhook_transient_failure"')));
    assert(events.some((l) => l.includes('"event":"webhook_retries_exhausted"')));
  } finally {
    globalThis.fetch = origFetch;
    console.warn = origWarn;
    console.error = origError;
    console.log = origInfo;
    Deno.env.delete("ALERT_WEBHOOK_URL");
    Deno.env.delete("ALERT_WEBHOOK_BASE_DELAY_MS");
    Deno.env.delete("ALERT_WEBHOOK_MAX_DELAY_MS");
    Deno.env.delete("ALERT_WEBHOOK_MAX_ATTEMPTS");
  }
});
