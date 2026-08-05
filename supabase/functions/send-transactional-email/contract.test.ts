import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  MAX_TRANSACTIONAL_EMAIL_BODY_BYTES,
  authorizeTransactionalEmailCaller,
  exceedsTransactionalEmailBodyBytes,
  exceedsTransactionalEmailBodyLimit,
  normalizeTransactionalEmailSubject,
  parseTransactionalEmailRequest,
  resolveTransactionalEmailSecrets,
} from "./contract.ts";

const SERVICE_KEY = "obviously-fake-service-role-key-for-tests";

Deno.test("accepts exact legacy bearer and hosted apikey credentials", () => {
  assertEquals(authorizeTransactionalEmailCaller(`Bearer ${SERVICE_KEY}`, null, [SERVICE_KEY]), {
    ok: true,
  });
  assertEquals(authorizeTransactionalEmailCaller(null, SERVICE_KEY, [SERVICE_KEY]), {
    ok: true,
  });
});

Deno.test("rejects missing, malformed, user, anon, and prefix-matched bearers", () => {
  assertEquals(authorizeTransactionalEmailCaller(null, null, [SERVICE_KEY]), {
    ok: false,
    reason: "missing_authorization",
  });
  assertEquals(authorizeTransactionalEmailCaller(SERVICE_KEY, null, [SERVICE_KEY]), {
    ok: false,
    reason: "invalid_authorization",
  });
  assertEquals(authorizeTransactionalEmailCaller(`Bearer user-jwt`, null, [SERVICE_KEY]), {
    ok: false,
    reason: "server_secret_mismatch",
  });
  assertEquals(
    authorizeTransactionalEmailCaller(`Bearer ${SERVICE_KEY}-suffix`, null, [SERVICE_KEY]),
    {
      ok: false,
      reason: "server_secret_mismatch",
    },
  );
});

Deno.test("fails closed when no elevated key is configured", () => {
  assertEquals(authorizeTransactionalEmailCaller("Bearer anything", null, []), {
    ok: false,
    reason: "server_secret_mismatch",
  });
});

Deno.test("resolves hosted, local, and legacy admin secrets without publishable input", () => {
  assertEquals(
    resolveTransactionalEmailSecrets({
      namedSecretKeysJson: JSON.stringify({
        default: "sb_secret_default",
        worker: "sb_secret_worker",
      }),
      singleSecretKey: "local-secret",
      legacyServiceRoleKey: "legacy-service-role",
    }),
    {
      acceptedKeys: [
        "sb_secret_default",
        "sb_secret_worker",
        "local-secret",
        "legacy-service-role",
      ],
      adminKey: "sb_secret_default",
    },
  );
});

Deno.test("declared and actual body guards reject payloads above 64 KiB", () => {
  assertEquals(exceedsTransactionalEmailBodyLimit(null), false);
  assertEquals(exceedsTransactionalEmailBodyLimit("not-a-number"), false);
  assertEquals(
    exceedsTransactionalEmailBodyLimit(String(MAX_TRANSACTIONAL_EMAIL_BODY_BYTES)),
    false,
  );
  assertEquals(
    exceedsTransactionalEmailBodyLimit(String(MAX_TRANSACTIONAL_EMAIL_BODY_BYTES + 1)),
    true,
  );
  assertEquals(
    exceedsTransactionalEmailBodyBytes("x".repeat(MAX_TRANSACTIONAL_EMAIL_BODY_BYTES)),
    false,
  );
  assertEquals(
    exceedsTransactionalEmailBodyBytes("x".repeat(MAX_TRANSACTIONAL_EMAIL_BODY_BYTES + 1)),
    true,
  );
});

Deno.test("validates template, recipient, idempotency, and template data", () => {
  assertEquals(
    parseTransactionalEmailRequest(
      {
        templateName: "welcome",
        recipientEmail: " Grower@Example.com ",
        idempotencyKey: "welcome:user-1",
        templateData: { firstName: "Grower" },
      },
      ["welcome"],
    ),
    {
      ok: true,
      value: {
        templateName: "welcome",
        recipientEmail: "grower@example.com",
        idempotencyKey: "welcome:user-1",
        templateData: { firstName: "Grower" },
      },
    },
  );
  assertEquals(
    parseTransactionalEmailRequest(
      { templateName: "__proto__", recipientEmail: "grower@example.com" },
      ["welcome"],
    ),
    { ok: false, reason: "invalid_template" },
  );
  assertEquals(
    parseTransactionalEmailRequest(
      { templateName: "welcome", recipientEmail: "bad\r\nBcc: victim@example.com" },
      ["welcome"],
    ),
    { ok: false, reason: "invalid_recipient" },
  );
});

Deno.test("rejects empty, oversized, and control-character email subjects", () => {
  assertEquals(
    normalizeTransactionalEmailSubject("  Grow update: Tent A  "),
    "Grow update: Tent A",
  );
  assertEquals(normalizeTransactionalEmailSubject(""), null);
  assertEquals(normalizeTransactionalEmailSubject("x".repeat(201)), null);
  assertEquals(normalizeTransactionalEmailSubject("Grow update\r\nBcc: victim@example.com"), null);
  assertEquals(normalizeTransactionalEmailSubject("Grow update\u0000hidden"), null);
  assertEquals(normalizeTransactionalEmailSubject(null), null);
});
