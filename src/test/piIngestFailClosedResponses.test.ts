import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildMethodNotAllowedResponseBody,
  buildSecretResolverNotImplementedResponseBody,
  PI_INGEST_METHOD_NOT_ALLOWED_ERROR,
  PI_INGEST_SECRET_RESOLVER_NOT_IMPLEMENTED_ERROR,
  PI_INGEST_SECRET_RESOLVER_NOT_IMPLEMENTED_MESSAGE,
} from "@/lib/piIngestFailClosedResponses";

describe("piIngestFailClosedResponses — method_not_allowed", () => {
  const body = buildMethodNotAllowedResponseBody();

  it("ok is exactly false", () => {
    expect(body.ok).toBe(false);
  });
  it("error is method_not_allowed", () => {
    expect(body.error).toBe("method_not_allowed");
    expect(PI_INGEST_METHOD_NOT_ALLOWED_ERROR).toBe("method_not_allowed");
  });
  it("message is a non-empty string", () => {
    expect(typeof body.message).toBe("string");
    expect(body.message.length).toBeGreaterThan(0);
  });
  it("has only ok/error/message keys", () => {
    expect(Object.keys(body).sort()).toEqual(["error", "message", "ok"]);
  });
  it("returns a fresh object each call", () => {
    expect(buildMethodNotAllowedResponseBody()).not.toBe(
      buildMethodNotAllowedResponseBody(),
    );
    expect(buildMethodNotAllowedResponseBody()).toEqual(body);
  });
});

describe("piIngestFailClosedResponses — secret_resolver_not_implemented", () => {
  const body = buildSecretResolverNotImplementedResponseBody();

  it("ok is exactly false", () => {
    expect(body.ok).toBe(false);
  });
  it("error is secret_resolver_not_implemented", () => {
    expect(body.error).toBe("secret_resolver_not_implemented");
    expect(PI_INGEST_SECRET_RESOLVER_NOT_IMPLEMENTED_ERROR).toBe(
      "secret_resolver_not_implemented",
    );
  });
  it("message matches the documented fail-closed message", () => {
    expect(body.message).toBe(PI_INGEST_SECRET_RESOLVER_NOT_IMPLEMENTED_MESSAGE);
    expect(body.message).toMatch(/server-only bridge secret resolver/);
  });
  it("has only ok/error/message keys", () => {
    expect(Object.keys(body).sort()).toEqual(["error", "message", "ok"]);
  });
  it("returns a fresh object each call", () => {
    expect(buildSecretResolverNotImplementedResponseBody()).not.toBe(
      buildSecretResolverNotImplementedResponseBody(),
    );
    expect(buildSecretResolverNotImplementedResponseBody()).toEqual(body);
  });
});

describe("piIngestFailClosedResponses — fail-closed invariants", () => {
  it("no exported builder ever returns ok:true", async () => {
    const mod = await import("@/lib/piIngestFailClosedResponses");
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value === "function") {
        const result = (value as () => unknown)();
        expect(
          (result as { ok?: unknown }).ok,
          `${name} must not return ok:true`,
        ).toBe(false);
      }
    }
  });

  it("source file has no success-path or runtime surfaces", () => {
    const src = readFileSync(
      resolve(__dirname, "../lib/piIngestFailClosedResponses.ts"),
      "utf8",
    );
    const forbidden: Array<[string, RegExp]> = [
      ["ok:true", /ok\s*:\s*true/],
      ["Response constructor", /\bnew\s+Response\s*\(/],
      ["fetch", /\bfetch\s*\(/],
      ["Supabase client", /@\/integrations\/supabase\/client/],
      ["createClient", /\bcreateClient\s*\(/],
      ["service_role", /service_role/i],
      ["Deno reference", /\bDeno\./],
      ["process.env", /process\.env/],
      ["crypto", /\bcrypto\./],
      ["sensor_readings", /\bsensor_readings\b/],
      ["action_queue", /\baction_queue\b/],
      ["alerts table", /from\(\s*["']alerts["']\s*\)/],
    ];
    for (const [label, re] of forbidden) {
      expect(re.test(src), `forbidden surface: ${label}`).toBe(false);
    }
  });
});
