/**
 * get-paddle-price — catalog-unavailable telemetry contract.
 *
 * Diagnostic logging for catalog-unavailable branches must:
 *  - Emit a single JSON line via console.warn (greppable in edge logs,
 *    never console.log / console.error / console.info drift).
 *  - Contain ONLY the sanitized non-sensitive fields: event tag, plan
 *    (allowlist enum or fixed sentinel), reason (fixed enum), environment,
 *    env_var_configured, stage.
 *  - Never leak reason codes / diagnostic tokens into any client-facing
 *    JSON response body — the HTTP payload stays a bare `error` string.
 *  - Never log user id / JWT / gateway body / Paddle price ids / request
 *    headers / key material.
 *  - Fire on every fail-closed branch: method guard, auth guards, allowlist
 *    rejection, founder cap (both error + sold-out), gateway non-ok,
 *    empty gateway body, config drift, and the outer catch.
 *  - Never echo attacker-controlled `priceId` input — the allowlist branch
 *    must log a fixed `(rejected)` sentinel, not the raw request value.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(process.cwd(), "supabase/functions/get-paddle-price/index.ts"),
  "utf8",
);
const stripped = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// Every logCatalogUnavailable({...}) call site, argument body captured.
const CALL_SITES = [...stripped.matchAll(/logCatalogUnavailable\(\{([\s\S]*?)\}\)/g)].map(
  (m) => m[1],
);

describe("get-paddle-price — catalog-unavailable telemetry emitter", () => {
  it("emits a single console.warn JSON line tagged get_paddle_price_catalog_unavailable", () => {
    // Exactly one console.warn call in the module — the telemetry emitter.
    const warnCalls = stripped.match(/console\.warn\(/g) ?? [];
    expect(warnCalls.length).toBe(1);
    expect(stripped).toMatch(
      /console\.warn\(\s*JSON\.stringify\(\s*\{[\s\S]*event:\s*["']get_paddle_price_catalog_unavailable["']/,
    );
  });

  it("never drifts to console.log / console.error / console.info for telemetry", () => {
    expect(stripped).not.toMatch(/console\.log\(/);
    expect(stripped).not.toMatch(/console\.error\(/);
    expect(stripped).not.toMatch(/console\.info\(/);
  });

  it("logs only the sanitized non-sensitive field set", () => {
    const emitter = stripped.match(
      /console\.warn\(\s*JSON\.stringify\(\s*(\{[\s\S]*?\})\s*\)\s*,?\s*\)/,
    );
    expect(emitter, "telemetry emitter payload not found").toBeTruthy();
    const payload = emitter![1];
    const allowedKeys = new Set([
      "event",
      "plan",
      "reason",
      "environment",
      "env_var_configured",
      "stage",
    ]);
    const keys = [...payload.matchAll(/^\s*([a-z_][a-z0-9_]*)\s*:/gim)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(allowedKeys.has(k), `unexpected telemetry field: ${k}`).toBe(true);
    }
    // Explicit leak guards — none of these must ever be logged.
    const forbidden = [
      /user[_ ]?id/i,
      /\bjwt\b/i,
      /authorization/i,
      /access[_ ]?token/i,
      /api[_ ]?key/i,
      /service[_ ]?role/i,
      /paddle[_ ]?id/i,
      /priceId/,
      /raw[_ ]?body/i,
      /headers/i,
      /stack/i,
    ];
    for (const rx of forbidden) {
      expect(payload, `telemetry payload leaks ${rx}`).not.toMatch(rx);
    }
  });

  it("swallows emitter errors so telemetry never breaks the resolver", () => {
    expect(stripped).toMatch(
      /function\s+logCatalogUnavailable[\s\S]*try\s*\{[\s\S]*console\.warn[\s\S]*\}\s*catch[\s\S]*\}/,
    );
  });
});

describe("get-paddle-price — telemetry fires on every fail-closed branch", () => {
  it("has at least one telemetry call for each documented stage", () => {
    const stages = [
      "method",
      "auth",
      "allowlist",
      "entitlement",
      "founder_cap",
      "gateway",
      "gateway_body",
      "config_drift",
      "exception",
    ];
    for (const stage of stages) {
      const hit = CALL_SITES.some((body) => new RegExp(`stage:\\s*["']${stage}["']`).test(body));
      expect(hit, `no logCatalogUnavailable call site with stage=${stage}`).toBe(true);
    }
  });

  it("uses only the sanitized reason enum at call sites", () => {
    const allowedReasons = new Set([
      "unknown_plan",
      "price_not_configured",
      "price_resolution_unavailable",
      "plan_sold_out",
      "auth_required",
      "method_not_allowed",
      "internal_error",
      "pack_requires_monthly_plan",
    ]);
    const reasons = CALL_SITES.flatMap((body) =>
      [...body.matchAll(/reason:\s*["']([^"']+)["']/g)].map((m) => m[1]),
    );
    expect(reasons.length).toBe(CALL_SITES.length);
    for (const r of reasons) {
      expect(allowedReasons.has(r), `unexpected reason literal: ${r}`).toBe(true);
    }
  });

  it("never echoes the attacker-controlled priceId on the allowlist branch", () => {
    // The allowlist rejection must log the fixed `(rejected)` sentinel —
    // NOT the raw `requested` value (attacker-controlled / PII-shaped).
    const allowlistCall = CALL_SITES.find((body) => /stage:\s*["']allowlist["']/.test(body));
    expect(allowlistCall, "allowlist telemetry call not found").toBeTruthy();
    expect(allowlistCall!).toMatch(/plan:\s*["']\(rejected\)["']/);
    expect(allowlistCall!).not.toMatch(/plan:\s*requested/);
    expect(allowlistCall!).not.toMatch(/plan:\s*body/);
  });

  it("outer catch logs internal_error without surfacing the exception detail", () => {
    const exceptionCall = CALL_SITES.find((body) => /stage:\s*["']exception["']/.test(body));
    expect(exceptionCall).toBeTruthy();
    expect(exceptionCall!).toMatch(/reason:\s*["']internal_error["']/);
    // Must not stuff the caught error into the log payload.
    expect(exceptionCall!).not.toMatch(/\berr\b/);
    expect(exceptionCall!).not.toMatch(/message/);
    expect(exceptionCall!).not.toMatch(/stack/);
  });
});

describe("get-paddle-price — reason codes never leak into HTTP responses", () => {
  it("client-facing responses expose only a bare sanitized `error` field", () => {
    // Every json(status, {...}) response body may contain ONLY the `error`
    // key — no reason/stage/environment/diagnostic fields leaking outward.
    const responses = [...stripped.matchAll(/json\(\s*\d+\s*,\s*(\{[^}]*\})\s*\)/g)].map(
      (m) => m[1],
    );
    expect(responses.length).toBeGreaterThan(0);
    for (const body of responses) {
      const keys = [...body.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g)].map((m) => m[1]);
      const nonError = keys.filter((k) => k !== "error" && k !== "paddleId");
      expect(nonError, `HTTP response leaks non-error field(s): ${nonError.join(",")}`).toEqual([]);
    }
  });

  it("no diagnostic stage token appears in any HTTP response body", () => {
    // Diagnostic-only tokens must never appear inside a json(...) response.
    const responseBodies = [...stripped.matchAll(/json\(\s*\d+\s*,\s*\{[^}]*\}\s*\)/g)].map(
      (m) => m[0],
    );
    const diagnosticTokens = [
      "gateway_body",
      "config_drift",
      "founder_cap",
      "env_var_configured",
      "get_paddle_price_catalog_unavailable",
    ];
    for (const body of responseBodies) {
      for (const tok of diagnosticTokens) {
        expect(body, `response body leaks diagnostic token ${tok}`).not.toContain(tok);
      }
    }
  });
});
