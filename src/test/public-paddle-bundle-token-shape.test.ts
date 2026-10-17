/**
 * Codex P2 on #2230 at 34e0814b: the production smoke scans the deployed entry
 * bundle for Paddle `live_` tokens. Ordinary app identifiers that merely start
 * with `live_` (the `live_confirmed` sensor-proof status, snake_case names,
 * and shorter or longer alphanumeric runs) are not Paddle client tokens and
 * must not fail the smoke. Only Paddle's exact shape (`live_` + exactly 27
 * letters/digits) is treated as a token.
 */
import { describe, expect, it } from "vitest";
import { evaluatePublicPaddleBundle } from "../../scripts/e2e/managed-session-materialize-core.mjs";

const LIVE_TOKEN = `live_${"c3".repeat(13)}d`;
const OTHER_LIVE_TOKEN = `live_${"9a".repeat(13)}b`;
const TEST_TOKEN = `test_${"7d".repeat(13)}e`;
const APP_IDENTIFIERS = [
  `status:"live_confirmed"`,
  `{live_sensor_readings_effective:1}`,
  `var live_mode=!0`,
  `"live_ingest-v2"`,
  `"live_abcdefghijklmnop"`,
  `"live_${"a".repeat(26)}"`,
  `"live_${"b".repeat(28)}"`,
].join(";");

describe("public bundle Paddle token scan", () => {
  it("accepts the committed live token next to ordinary live_ app identifiers", () => {
    expect(
      evaluatePublicPaddleBundle({
        canonicalToken: LIVE_TOKEN,
        bundle: `${APP_IDENTIFIERS};const t="${LIVE_TOKEN}";`,
      }),
    ).toEqual({ ok: true });
  });

  it("still fails when a second token-shaped live_ value is present", () => {
    expect(
      evaluatePublicPaddleBundle({
        canonicalToken: LIVE_TOKEN,
        bundle: `${APP_IDENTIFIERS};"${LIVE_TOKEN}";"${OTHER_LIVE_TOKEN}"`,
      }),
    ).toEqual({ ok: false, reason: "public_paddle_live_token_mismatch" });
  });

  it("keeps a sandbox build green next to ordinary live_ app identifiers", () => {
    expect(
      evaluatePublicPaddleBundle({
        canonicalToken: TEST_TOKEN,
        bundle: `${APP_IDENTIFIERS};"${TEST_TOKEN}"`,
      }),
    ).toEqual({ ok: true });
  });

  it("still fails a sandbox build that carries a token-shaped live_ value", () => {
    expect(
      evaluatePublicPaddleBundle({
        canonicalToken: TEST_TOKEN,
        bundle: `"${TEST_TOKEN}";"${OTHER_LIVE_TOKEN}"`,
      }),
    ).toEqual({ ok: false, reason: "public_paddle_live_token_present" });
  });

  it.each([
    ["followed by a letter", (t: string) => `"${t}b"`],
    ["followed by a digit", (t: string) => `"${t}7"`],
    ["followed by _ or -", (t: string) => `"${t}_x";"${t}-x"`],
    ["preceded by a letter", (t: string) => `"x${t}"`],
  ])("does not count the committed token when it is %s", (_label, wrap) => {
    expect(
      evaluatePublicPaddleBundle({ canonicalToken: LIVE_TOKEN, bundle: wrap(LIVE_TOKEN) }),
    ).toEqual({ ok: false, reason: "public_paddle_live_token_missing" });
    expect(
      evaluatePublicPaddleBundle({ canonicalToken: TEST_TOKEN, bundle: wrap(TEST_TOKEN) }),
    ).toEqual({ ok: false, reason: "public_paddle_sandbox_token_missing" });
  });
});
