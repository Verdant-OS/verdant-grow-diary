/**
 * Paddle documents client-side tokens as the prefix (`test_` or `live_`) plus
 * exactly 27 letters/digits. Runtime classification and the production
 * prebuild parser must accept only that shape: a malformed value never
 * initializes Paddle (sandbox or live) and fails the production gate. The
 * public-bundle attestation still requires the exact committed bytes.
 */
import { describe, expect, it } from "vitest";
import { classifyPaddleToken, resolvePaddleCheckoutEnvironment } from "@/lib/paddleEnvironment";
import {
  evaluatePublicPaddleBundle,
  resolveCanonicalPaddleProductionToken,
  resolveCanonicalPaddleSandboxToken,
} from "../../scripts/e2e/managed-session-materialize-core.mjs";

const PAYLOAD = `${"a1B2c3D4e5".repeat(2)}F6g7H8i`;
const VALID_LIVE = `live_${PAYLOAD}`;
const VALID_TEST = `test_${PAYLOAD}`;

const malformed = (prefix: string) => [
  `${prefix}invalid`,
  `${prefix}${"a".repeat(26)}`,
  `${prefix}${"a".repeat(28)}`,
  `${prefix}${"a".repeat(13)}_${"a".repeat(13)}`,
  `${prefix}${"a".repeat(13)}-${"a".repeat(13)}`,
  `${prefix}${"a".repeat(26)}!`,
];
const MALFORMED_LIVE = malformed("live_");
const MALFORMED_TEST = malformed("test_");
const env = (token: string) => `VITE_PAYMENTS_CLIENT_TOKEN="${token}"`;

describe("Paddle client-token shape", () => {
  it("accepts the documented shape for both prefixes", () => {
    expect(PAYLOAD).toMatch(/^[A-Za-z0-9]{27}$/);
    expect(classifyPaddleToken(VALID_LIVE)).toBe("live");
    expect(classifyPaddleToken(VALID_TEST)).toBe("sandbox");
    expect(
      resolvePaddleCheckoutEnvironment({ token: VALID_LIVE, hostname: "verdantgrowdiary.com" }),
    ).toBe("live");
    expect(resolvePaddleCheckoutEnvironment({ token: VALID_TEST, hostname: "localhost" })).toBe(
      "sandbox",
    );
    expect(resolveCanonicalPaddleProductionToken(env(VALID_LIVE)).ok).toBe(true);
    expect(resolveCanonicalPaddleProductionToken(env(VALID_TEST)).ok).toBe(true);
    expect(resolveCanonicalPaddleSandboxToken(env(VALID_TEST)).ok).toBe(true);
  });

  it.each(MALFORMED_LIVE)("never opens live checkout for %j on the production host", (token) => {
    expect(classifyPaddleToken(token)).toBe("unavailable");
    for (const hostname of ["verdantgrowdiary.com", "www.verdantgrowdiary.com"]) {
      expect(resolvePaddleCheckoutEnvironment({ token, hostname })).toBe("unavailable");
    }
  });

  it.each(MALFORMED_TEST)("never opens sandbox checkout for %j on any host", (token) => {
    expect(classifyPaddleToken(token)).toBe("unavailable");
    for (const hostname of ["verdantgrowdiary.com", "localhost"]) {
      expect(resolvePaddleCheckoutEnvironment({ token, hostname })).toBe("unavailable");
    }
  });

  it.each([...MALFORMED_LIVE, ...MALFORMED_TEST])(
    "fails the production prebuild parser for %j",
    (token) => {
      expect(resolveCanonicalPaddleProductionToken(env(token))).toEqual({
        ok: false,
        reason: "canonical_paddle_token_invalid",
      });
    },
  );

  it.each(MALFORMED_TEST)("fails the sandbox-only parser for %j", (token) => {
    expect(resolveCanonicalPaddleSandboxToken(env(token)).ok).toBe(false);
  });

  it("keeps exact-token attestation of the deployed bundle", () => {
    const otherLive = `live_${"Z".repeat(27)}`;
    expect(
      evaluatePublicPaddleBundle({ canonicalToken: VALID_LIVE, bundle: `x"${VALID_LIVE}"x` }),
    ).toEqual({ ok: true });
    expect(
      evaluatePublicPaddleBundle({
        canonicalToken: VALID_LIVE,
        bundle: `"${VALID_LIVE}";"${otherLive}"`,
      }),
    ).toEqual({ ok: false, reason: "public_paddle_live_token_mismatch" });
    expect(
      evaluatePublicPaddleBundle({ canonicalToken: VALID_LIVE, bundle: "no token here" }),
    ).toEqual({ ok: false, reason: "public_paddle_live_token_missing" });
    // Production ships live checkout: a well-formed sandbox committed token is
    // refused by the attestation, whatever the bundle carries.
    expect(
      evaluatePublicPaddleBundle({ canonicalToken: VALID_TEST, bundle: `"${VALID_TEST}"` }),
    ).toEqual({ ok: false, reason: "public_paddle_canonical_not_live" });
    expect(
      evaluatePublicPaddleBundle({ canonicalToken: VALID_TEST, bundle: "no token here" }),
    ).toEqual({ ok: false, reason: "public_paddle_canonical_not_live" });
    expect(
      evaluatePublicPaddleBundle({ canonicalToken: `live_${"a".repeat(26)}`, bundle: VALID_LIVE }),
    ).toEqual({ ok: false, reason: "public_paddle_contract_invalid" });
  });
});
