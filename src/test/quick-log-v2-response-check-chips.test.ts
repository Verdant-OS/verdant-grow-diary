// Tranche B+ slice D7 — plant-scoped Better/Same/Worse in the V2 sheet.
//
// Closes the S4 status-parity gap: from tent context the grower could not
// record a plant response without navigating away or typing a note. The
// chips reuse the shipped pure rules and the canonical save contract; they
// only ever write the note the grower can see.
//
// Static-shape suite (the repo's convention for this file — the V2 sheet's
// behavioral coverage lives in the quick-log-v2-* render suites, which stay
// green unmodified).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { RESPONSE_CHECK_STATUSES, applyResponseCheck } from "@/lib/tenSecondQuickCheckRules";

const SHEET = readFileSync("src/components/QuickLogV2Sheet.tsx", "utf8");
const TENT_DETAIL = readFileSync("src/pages/TentDetail.tsx", "utf8");

describe("D7 — V2 sheet response-check chips", () => {
  it("reuses the shipped pure rules instead of restating the vocabulary", () => {
    expect(SHEET).toContain("RESPONSE_CHECK_STATUSES");
    expect(SHEET).toContain("applyResponseCheck");
    // The status words must never be hardcoded in the sheet.
    expect(SHEET).not.toMatch(/\[\s*"Better"\s*,\s*"Same"\s*,\s*"Worse"\s*\]/);
  });

  it("gates the chips on a resolved PLANT target", () => {
    expect(SHEET).toMatch(
      /showResponseCheck[\s\S]{0,200}resolvedTarget\.ok[\s\S]{0,80}resolvedTarget\.targetType === "plant"/,
    );
    // The maturity-evidence predicate is pinned elsewhere; keep it intact.
    expect(SHEET).toContain(
      'form.action !== "feed" && resolvedTarget.ok && resolvedTarget.targetType === "plant"',
    );
  });

  it("writes only through the note field the grower can see", () => {
    expect(SHEET).toMatch(/applyResponseCheck\(\s*form\.note\s*,\s*status\s*\)/);
    expect(SHEET).toMatch(/setField\("note",\s*applyResponseCheck/);
  });

  it("never pre-fills the note — the optional-note contract is preserved", () => {
    // A default/auto-applied status would break quick-log-v2-note-sync's
    // "Note then Save with nothing entered yields p_note null" contract.
    expect(SHEET).not.toMatch(/useEffect[\s\S]{0,200}applyResponseCheck/);
    expect(SHEET).not.toMatch(/note:\s*buildResponseCheckLine/);
  });

  it("keeps the chip row out of the pinned action-type group", () => {
    expect(SHEET).toContain('aria-label="Plant response check"');
    expect(SHEET).toContain('data-testid="qlv2-response-chips"');
  });

  it("locks the chips during an in-flight watering submission, like the note", () => {
    expect(SHEET).toMatch(/qlv2-response-chips[\s\S]{0,600}disabled=\{wateringSubmissionLocked\}/);
  });

  it("keeps the save contract unchanged — chips are note text, not a new action", () => {
    // No new action kind, no new RPC, no direct table write.
    expect(SHEET).not.toMatch(/p_action:\s*"(status|response)"/);
    expect(SHEET).not.toMatch(/from\("diary_entries"\)\s*\.\s*insert/);
  });
});

describe("D7 — sole-plant tent opens the sheet plant-scoped", () => {
  it("passes a plant target key when the tent has exactly one active plant", () => {
    // safePlantId is TentDetail's already-shipped sole-plant derivation (it
    // feeds the One-Tent loop card); reusing it keeps the S4 budget honest
    // without inventing a second inference.
    expect(TENT_DETAIL).toMatch(/defaultTargetKey=\{[\s\S]{0,120}safePlantId[\s\S]{0,120}\}/);
    expect(TENT_DETAIL).toMatch(/`plant:\$\{safePlantId\}`/);
    expect(TENT_DETAIL).toMatch(/`tent:\$\{tent\.id\}`/);
  });

  it("never invents a plant when the tent has several", () => {
    // safePlantId is null unless exactly one active plant exists, so the
    // expression must fall back to the tent key rather than picking a plant.
    expect(TENT_DETAIL).toMatch(
      /safePlantId\s*\?\s*`plant:\$\{safePlantId\}`\s*:\s*`tent:\$\{tent\.id\}`/,
    );
  });
});

describe("D7 — rules module behavior the chips depend on", () => {
  it("replaces rather than stacks a response line", () => {
    let note = "";
    for (const status of RESPONSE_CHECK_STATUSES) {
      note = applyResponseCheck(note, status);
    }
    expect(note.match(/Response check:/g)).toHaveLength(1);
    expect(note).toContain("Response check: Worse.");
  });

  it("produces saveable note text from zero typing", () => {
    const note = applyResponseCheck("", "Better");
    expect(note.trim().length).toBeGreaterThan(0);
    expect(note).toContain("Response check: Better.");
  });
});
