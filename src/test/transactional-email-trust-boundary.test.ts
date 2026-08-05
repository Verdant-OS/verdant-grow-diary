import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_TRANSACTIONAL_EMAIL_BODY_BYTES,
  authorizeTransactionalEmailCaller,
  exceedsTransactionalEmailBodyBytes,
  exceedsTransactionalEmailBodyLimit,
  normalizeTransactionalEmailSubject,
  parseTransactionalEmailRequest,
  resolveTransactionalEmailSecrets,
} from "../../supabase/functions/send-transactional-email/contract";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("transactional email trust boundary", () => {
  it("accepts only exact server-held legacy or opaque secret credentials", () => {
    const key = "fake-server-secret";
    expect(authorizeTransactionalEmailCaller(`Bearer ${key}`, null, [key])).toEqual({ ok: true });
    expect(authorizeTransactionalEmailCaller(null, key, [key])).toEqual({ ok: true });
    expect(authorizeTransactionalEmailCaller("Bearer signed-in-user-jwt", null, [key])).toEqual({
      ok: false,
      reason: "server_secret_mismatch",
    });
    expect(authorizeTransactionalEmailCaller(null, null, [key])).toEqual({
      ok: false,
      reason: "missing_authorization",
    });
  });

  it("resolves hosted secret maps before local and legacy fallbacks", () => {
    expect(
      resolveTransactionalEmailSecrets({
        namedSecretKeysJson: JSON.stringify({ default: "sb_secret_default" }),
        singleSecretKey: "local-secret",
        legacyServiceRoleKey: "legacy-service-role",
      }),
    ).toEqual({
      acceptedKeys: ["sb_secret_default", "local-secret", "legacy-service-role"],
      adminKey: "sb_secret_default",
    });
  });

  it("never accepts a publishable or anon key as a send credential", () => {
    // A client-side key landing in the secret map would reopen the open-relay
    // hole this endpoint exists to close, so the resolver drops it rather than
    // trusting whoever populated the map.
    const anonJwt = `header.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.sig`;
    const serviceJwt = `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.sig`;

    const resolved = resolveTransactionalEmailSecrets({
      namedSecretKeysJson: JSON.stringify({
        default: "sb_secret_default",
        leaked: "sb_publishable_oops",
        alsoLeaked: anonJwt,
      }),
      singleSecretKey: null,
      legacyServiceRoleKey: serviceJwt,
    });

    expect(resolved.acceptedKeys).not.toContain("sb_publishable_oops");
    expect(resolved.acceptedKeys).not.toContain(anonJwt);
    // The legitimate credentials survive — this must not break receipts.
    expect(resolved.acceptedKeys).toContain("sb_secret_default");
    expect(resolved.acceptedKeys).toContain(serviceJwt);

    // And an unrecognised format is kept, never silently dropped.
    expect(
      resolveTransactionalEmailSecrets({
        namedSecretKeysJson: null,
        singleSecretKey: "some-unfamiliar-but-valid-secret",
        legacyServiceRoleKey: null,
      }).acceptedKeys,
    ).toEqual(["some-unfamiliar-but-valid-secret"]);
  });

  it("answers 401 before disclosing server configuration state", () => {
    // An unauthenticated caller must not be able to distinguish "misconfigured"
    // from "wrong credential"; the auth gate runs first.
    const source = read("supabase/functions/send-transactional-email/index.ts");
    const authorizationIndex = source.indexOf("authorizeTransactionalEmailCaller(");
    const configErrorIndex = source.indexOf("Server configuration error");

    expect(authorizationIndex).toBeGreaterThan(0);
    expect(configErrorIndex).toBeGreaterThan(authorizationIndex);
  });

  it("keeps the queue endpoint server-only before parsing caller-controlled fields", () => {
    const source = read("supabase/functions/send-transactional-email/index.ts");
    const authorizationIndex = source.indexOf("authorizeTransactionalEmailCaller(");
    const bodyParseIndex = source.indexOf("await req.text()");

    expect(authorizationIndex).toBeGreaterThan(0);
    expect(bodyParseIndex).toBeGreaterThan(authorizationIndex);
    expect(source).toMatch(/jsonResponse\(\{\s*error:\s*["']Unauthorized["']\s*\},\s*401\)/);
    expect(source).toContain("status: 405");
    expect(source).toMatch(/req\.headers\.get\(["']apikey["']\)/);
    expect(source).toMatch(/Deno\.env\.get\(["']SUPABASE_SECRET_KEYS["']\)/);
    expect(source).not.toContain("supabase-js@2/cors");
    expect(source).not.toContain("No in-function auth check is needed");

    const config = read("supabase/config.toml");
    const block = config.match(
      /\[functions\.send-transactional-email\][\s\S]*?(?=\n\s*\[functions\.|\s*$)/,
    );
    expect(block?.[0]).toContain("verify_jwt = false");
    expect(config).toContain("Never call this function from browser code.");
  });

  it("does not expose the service-only sender from browser code", () => {
    for (const path of ["src/pages/Auth.tsx", "src/pages/CheckoutSuccess.tsx"]) {
      expect(read(path)).not.toContain('functions.invoke("send-transactional-email"');
    }
  });

  it("bounds declared and actual request bodies", () => {
    expect(exceedsTransactionalEmailBodyLimit(String(MAX_TRANSACTIONAL_EMAIL_BODY_BYTES))).toBe(
      false,
    );
    expect(exceedsTransactionalEmailBodyLimit(String(MAX_TRANSACTIONAL_EMAIL_BODY_BYTES + 1))).toBe(
      true,
    );
    expect(exceedsTransactionalEmailBodyBytes("x".repeat(MAX_TRANSACTIONAL_EMAIL_BODY_BYTES))).toBe(
      false,
    );
    expect(
      exceedsTransactionalEmailBodyBytes("x".repeat(MAX_TRANSACTIONAL_EMAIL_BODY_BYTES + 1)),
    ).toBe(true);
  });

  it("rejects unknown templates, malformed recipients, and unsafe idempotency keys", () => {
    expect(
      parseTransactionalEmailRequest(
        {
          templateName: "welcome",
          recipientEmail: "Grower@Example.com",
          idempotencyKey: "welcome:user-1",
        },
        ["welcome"],
      ),
    ).toMatchObject({
      ok: true,
      value: { recipientEmail: "grower@example.com" },
    });
    expect(
      parseTransactionalEmailRequest(
        { templateName: "__proto__", recipientEmail: "grower@example.com" },
        ["welcome"],
      ),
    ).toEqual({ ok: false, reason: "invalid_template" });
    expect(
      parseTransactionalEmailRequest(
        { templateName: "welcome", recipientEmail: "x@example.com\r\nBcc:y@example.com" },
        ["welcome"],
      ),
    ).toEqual({ ok: false, reason: "invalid_recipient" });
    expect(normalizeTransactionalEmailSubject("Grow update\r\nBcc: victim@example.com")).toBeNull();
  });

  it("makes suppression effective before consuming the unsubscribe token", () => {
    const source = read("supabase/functions/handle-email-unsubscribe/index.ts");
    const suppressIndex = source.search(/\.from\(["']suppressed_emails["']\)/);
    const tokenUpdateIndex = source.search(
      /\.from\(["']email_unsubscribe_tokens["']\)\s*\.update\(/,
    );

    expect(suppressIndex).toBeGreaterThan(0);
    expect(tokenUpdateIndex).toBeGreaterThan(suppressIndex);
    const consoleCalls = source.match(/console\.(?:log|warn|error)\([\s\S]*?\);/g) ?? [];
    expect(consoleCalls.join("\n")).not.toContain("tokenRecord.email");
    expect(consoleCalls.join("\n")).not.toMatch(/\{\s*token[\s,}]/);
  });

  it("keeps unsubscribe tokens out of indexing and raw user-facing errors", () => {
    const source = read("src/pages/Unsubscribe.tsx");
    // Classic SPA index.html is gone under TanStack SSR; route head + page
    // contract still enforce noindex / no-referrer / no token leakage.
    const vercel = JSON.parse(read("vercel.json")) as {
      headers: Array<{
        source: string;
        headers: Array<{ key: string; value: string }>;
      }>;
    };
    const unsubscribeHeaders = vercel.headers.find((entry) => entry.source === "/unsubscribe");

    expect(source).toContain("noindex: true");
    expect(source).toContain('referrerPolicy="no-referrer"');
    expect(source).toContain("window.history.replaceState(");
    expect(source).toContain('body: { token, action: "validate" }');
    expect(source).not.toContain("handle-email-unsubscribe?token=");
    expect(source).not.toContain("err instanceof Error ? err.message");
    expect(unsubscribeHeaders?.headers).toEqual(
      expect.arrayContaining([
        { key: "Cache-Control", value: "no-store" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
      ]),
    );
  });

  it("validates public unsubscribe payloads before database access", () => {
    const source = read("supabase/functions/handle-email-unsubscribe/index.ts");
    const validationIndex = source.indexOf("isValidUnsubscribeToken(token)");
    const databaseIndex = source.indexOf("createClient(supabaseUrl, supabaseAdminKey)");

    expect(validationIndex).toBeGreaterThan(0);
    expect(databaseIndex).toBeGreaterThan(validationIndex);
    expect(source).toContain("exceedsUnsubscribeBodyBytes(rawBody)");
    expect(source).toMatch(/action\s*===\s*["']validate["']/);
    const consoleCalls = source.match(/console\.(?:log|warn|error)\([\s\S]*?\)/g) ?? [];
    expect(consoleCalls.join("\n")).not.toMatch(/\btoken\s*[,)}]/);
    expect(consoleCalls.join("\n")).not.toContain("tokenRecord.email");
  });
});
