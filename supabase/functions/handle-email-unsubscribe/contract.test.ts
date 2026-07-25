import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  MAX_UNSUBSCRIBE_BODY_BYTES,
  exceedsUnsubscribeBodyBytes,
  isValidUnsubscribeToken,
  parseUnsubscribeFormRequest,
  parseUnsubscribeJsonRequest,
  resolveUnsubscribeAdminKey,
} from "./contract.ts";

const TOKEN = "a".repeat(64);

Deno.test("accepts only generated 64-character hexadecimal tokens", () => {
  assertEquals(isValidUnsubscribeToken(TOKEN), true);
  assertEquals(isValidUnsubscribeToken("A".repeat(64)), true);
  assertEquals(isValidUnsubscribeToken("z".repeat(64)), false);
  assertEquals(isValidUnsubscribeToken("a".repeat(63)), false);
});

Deno.test("separates validation from the write-bearing unsubscribe action", () => {
  assertEquals(parseUnsubscribeJsonRequest({ token: TOKEN, action: "validate" }, null), {
    ok: true,
    token: TOKEN,
    action: "validate",
  });
  assertEquals(parseUnsubscribeJsonRequest({ token: TOKEN }, null), {
    ok: true,
    token: TOKEN,
    action: "unsubscribe",
  });
  assertEquals(parseUnsubscribeJsonRequest({ token: TOKEN, action: "delete" }, null), {
    ok: false,
    reason: "invalid_action",
  });
});

Deno.test("requires the exact RFC 8058 one-click marker or an explicit form token", () => {
  assertEquals(parseUnsubscribeFormRequest("List-Unsubscribe=One-Click", TOKEN), {
    ok: true,
    token: TOKEN,
    action: "unsubscribe",
  });
  assertEquals(parseUnsubscribeFormRequest(`token=${TOKEN}`, null), {
    ok: true,
    token: TOKEN,
    action: "unsubscribe",
  });
  assertEquals(parseUnsubscribeFormRequest("List-Unsubscribe=Anything", TOKEN), {
    ok: false,
    reason: "invalid_body",
  });
});

Deno.test("bounds public request bodies", () => {
  assertEquals(exceedsUnsubscribeBodyBytes("x".repeat(MAX_UNSUBSCRIBE_BODY_BYTES)), false);
  assertEquals(exceedsUnsubscribeBodyBytes("x".repeat(MAX_UNSUBSCRIBE_BODY_BYTES + 1)), true);
});

Deno.test("prefers hosted named secrets and retains local/legacy fallbacks", () => {
  assertEquals(
    resolveUnsubscribeAdminKey({
      namedSecretKeysJson: JSON.stringify({ default: "sb_secret_default" }),
      singleSecretKey: "local-secret",
      legacyServiceRoleKey: "legacy-service-role",
    }),
    "sb_secret_default",
  );
  assertEquals(
    resolveUnsubscribeAdminKey({
      namedSecretKeysJson: "{invalid",
      singleSecretKey: null,
      legacyServiceRoleKey: "legacy-service-role",
    }),
    "legacy-service-role",
  );
});
