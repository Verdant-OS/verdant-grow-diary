/**
 * Static pins: the Lovable gateway path stays in place, and Bearer auth
 * exists only on the direct-sandbox branch that runs after resolvePaddleTransport.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/paddle.ts"), "utf8");

function functionBody(signature: string): string {
  const start = SRC.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  const next = SRC.indexOf("\nexport ", start + signature.length);
  return SRC.slice(start, next === -1 ? undefined : next);
}

function withoutDirectBlocks(body: string): string {
  return body.replace(/if \(transport\.mode === "direct"\) \{[\s\S]*?\n {2}\}/g, "");
}

describe("paddle.ts gateway path stays pinned", () => {
  it("keeps the gateway URL, both headers, and the Lovable API key read", () => {
    expect(SRC).toContain("https://connector-gateway.lovable.dev/paddle");
    expect(SRC).toContain('"X-Connection-Api-Key"');
    expect(SRC).toContain('"Lovable-API-Key"');
    expect(SRC).toContain('getEnv("LOVABLE_API_KEY")');
    expect(SRC).toMatch(/export function getPaddleClient/);
    expect(SRC).toMatch(/export async function gatewayFetch/);
  });

  it("calls resolvePaddleTransport before either client or fetch branch", () => {
    expect(SRC).toContain("resolvePaddleTransport");
    const helper = functionBody("function transportFor");
    expect(helper.indexOf("resolvePaddleTransport")).toBeGreaterThan(-1);
    expect(helper.indexOf("resolvePaddleTransport")).toBeLessThan(
      helper.indexOf("return transport"),
    );

    for (const signature of [
      "export function getPaddleClient",
      "export async function gatewayFetch",
    ]) {
      const body = functionBody(signature);
      const transportAt = body.indexOf("transportFor(");
      const branchAt = Math.min(
        ...["GATEWAY_BASE_URL", "Bearer", "Environment.sandbox"]
          .map((token) => body.indexOf(token))
          .filter((index) => index >= 0),
      );
      expect(transportAt).toBeGreaterThan(-1);
      expect(transportAt).toBeLessThan(branchAt);
    }
  });

  it("puts Authorization and Bearer only in the direct branch", () => {
    expect(SRC).toContain("Authorization");
    expect(SRC).toContain("Bearer ");
    const client = functionBody("export function getPaddleClient");
    const fetchFn = functionBody("export async function gatewayFetch");
    const gatewayClient = withoutDirectBlocks(client);
    const gatewayFetch = withoutDirectBlocks(fetchFn);

    expect(gatewayClient).toContain("GATEWAY_BASE_URL");
    expect(gatewayClient).toContain('"X-Connection-Api-Key"');
    expect(gatewayClient).toContain('"Lovable-API-Key"');
    expect(gatewayClient).toContain('getEnv("LOVABLE_API_KEY")');
    expect(gatewayClient).not.toMatch(/Authorization|Bearer/);

    expect(gatewayFetch).toContain("GATEWAY_BASE_URL");
    expect(gatewayFetch).toContain('"X-Connection-Api-Key"');
    expect(gatewayFetch).toContain('"Lovable-API-Key"');
    expect(gatewayFetch).toContain('getEnv("LOVABLE_API_KEY")');
    expect(gatewayFetch).not.toMatch(/Authorization|Bearer/);

    expect(fetchFn).toMatch(
      /if \(transport\.mode === "direct"\) \{[\s\S]*Authorization: `Bearer \$\{transport\.apiKey\}`/,
    );
  });
});
