/**
 * Static safety: sensor-ingest-webhook CORS / preflight handling.
 *
 * The browser diagnostic on https://verdantgrowdiary.com collapses to
 * `status: 0 / network_error / likely_cors_or_preflight` if the Edge
 * Function returns no CORS headers on OPTIONS or any error path. These
 * tests pin the response contract so that regression cannot reintroduce
 * wildcard origins, missing allow-headers, or unguarded response paths.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(__dirname, "../../supabase/functions/sensor-ingest-webhook/index.ts"),
  "utf8",
);
const codeOnly = SRC.replace(/\/\/[^\n]*/g, "");

describe("sensor-ingest-webhook CORS contract", () => {
  it("declares an explicit allowed-origin set (no bare wildcard with auth)", () => {
    expect(codeOnly).toMatch(/ALLOWED_ORIGINS\s*=\s*new Set/);
    expect(codeOnly).toContain("https://verdantgrowdiary.com");
    // Wildcard must not be used as the static Allow-Origin value.
    expect(codeOnly).not.toMatch(/Access-Control-Allow-Origin["']\s*:\s*["']\*["']/);
  });

  it("returns CORS headers for OPTIONS before any auth / body / DB work", () => {
    const optIdx = SRC.indexOf('req.method === "OPTIONS"');
    const authIdx = SRC.indexOf("authenticateBearer(");
    const bodyIdx = SRC.indexOf("await req.json()");
    expect(optIdx).toBeGreaterThan(-1);
    expect(optIdx).toBeLessThan(authIdx);
    expect(optIdx).toBeLessThan(bodyIdx);
    // OPTIONS must respond with buildCorsHeaders and no bridge-token check.
    const optionsBlock = SRC.slice(optIdx, optIdx + 400);
    expect(optionsBlock).toMatch(/buildCorsHeaders\(req\)/);
    expect(optionsBlock).not.toMatch(/Authorization/);
    expect(optionsBlock).not.toMatch(/bridge_token/);
  });

  it("includes required Allow-Headers (authorization, content-type, bridge token, idempotency)", () => {
    const allowHeaders = SRC.match(/Access-Control-Allow-Headers["']\s*:\s*["']([^"']+)["']/);
    expect(allowHeaders).toBeTruthy();
    const headerList = (allowHeaders![1] ?? "").toLowerCase();
    for (const h of [
      "authorization",
      "content-type",
      "x-verdant-bridge-token",
      "idempotency-key",
    ]) {
      expect(headerList).toContain(h);
    }
  });

  it("declares Vary: Origin so caches do not poison cross-origin responses", () => {
    expect(SRC).toMatch(/["']Vary["']\s*:\s*["']Origin["']/);
  });

  it("allows POST and OPTIONS only", () => {
    expect(SRC).toMatch(/Access-Control-Allow-Methods["']\s*:\s*["']POST,\s*OPTIONS["']/);
  });

  it("every json() error response receives CORS headers via the helper", () => {
    // The helper spreads buildCorsHeaders into the response headers.
    expect(SRC).toMatch(/headers:\s*\{\s*\.\.\.buildCorsHeaders\(req\)/);
    // Every json(...) call passes `req` so headers are attached.
    const jsonCalls = SRC.match(/\bjson\(([^,)]+),/g) ?? [];
    expect(jsonCalls.length).toBeGreaterThan(5);
    for (const call of jsonCalls) {
      expect(call.trim()).toMatch(/^json\(\s*req\s*,/);
    }
  });

  it("wraps the handler in try/catch so unexpected errors still return CORS headers", () => {
    expect(SRC).toMatch(/try\s*\{\s*return await handle\(req\)/);
    expect(SRC).toMatch(/catch[^}]*json\(req,\s*\{\s*error:\s*["']internal_error["']/);
  });

  it("never echoes Authorization, bridge tokens, or service-role keys in response bodies", () => {
    // Response bodies are constructed via json(req, { ... }) literals only.
    // None of those object literals should reference token-bearing fields.
    expect(codeOnly).not.toMatch(/json\(req,\s*\{[^}]*authHeader/);
    expect(codeOnly).not.toMatch(/json\(req,\s*\{[^}]*rawToken/);
    expect(codeOnly).not.toMatch(/json\(req,\s*\{[^}]*SUPABASE_SERVICE_ROLE_KEY/);
    expect(codeOnly).not.toMatch(/json\(req,\s*\{[^}]*token_hash/);
  });

  it("never console.logs the Authorization header or raw bridge token", () => {
    expect(codeOnly).not.toMatch(/console\.(log|info|warn|error)\([^)]*authHeader/);
    expect(codeOnly).not.toMatch(/console\.(log|info|warn|error)\([^)]*rawToken/);
  });
});
