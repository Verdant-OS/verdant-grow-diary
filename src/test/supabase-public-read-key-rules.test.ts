import { describe, expect, it } from "vitest";
import { classifySupabasePublicReadKey } from "@/lib/supabasePublicReadKeyRules";

const b64url = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = (payload: unknown) => `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.sig`;

describe("classifySupabasePublicReadKey", () => {
  it("accepts a publishable key and an anon-role JWT", () => {
    expect(classifySupabasePublicReadKey("sb_publishable_abc123")).toEqual({
      ok: true,
      kind: "publishable",
    });
    expect(classifySupabasePublicReadKey(jwt({ role: "anon", iss: "supabase" }))).toEqual({
      ok: true,
      kind: "anon_jwt",
    });
  });

  it("refuses a service-role JWT even when supplied as the anon key", () => {
    expect(classifySupabasePublicReadKey(jwt({ role: "service_role" }))).toEqual({
      ok: false,
      reason: 'JWT role "service_role" is not anon',
    });
    expect(classifySupabasePublicReadKey(jwt({ role: "authenticated" })).ok).toBe(false);
    expect(classifySupabasePublicReadKey(jwt({ iss: "supabase" })).ok).toBe(false);
  });

  it("refuses secret keys, malformed tokens, and empty input", () => {
    expect(classifySupabasePublicReadKey("sb_secret_abc123").ok).toBe(false);
    expect(classifySupabasePublicReadKey("not-a-key").ok).toBe(false);
    expect(classifySupabasePublicReadKey("a..c").ok).toBe(false);
    expect(classifySupabasePublicReadKey("a.%%%.c").ok).toBe(false);
    expect(classifySupabasePublicReadKey(`a.${b64url("plain-string")}.c`).ok).toBe(false);
    expect(classifySupabasePublicReadKey("").ok).toBe(false);
    expect(classifySupabasePublicReadKey(null).ok).toBe(false);
    expect(classifySupabasePublicReadKey(undefined).ok).toBe(false);
  });
});
