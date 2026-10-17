/**
 * Codex P2 on #2230 at 34e0814b: the production smoke scans the deployed entry
 * bundle for Paddle `live_` tokens. Ordinary app identifiers that merely start
 * with `live_` (the `live_confirmed` sensor-proof status, snake_case names)
 * are not Paddle client tokens and must not fail the smoke. Real token shapes
 * (`live_` + 16 or more letters/digits) are still caught.
 */
import { describe, expect, it } from "vitest";
import { evaluatePublicPaddleBundle } from "../../scripts/e2e/managed-session-materialize-core.mjs";

const LIVE_TOKEN = `live_${"2f975b194d4ec4c7".repeat(1)}20525928b62`;
const OTHER_LIVE_TOKEN = `live_${"9a".repeat(13)}b`;
const TEST_TOKEN = `test_${"7d".repeat(13)}e`;
const APP_IDENTIFIERS = [
  `status:"live_confirmed"`,
  `{live_sensor_readings_effective:1}`,
  `var live_mode=!0`,
  `"live_ingest-v2"`,
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
});
