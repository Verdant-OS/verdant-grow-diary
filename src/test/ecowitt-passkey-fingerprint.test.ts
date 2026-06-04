import { describe, it, expect } from "vitest";
import {
  computeEcoWittPasskeyFingerprint,
  isEcoWittPasskeyFingerprint,
} from "@/lib/ecowittPasskeyFingerprint";

describe("computeEcoWittPasskeyFingerprint", () => {
  it("returns null for non-string / empty input", async () => {
    expect(await computeEcoWittPasskeyFingerprint(undefined)).toBeNull();
    expect(await computeEcoWittPasskeyFingerprint(null)).toBeNull();
    expect(await computeEcoWittPasskeyFingerprint("")).toBeNull();
    expect(await computeEcoWittPasskeyFingerprint("   ")).toBeNull();
    expect(await computeEcoWittPasskeyFingerprint(12345)).toBeNull();
  });

  it("is deterministic and shaped as ewfp_<24 hex>", async () => {
    const a = await computeEcoWittPasskeyFingerprint("ABCDEF0123456789");
    const b = await computeEcoWittPasskeyFingerprint("ABCDEF0123456789");
    expect(a).toBe(b);
    expect(a).toMatch(/^ewfp_[0-9a-f]{24}$/);
    expect(isEcoWittPasskeyFingerprint(a)).toBe(true);
  });

  it("never returns the raw passkey", async () => {
    const raw = "SUPER_SECRET_PASSKEY_VALUE";
    const fp = await computeEcoWittPasskeyFingerprint(raw);
    expect(fp).not.toContain(raw);
    expect(fp).not.toContain("SUPER");
  });

  it("differs for different passkeys", async () => {
    const a = await computeEcoWittPasskeyFingerprint("one");
    const b = await computeEcoWittPasskeyFingerprint("two");
    expect(a).not.toBe(b);
  });
});
