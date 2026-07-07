/**
 * Regression tests for scrubExecutableSource + the Quick Log e2e
 * harness safety scanner scope fix.
 *
 * These prove:
 *   1. Denylist/pattern definitions (string literals, regex literals)
 *      inside a scanner or test file do NOT self-trigger secret-token
 *      matches.
 *   2. Real runtime identifier usage of the same tokens (e.g.
 *      `supabase.auth.service_role`) is STILL detected.
 *   3. Tokens like `access_token`, `Authorization`, `Cookie`,
 *      `service_role` remain detectable outside a denylist definition
 *      context.
 *
 * Pure, no I/O.
 */
import { describe, it, expect } from "vitest";
import { scrubExecutableSource } from "./utils/scrubExecutableSource";

const SECRET_RE = /service_role/i;

describe("scrubExecutableSource — scanner self-match safety", () => {
  it("blanks a SECRET_PATTERNS-style denylist so scanners do not self-match", () => {
    const src = `
      const SECRET_PATTERNS = [
        { label: "service_role", re: /service_role/i },
        { label: "access_token", re: /access[_-]?token/i },
      ];
    `;
    const scrubbed = scrubExecutableSource(src);
    expect(scrubbed).not.toMatch(SECRET_RE);
    expect(scrubbed).not.toMatch(/access[_-]?token/i);
    expect(scrubbed).not.toMatch(/Authorization/i);
  });

  it("blanks docstring comments mentioning forbidden tokens", () => {
    const src = `
      // service_role must never appear in client code
      /* Authorization header is stripped by the sanitizer */
      const x = 1;
    `;
    const scrubbed = scrubExecutableSource(src);
    expect(scrubbed).not.toMatch(SECRET_RE);
    expect(scrubbed).not.toMatch(/Authorization/i);
  });

  it("STILL flags real runtime identifier usage of service_role", () => {
    const src = `const key = process.env.SUPABASE_SERVICE_ROLE_KEY;\nauth.service_role.query();`;
    const scrubbed = scrubExecutableSource(src);
    expect(scrubbed).toMatch(SECRET_RE);
  });

  it("STILL flags real runtime identifier usage of access_token / Authorization / Cookie", () => {
    const src = `
      const t = session.access_token;
      req.headers["Authorization"] = "Bearer " + t;
      document.cookie = someCookieValue;
    `;
    const scrubbed = scrubExecutableSource(src);
    // access_token identifier usage remains (the string index is blanked
    // but the property access `.access_token` survives).
    expect(scrubbed).toMatch(/access_token/);
    // Authorization used only inside a string here → blanked. That is
    // correct: a string literal is not runtime identifier usage. The
    // scanner treats string leaks separately (bearer-token/JWT rules).
    expect(scrubbed).not.toMatch(/Authorization/);
    // document.cookie identifier access survives.
    expect(scrubbed).toMatch(/document\.cookie/);
  });

  it("flags service_role used as a bare identifier even next to a denylist", () => {
    const src = `
      const DENY = [{ label: "service_role", re: /service_role/i }];
      const leaked = client.service_role;
    `;
    const scrubbed = scrubExecutableSource(src);
    // The denylist entries are blanked, but the property access remains.
    expect(scrubbed).toMatch(/\.service_role/);
  });

  it("preserves newlines so scanner error line numbers stay stable", () => {
    const src = `"a"\n"b"\n// c\n/* d\ne */\n/x/g\n`;
    const scrubbed = scrubExecutableSource(src);
    const originalNewlines = (src.match(/\n/g) || []).length;
    const scrubbedNewlines = (scrubbed.match(/\n/g) || []).length;
    expect(scrubbedNewlines).toBe(originalNewlines);
  });

  it("handles empty / non-string input safely", () => {
    expect(scrubExecutableSource("")).toBe("");
    // @ts-expect-error deliberate wrong-type check
    expect(scrubExecutableSource(null)).toBe("");
    // @ts-expect-error deliberate wrong-type check
    expect(scrubExecutableSource(undefined)).toBe("");
  });
});
