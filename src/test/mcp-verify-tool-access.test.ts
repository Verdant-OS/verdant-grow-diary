/**
 * verifyMcpToolAccess helper tests.
 *
 * Cover the four presenter states and prove the result payload never
 * contains tokens, secrets, raw response rows, or raw errors.
 */
import { describe, it, expect } from "vitest";
import {
  verifyMcpToolAccess,
  defaultBrowserHarness,
  type HarnessAdapter,
  type VerifyMcpToolAccessResult,
} from "@/lib/mcp/verifyMcpToolAccess";

const FORBIDDEN = [
  /eyJ[A-Za-z0-9_-]{5,}/,
  /bearer\s+/i,
  /service_role/i,
  /refresh_token/i,
  /bridge[_-]?token/i,
  /client[_-]?secret/i,
  /SUPABASE_SERVICE_ROLE_KEY/,
];

function assertSafe(result: VerifyMcpToolAccessResult) {
  const serialized = JSON.stringify(result);
  for (const rx of FORBIDDEN) expect(serialized).not.toMatch(rx);
}

describe("verifyMcpToolAccess", () => {
  it("returns harness_unavailable when no adapter is provided", async () => {
    const r = await verifyMcpToolAccess();
    expect(r.status).toBe("harness_unavailable");
    expect(r.label).toMatch(/harness unavailable/i);
    assertSafe(r);
  });

  it("returns harness_unavailable when adapter reports unavailable", async () => {
    const r = await verifyMcpToolAccess({ adapter: defaultBrowserHarness });
    expect(r.status).toBe("harness_unavailable");
    assertSafe(r);
  });

  it("returns authorized when probe succeeds", async () => {
    const adapter: HarnessAdapter = {
      available: true,
      probe: async () => ({ ok: true, growCount: 2 }),
    };
    const r = await verifyMcpToolAccess({ adapter });
    expect(r.status).toBe("authorized");
    expect(r.toolChecked).toBe("list_grows");
    expect(r.growCount).toBe(2);
    assertSafe(r);
  });

  it("returns authorized with 0 grows as a valid empty state", async () => {
    const adapter: HarnessAdapter = {
      available: true,
      probe: async () => ({ ok: true, growCount: 0 }),
    };
    const r = await verifyMcpToolAccess({ adapter });
    expect(r.status).toBe("authorized");
    expect(r.growCount).toBe(0);
  });

  it("returns unauthorized when the probe reports unauthenticated", async () => {
    const adapter: HarnessAdapter = {
      available: true,
      probe: async () => ({ ok: false, unauthenticated: true }),
    };
    const r = await verifyMcpToolAccess({ adapter });
    expect(r.status).toBe("unauthorized");
    assertSafe(r);
  });

  it("returns failed on generic probe failure", async () => {
    const adapter: HarnessAdapter = {
      available: true,
      probe: async () => ({ ok: false }),
    };
    const r = await verifyMcpToolAccess({ adapter });
    expect(r.status).toBe("failed");
    assertSafe(r);
  });

  it("swallows thrown errors and returns failed without leaking details", async () => {
    const adapter: HarnessAdapter = {
      available: true,
      probe: async () => {
        throw new Error(
          "Bearer eyJhbGciOi.SECRET.SIG service_role refresh_token=xyz",
        );
      },
    };
    const r = await verifyMcpToolAccess({ adapter });
    expect(r.status).toBe("failed");
    assertSafe(r);
  });

  it("supports a deterministic clock via options.now", async () => {
    const fixed = new Date("2026-07-06T00:00:00.000Z");
    const r = await verifyMcpToolAccess({ now: () => fixed });
    expect(r.checkedAt).toBe(fixed.toISOString());
  });
});
