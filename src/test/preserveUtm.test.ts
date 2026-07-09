/**
 * preserveUtm — pure helper unit tests.
 */
import { describe, it, expect } from "vitest";
import { pickSafeUtmParams, preserveUtmOnUrl, SAFE_UTM_KEYS } from "@/lib/utm/preserveUtm";

describe("pickSafeUtmParams", () => {
  it("returns empty object for null/empty input", () => {
    expect(pickSafeUtmParams(null)).toEqual({});
    expect(pickSafeUtmParams("")).toEqual({});
    expect(pickSafeUtmParams(undefined)).toEqual({});
  });

  it("keeps only allow-listed utm_* keys", () => {
    const out = pickSafeUtmParams(
      "?utm_source=a&utm_medium=b&utm_campaign=c&utm_content=d&utm_term=e&extra=nope&session=leak",
    );
    for (const key of SAFE_UTM_KEYS) expect(out[key]).toBeDefined();
    expect((out as Record<string, string>).extra).toBeUndefined();
    expect((out as Record<string, string>).session).toBeUndefined();
  });

  it("truncates oversized values to 256 chars", () => {
    const big = "x".repeat(1000);
    const out = pickSafeUtmParams(`?utm_source=${big}`);
    expect(out.utm_source?.length).toBe(256);
  });

  it("drops empty utm values", () => {
    expect(pickSafeUtmParams("?utm_source=")).toEqual({});
  });
});

describe("preserveUtmOnUrl", () => {
  it("returns null for non-http(s) targets", () => {
    expect(preserveUtmOnUrl("javascript:alert(1)", "?utm_source=a")).toBeNull();
    expect(preserveUtmOnUrl("mailto:test@x.com", "?utm_source=a")).toBeNull();
    expect(preserveUtmOnUrl("", "?utm_source=a")).toBeNull();
  });

  it("appends allow-listed utm_* onto the target", () => {
    const out = preserveUtmOnUrl(
      "https://forms.example.com/beta",
      "?utm_source=post&utm_medium=creator&extra=drop",
    );
    const url = new URL(out!);
    expect(url.searchParams.get("utm_source")).toBe("post");
    expect(url.searchParams.get("utm_medium")).toBe("creator");
    expect(url.searchParams.get("extra")).toBeNull();
  });

  it("target's own params win over incoming utm_*", () => {
    const out = preserveUtmOnUrl(
      "https://forms.example.com/beta?utm_source=intake",
      "?utm_source=post",
    );
    expect(new URL(out!).searchParams.get("utm_source")).toBe("intake");
  });

  it("returns the target unchanged when no utm_* are present", () => {
    const out = preserveUtmOnUrl("https://forms.example.com/beta", "");
    expect(out).toBe("https://forms.example.com/beta");
  });
});
