import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const FOUNDATION = readFileSync(
  resolve(ROOT, "supabase/migrations/20260723000807_1d7c3ae4-0410-494d-bfd8-fa279330bfbc.sql"),
  "utf8",
);
const REPAIR = readFileSync(
  resolve(ROOT, "supabase/migrations/20260727041719_grant_search_normalizer_service_role.sql"),
  "utf8",
);
const NORMALIZED_REPAIR = REPAIR.replace(/\s+/g, " ").trim().toLowerCase();

describe("search normalizer service-role repair", () => {
  it("keeps the indexed helper immutable and narrowly scoped", () => {
    expect(FOUNDATION).toMatch(
      /function public\.verdant_normalize_search_text\(p_text text\)[\s\S]*language sql[\s\S]*immutable[\s\S]*parallel safe/i,
    );
    expect(FOUNDATION).not.toMatch(
      /function public\.verdant_normalize_search_text\(p_text text\)[\s\S]{0,180}security definer/i,
    );
  });

  it("restores only authenticated and service-role execution", () => {
    expect(NORMALIZED_REPAIR).toContain(
      "revoke all on function public.verdant_normalize_search_text(text) from public;",
    );
    expect(NORMALIZED_REPAIR).toContain(
      "revoke all on function public.verdant_normalize_search_text(text) from anon;",
    );
    expect(NORMALIZED_REPAIR).toContain(
      "grant execute on function public.verdant_normalize_search_text(text) to authenticated, service_role;",
    );
    expect(NORMALIZED_REPAIR).not.toMatch(/\bgrant\b[\s\S]*\bto anon\b/);
  });

  it("does not alter tables, policies, ownership, or function behavior", () => {
    expect(NORMALIZED_REPAIR).not.toMatch(
      /\b(?:create|alter|drop)\s+(?:table|policy|function|trigger|role)\b/,
    );
    expect(NORMALIZED_REPAIR).not.toMatch(/\bsecurity definer\b/);
    expect(NORMALIZED_REPAIR).not.toMatch(/\b(?:insert|update|delete)\s+(?:into|from|public\.)\b/);
  });
});
