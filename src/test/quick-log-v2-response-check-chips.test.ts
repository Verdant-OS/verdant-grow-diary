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

import { stripSourceComments } from "./utils/stripSourceComments";

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
    // Pin updated (not loosened) when the handler gained an overflow guard:
    // the chip now computes the candidate first and writes it through the same
    // visible note field. Both halves of the original intent are still pinned —
    // the value comes from applyResponseCheck(form.note, status), and the only
    // write is setField("note", ...).
    expect(SHEET).toMatch(/applyResponseCheck\(\s*form\.note\s*,\s*status\s*\)/);
    expect(SHEET).toMatch(/setField\("note",\s*next\s*\)/);
    // No other field may be written from the chip handler.
    expect(SHEET).not.toMatch(/onClick=\{\(\) => setField\("(?!note)/);
  });

  it("refuses the chip instead of overflowing NOTE_LIMIT — per status", () => {
    // `maxLength` bounds typing only. Prepending the response line to a
    // near-limit note would push the note past the limit the watering write
    // enforces, and that rejection locks the retry record and costs the draft.
    //
    // Renegotiated: the guard was an aggregate `some(...)` across all three
    // statuses, which disabled every chip as soon as the LONGEST line
    // overflowed — taking away choices that still fit. The lines differ in
    // length, so the decision has to be per status.
    expect(SHEET).toMatch(/responseCheckOverflowByStatus[\s\S]{0,300}> NOTE_LIMIT/);
    // Guarded at BOTH the disabled state and the handler.
    expect(SHEET).toMatch(/disabled=\{[\s\S]{0,200}responseCheckOverflowByStatus\.get\(status\)/);
    expect(SHEET).toMatch(/if \(next\.length > NOTE_LIMIT\) return;/);
    // The aggregate survives only where it is correct: the "shorten it first"
    // copy, which should appear only when NO status fits.
    expect(SHEET).toMatch(
      /everyResponseCheckOverflows[\s\S]{0,120}too long to add a response line/,
    );
    // And the old all-or-nothing gate cannot come back.
    expect(SHEET).not.toMatch(/const responseCheckOverflows =/);
    expect(SHEET).not.toMatch(/disabled=\{[\s\S]{0,200}responseCheckOverflows &&/);
  });

  it("clears the plant response marker when the target stops being a plant", () => {
    // A response marker describes a plant; leaving it on a tent-scoped entry
    // would mislabel the row for every downstream response parser.
    //
    // Renegotiated: the guard was "the chips are absent", which fires on every
    // keystroke of a tent-scoped note. `readResponseCheckStatus` matches
    // anywhere in the text, so ordinary prose ("Previous response check:
    // better after watering") was silently rewritten. It now fires only on the
    // plant -> non-plant TRANSITION.
    // Keyed on the PLANT the marker describes, not on chip visibility: the
    // chips stay visible across plant A -> plant B, so a visibility guard
    // silently reattributes A's response to B.
    // Comments stripped and whitespace collapsed: these pins are about the
    // EXECUTABLE shape, so an explanatory comment between two statements must
    // not be able to break one and teach the next person to relax it.
    const flat = stripSourceComments(SHEET).replace(/\s+/g, " ");
    // Keyed on the plant the TARGET names, independent of chip visibility.
    // Switching the action to Feed hides the chips without changing which
    // plant the entry is about, and must not read as a retarget.
    expect(flat).toMatch(
      /const responseTargetPlantId = resolvedTarget\.ok && resolvedTarget\.targetType === "plant" \? \(resolvedTarget\.plantId \?\? null\) : null;/,
    );
    expect(flat).toMatch(
      /const previousPlantId = responseTargetPlantIdRef\.current; responseTargetPlantIdRef\.current = responseTargetPlantId;/,
    );
    expect(flat).toMatch(
      /if \(previousPlantId === null \|\| previousPlantId === responseTargetPlantId\) return;/,
    );
    // PROVENANCE: only a marker a CHIP wrote may be stripped. Prose the grower
    // typed that merely reads like one is never touched.
    expect(flat).toMatch(/chipAuthoredStatusRef\.current = status; setField\("note", next\);/);
    expect(flat).toMatch(
      /const authored = chipAuthoredStatusRef\.current; chipAuthoredStatusRef\.current = null; if \(!authored\) return; const next = removeChipAuthoredResponseLine\(form\.note, authored\); if \(next === form\.note\) return; setField\("note", next\);/,
    );
    // The whole-note strip cannot come back: it deletes a grower's later
    // sentence that merely reads like a marker.
    expect(flat).not.toMatch(/actionTextWithoutResponseContext\(form\.note\)/);
    // Provenance is per DRAFT: it must be cleared wherever a draft resets, or
    // a stale status would let the cleanup strip the NEXT draft's prose.
    expect(flat.match(/chipAuthoredStatusRef\.current = null;/g) ?? []).toHaveLength(3);
    // No retired guard can come back: the unconditional "chips absent" form,
    // the visibility-only transition form, or a strip with no provenance.
    expect(SHEET).not.toMatch(/^\s*if \(showResponseCheck\) return;\s*$/m);
    expect(flat).not.toMatch(/if \(!wasVisible \|\| showResponseCheck\) return;/);
    expect(flat).not.toMatch(
      /previousPlantId === responseTargetPlantId\) return; if \(!readResponseCheckStatus/,
    );
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
    // Pin updated (not loosened): the disabled expression gained the overflow
    // clause, so `wateringSubmissionLocked` is now the FIRST term of a
    // disjunction rather than the whole value. The lock itself is unchanged.
    expect(SHEET).toMatch(
      /qlv2-response-chip[\s\S]{0,600}disabled=\{[\s\S]{0,80}wateringSubmissionLocked/,
    );
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

  it("never infers a plant from an unsettled roster", () => {
    // A cached one-plant result rendered during a refetch can be wrong, and
    // QuickLogV2Fab freezes whatever key it is handed at click time — so a
    // stale inference would outlive the refetch. The count must come from
    // `resolveVerifiedAssignedPlantCount`, which returns null for EVERY
    // non-current query state (loading, pending, fetching, error,
    // placeholder), not from a raw `.length` read.
    expect(TENT_DETAIL).toMatch(
      /const verifiedActivePlantCount = resolveVerifiedAssignedPlantCount\(activePlantsQuery\)/,
    );
    expect(TENT_DETAIL.replace(/\s+/g, " ")).toMatch(
      /const safePlantId = verifiedActivePlantCount === 1 \? \(activePlants\[0\]\?\.id \?\? null\) : null;/,
    );
    // The raw length read cannot come back.
    expect(TENT_DETAIL).not.toMatch(/const safePlantId = activePlants\.length === 1/);
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
