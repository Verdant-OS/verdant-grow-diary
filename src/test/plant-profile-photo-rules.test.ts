/**
 * Plant profile photo — pure-rule tests for set / update / clear.
 *
 * Asserts the smallest contract that unblocks the slice:
 *  - Blank / whitespace / non-string → CLEAR (photo_url: null).
 *  - http(s) URLs → SET.
 *  - data:image/* URLs → SET.
 *  - Unsafe protocols (javascript:, file:, blob:, ftp:) → REJECT.
 *  - Garbage strings → REJECT (invalid-url).
 *  - Oversized strings → REJECT (too-long).
 *  - Never throws; never mutates input.
 *  - Never emits any "live", "csv", or sensor-source labels.
 */
import { describe, it, expect } from "vitest";
import { normalizePlantProfilePhotoInput } from "@/lib/plantProfilePhotoRules";

describe("normalizePlantProfilePhotoInput — clear cases", () => {
  it.each(["", "   ", "\n\t  "])(
    "blank input %p → clear / null",
    (raw) => {
      const out = normalizePlantProfilePhotoInput(raw);
      expect(out).toEqual({ ok: true, kind: "clear", photo_url: null });
    },
  );

  it.each([null, undefined, 42, {}, [], true])(
    "non-string input %p → clear / null",
    (raw) => {
      const out = normalizePlantProfilePhotoInput(raw);
      expect(out).toEqual({ ok: true, kind: "clear", photo_url: null });
    },
  );
});

describe("normalizePlantProfilePhotoInput — set cases", () => {
  it.each([
    "https://example.com/p.jpg",
    "http://localhost:3000/p.png",
    "https://cdn.example.com/path/photo.webp?v=1",
  ])("safe http(s) URL %p → set", (raw) => {
    const out = normalizePlantProfilePhotoInput(raw);
    expect(out.ok).toBe(true);
    if (out.ok === true && out.kind === "set") {
      expect(out.photo_url).toBe(raw);
    } else {
      throw new Error("expected set");
    }
  });

  it("data:image/png URL → set", () => {
    const raw = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA";
    const out = normalizePlantProfilePhotoInput(raw);
    expect(out).toEqual({ ok: true, kind: "set", photo_url: raw });
  });

  it("trims surrounding whitespace before classifying", () => {
    const out = normalizePlantProfilePhotoInput("  https://x.test/a.jpg  ");
    expect(out).toEqual({
      ok: true,
      kind: "set",
      photo_url: "https://x.test/a.jpg",
    });
  });
});

describe("normalizePlantProfilePhotoInput — reject unsafe / invalid", () => {
  it.each([
    "javascript:alert(1)",
    "file:///etc/passwd",
    "blob:https://x.test/abc",
    "ftp://example.com/p.jpg",
    "data:text/html,<script>",
  ])("unsafe protocol %p → reject", (raw) => {
    const out = normalizePlantProfilePhotoInput(raw);
    expect(out.ok).toBe(false);
  });

  it("garbage string → invalid-url", () => {
    const out = normalizePlantProfilePhotoInput("not a url at all");
    expect(out).toEqual({ ok: false, reason: "invalid-url" });
  });

  it("oversized string → too-long", () => {
    const out = normalizePlantProfilePhotoInput(
      "https://x.test/" + "a".repeat(3000),
    );
    expect(out).toEqual({ ok: false, reason: "too-long" });
  });
});

describe("safety guarantees", () => {
  it("never throws across a wide range of inputs", () => {
    const inputs: unknown[] = [
      null,
      undefined,
      "",
      "https://x",
      "javascript:1",
      Symbol("s"),
      () => null,
      new Date(),
      NaN,
    ];
    for (const i of inputs) {
      expect(() => normalizePlantProfilePhotoInput(i)).not.toThrow();
    }
  });

  it("does not mutate frozen input", () => {
    const raw = Object.freeze({ s: "https://x.test/p.jpg" });
    normalizePlantProfilePhotoInput(raw.s);
    expect(raw.s).toBe("https://x.test/p.jpg");
  });

  it("output never contains sensor/source/secret-looking labels", () => {
    const out = normalizePlantProfilePhotoInput("https://x.test/p.jpg");
    const j = JSON.stringify(out);
    expect(j).not.toMatch(/source|live|csv|raw_payload|jwt|bearer|sk_/i);
  });
});
