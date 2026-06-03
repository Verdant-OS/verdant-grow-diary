/**
 * Confirms QuickLog validation preview:
 *  - shows the affirmative "Note captured." info when note text exists
 *  - does NOT include "Add a quick note before saving." when note exists
 *  - still surfaces the missing-note hint when blank
 */
import { describe, it, expect } from "vitest";
import { evaluateQuickLogPreview } from "@/lib/quickLogPreviewRules";

describe("quickLogPreviewRules — note presence", () => {
  it("note text present → 'Note captured.' info, no 'Add a quick note' hint", () => {
    const r = evaluateQuickLogPreview({ note: "watered 500ml", eventType: "observation" });
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain("note:ok");
    expect(codes).not.toContain("note:missing");
    const ok = r.warnings.find((w) => w.code === "note:ok");
    expect(ok?.severity).toBe("info");
    expect(ok?.message).toBe("Note captured.");
    expect(r.warnings.find((w) => w.code === "note:missing")?.message).toBeUndefined();
  });

  it("whitespace-only note → still treated as missing", () => {
    const r = evaluateQuickLogPreview({ note: "   \n  ", eventType: "observation" });
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain("note:missing");
    expect(codes).not.toContain("note:ok");
  });

  it("empty note → 'Add a quick note before saving.' hint remains", () => {
    const r = evaluateQuickLogPreview({ note: "", eventType: "observation" });
    const missing = r.warnings.find((w) => w.code === "note:missing");
    expect(missing?.message).toBe("Add a quick note before saving.");
    expect(missing?.severity).toBe("info");
  });
});
