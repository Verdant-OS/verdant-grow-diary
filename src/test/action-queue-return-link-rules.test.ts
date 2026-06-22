import { describe, it, expect } from "vitest";
import {
  buildActionsReturnRelativePath,
  parseActionsReturnParam,
  isSafeActionsReturnPath,
  resolveBackToActionsHref,
  ACTIONS_RETURN_ALLOWED_KEYS,
} from "@/lib/actionQueueReturnLinkRules";

describe("buildActionsReturnRelativePath", () => {
  it("returns bare /actions when nothing safe is present", () => {
    expect(buildActionsReturnRelativePath(null)).toBe("/actions");
    expect(buildActionsReturnRelativePath(new URLSearchParams())).toBe(
      "/actions",
    );
  });

  it("preserves only allow-listed keys", () => {
    const sp = new URLSearchParams(
      "q=mold&status=approved&trace=failed&page=2&pageSize=25&secret=abc&focus=raw-id",
    );
    const path = buildActionsReturnRelativePath(sp);
    expect(path.startsWith("/actions?")).toBe(true);
    expect(path).toContain("q=mold");
    expect(path).toContain("status=approved");
    expect(path).toContain("trace=failed");
    expect(path).toContain("page=2");
    expect(path).toContain("pageSize=25");
    expect(path).not.toContain("secret=");
    expect(path).not.toContain("focus=");
  });

  it("never preserves raw_payload-shaped or token-shaped keys", () => {
    const sp = new URLSearchParams(
      "raw_payload=%7B%7D&service_role=xx&bridge_token=yy&access_token=zz",
    );
    expect(buildActionsReturnRelativePath(sp)).toBe("/actions");
  });

  it("clamps a too-long value to a safe length", () => {
    const big = "a".repeat(500);
    const sp = new URLSearchParams();
    sp.set("q", big);
    const path = buildActionsReturnRelativePath(sp);
    // Sanitize trims to 80 chars per value.
    const qVal = new URL(`http://x${path}`).searchParams.get("q") ?? "";
    expect(qVal.length).toBeLessThanOrEqual(80);
  });

  it("allow-list snapshot stays minimal and audited", () => {
    expect(ACTIONS_RETURN_ALLOWED_KEYS).toEqual([
      "q",
      "status",
      "trace",
      "page",
      "pageSize",
      "view",
      "growId",
    ]);
  });
});

describe("isSafeActionsReturnPath / parseActionsReturnParam", () => {
  it("accepts /actions and /actions?…", () => {
    expect(isSafeActionsReturnPath("/actions")).toBe(true);
    expect(isSafeActionsReturnPath("/actions?q=mold")).toBe(true);
    expect(parseActionsReturnParam("/actions?q=mold")).toBe("/actions?q=mold");
  });

  it("rejects unsafe values", () => {
    for (const bad of [
      "http://evil.com/actions",
      "https://evil.com/actions",
      "//evil.com/actions",
      "javascript:alert(1)",
      "data:text/html,evil",
      "/dashboard",
      "/actions-evil",
      "/actionsfoo",
      "actions",
      "",
      "/\u0000actions",
    ]) {
      expect(isSafeActionsReturnPath(bad), `should reject: ${bad}`).toBe(false);
      expect(parseActionsReturnParam(bad)).toBeNull();
    }
  });

  it("handles encoded values defensively", () => {
    expect(parseActionsReturnParam("%2Factions%3Fq%3Dmold")).toBe(
      "/actions?q=mold",
    );
  });
});

describe("resolveBackToActionsHref", () => {
  it("returns provided=true for a safe path", () => {
    const r = resolveBackToActionsHref("/actions?q=mold&page=2");
    expect(r.wasProvided).toBe(true);
    expect(r.href).toBe("/actions?q=mold&page=2");
  });

  it("falls back to bare /actions for missing or unsafe values", () => {
    for (const bad of [null, "", "javascript:alert(1)", "http://e.com"]) {
      const r = resolveBackToActionsHref(bad as string | null);
      expect(r.wasProvided).toBe(false);
      expect(r.href).toBe("/actions");
    }
  });
});
