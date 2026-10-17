/**
 * Codex P2 on #2230 at ebfb1e06: Paddle client-side tokens are the prefix plus
 * exactly 27 letters/digits. A malformed `live_` value must never enable live
 * checkout on the production host (runtime classifier) and must fail the
 * production prebuild gate (canonical parser).
 */
import { describe, expect, it } from "vitest";
import { classifyPaddleToken, resolvePaddleCheckoutEnvironment } from "@/lib/paddleEnvironment";
import { resolveCanonicalPaddleProductionToken } from "../../scripts/e2e/managed-session-materialize-core.mjs";

const VALID_LIVE = `live_${"a1B2c3D4e5".repeat(2)}F6g7H8i`;
const MALFORMED_LIVE = [
  "live_invalid",
  `live_${"a".repeat(26)}`,
  `live_${"a".repeat(28)}`,
  `live_${"a".repeat(13)}_${"a".repeat(13)}`,
  `live_${"a".repeat(13)}-${"a".repeat(13)}`,
];

describe("live Paddle client-token shape", () => {
  it("uses a 27-character fixture for the valid case", () => {
    expect(VALID_LIVE.length).toBe("live_".length + 27);
    expect(classifyPaddleToken(VALID_LIVE)).toBe("live");
    expect(
      resolvePaddleCheckoutEnvironment({ token: VALID_LIVE, hostname: "verdantgrowdiary.com" }),
    ).toBe("live");
    expect(
      resolveCanonicalPaddleProductionToken(`VITE_PAYMENTS_CLIENT_TOKEN="${VALID_LIVE}"`).ok,
    ).toBe(true);
  });

  it.each(MALFORMED_LIVE)("never opens live checkout for %j on the production host", (token) => {
    expect(classifyPaddleToken(token)).toBe("unavailable");
    for (const hostname of ["verdantgrowdiary.com", "www.verdantgrowdiary.com"]) {
      expect(resolvePaddleCheckoutEnvironment({ token, hostname })).toBe("unavailable");
    }
  });

  it.each(MALFORMED_LIVE)("fails the production prebuild parser for %j", (token) => {
    expect(resolveCanonicalPaddleProductionToken(`VITE_PAYMENTS_CLIENT_TOKEN="${token}"`)).toEqual({
      ok: false,
      reason: "canonical_paddle_token_invalid",
    });
  });
});
