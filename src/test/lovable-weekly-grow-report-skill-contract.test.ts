import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SKILL = readFileSync(
  resolve(process.cwd(), ".agents/skills/weekly-grow-report/SKILL.md"),
  "utf8",
);

describe("Lovable weekly grow report skill contract", () => {
  it("states current repo seams without inventing a shipped report or timeline filters", () => {
    expect(SKILL).toMatch(/build contract, not proof that a weekly-report page/);
    expect(SKILL).toMatch(/does not fetch or\s+union every event table/);
    expect(SKILL).toMatch(/does \*\*not\*\* currently implement report date-range/);
    expect(SKILL).toMatch(/no general weekly Action Queue aggregate hook/);
    expect(SKILL).not.toContain("event_types[]");
    expect(SKILL).not.toContain("reuse the diary timeline filters already");
  });

  it("uses explicit, DST-safe 7-calendar-day windows", () => {
    expect(SKILL).toMatch(/7 local calendar days/);
    expect(SKILL).toMatch(/half-open instants: `\[start, nextDayStart\)`/);
    expect(SKILL).toMatch(/167- or 169-hour weeks/);
    expect(SKILL).toMatch(/does not currently persist a\s+grower timezone/);
    expect(SKILL).toMatch(/block all report generation/);
    expect(SKILL).toMatch(/Do not silently fall back to the server timezone/);
    expect(SKILL).toMatch(/14-day or\s+arbitrary-length report is a future slice/);
  });

  it("prevents biased and undefined comparison math", () => {
    expect(SKILL).toMatch(/Within each source series, aggregate raw\s+eligible readings/);
    expect(SKILL).toMatch(/deterministic equal-source rule/);
    expect(SKILL).toMatch(/Treat numeric zero as observed data/);
    expect(SKILL).toMatch(
      /If current data exists but prior data is unavailable, preserve the current value/,
    );
    expect(SKILL).toMatch(/verified zero prior value preserves both values and the absolute delta/);
    expect(SKILL).toMatch(/union of covered time buckets/);
    expect(SKILL).toMatch(/never sum three overlapping hour counts/);
    expect(SKILL).toMatch(
      /Do not compare averages when the\s+configured coverage floor is not\s+met/,
    );
  });

  it("requires a source contribution ledger without inventing diary back-pointers", () => {
    expect(SKILL).toMatch(/typed contribution ledger in pure rules/);
    expect(SKILL).toMatch(
      /raw sensor reading without that\s+back-pointer stays in the contribution drawer/,
    );
    expect(SKILL).toMatch(/Do not claim nonexistent filters/);
    expect(SKILL).toMatch(/currently supported scope parameters \(`growId`, `plantId`, `tentId`/);
    expect(SKILL).toMatch(/never manufacture a diary row/);
  });

  it("matches current Action Queue statuses and keeps route data private", () => {
    expect(SKILL).toContain(
      "`pending_approval | approved | rejected | simulated | completed | cancelled`",
    );
    expect(SKILL).not.toContain("Action Queue items: pending / approved / dismissed");
    expect(SKILL).toMatch(/Opaque IDs already required by canonical private app\s+routes/);
    expect(SKILL).toMatch(/Never\s+put them in analytics properties/);
  });

  it("distinguishes stable report selection from changing source content", () => {
    expect(SKILL).toMatch(/\*\*Report key:\*\*/);
    expect(SKILL).toMatch(/\*\*Content version ID:\*\*/);
    expect(SKILL).toMatch(
      /canonical serialization\s+of every sorted normalized, output-affecting contribution field/,
    );
    expect(SKILL).toMatch(/References and timestamps alone are insufficient/);
    expect(SKILL).toMatch(/late entry or corrected content changes this ID/);
    expect(SKILL).toMatch(/Foundation-first implementation sequence/);
  });

  it("keeps report time preferences explicit, validated, and uniformly applied", () => {
    expect(SKILL).toMatch(/Report time preferences \(grower-facing setting — authorized slice\)/);
    expect(SKILL).toMatch(/validated browser zone remains the only source/);
    expect(SKILL).toMatch(/\[boundaryInstant\(D\), boundaryInstant\(D \+ 1\)\)/);
    // DST-safe construction: wall-clock resolution, never elapsed-hours math.
    expect(SKILL).toMatch(/never\s+midnight-plus-elapsed-hours arithmetic/);
    expect(SKILL).toMatch(/first instant after the gap/);
    expect(SKILL).toMatch(/occurs twice \(fall-back overlap\), use the earlier instant/);
    expect(SKILL).toMatch(/Mixed-boundary comparisons\s+are forbidden/);
    expect(SKILL).toMatch(/Days run\s+06:00 → 06:00 local/);
    expect(SKILL).toMatch(/never a\s+silent fallback/);
    // The selected zone governs every selection surface — the browser zone
    // is only the fallback (PR #260 review finding).
    expect(SKILL).toMatch(/\*\*Effective report timezone\.\*\*/);
    expect(SKILL).toMatch(/governs every\s+selection surface/);
    expect(SKILL).toMatch(
      /No control may consult the raw browser zone directly\s+once a valid preference exists/,
    );
    expect(SKILL).toMatch(/current report day in the \*\*effective report timezone\*\*/);
    expect(SKILL).toMatch(
      /The effective report\s+timezone is displayed and is part of the report key/,
    );
    // Non-midnight boundaries: "today" always means the current report day,
    // so a selected window can never include time that has not begun.
    expect(SKILL).toMatch(/\*\*Current report day\.\*\*/);
    expect(SKILL).toMatch(/never the raw calendar date/);
    expect(SKILL).toMatch(/never include report-day time that has not yet begun/);
    expect(SKILL).toMatch(/Max selectable end date = the \*\*current report day\*\*/);
    // Selecting the still-open report day is an explicitly partial window
    // truncated at now — never a window that runs into the future, and
    // never a part-day silently compared against full days.
    expect(SKILL).toMatch(/explicitly partial window\*\* whose upper bound is now/);
    expect(SKILL).toMatch(/"partial — through <local time>"/);
    expect(SKILL).toMatch(/un-elapsed time as outside the window, never as missing data/);
    expect(SKILL).toMatch(/Never generate a report for a window that includes time later than now/);
    // Shared-browser safety: stored preferences are partitioned per grower.
    expect(SKILL).toMatch(/scoped to the signed-in user's ID\*\*/);
    expect(SKILL).toMatch(/never read, rendered, or\s+applied/);
    // Device-local only; account-synced persistence stays a separate slice.
    expect(SKILL).toMatch(/do not add tables for this slice/);
    // The original never-infer + no-server-persistence truths must survive.
    expect(SKILL).toMatch(/does not currently persist a\s+grower timezone/);
  });

  it("keeps plant scope honest about attribution and tent-level environment", () => {
    expect(SKILL).toMatch(/Plant scope selector \(grower-facing control — authorized slice\)/);
    expect(SKILL).toMatch(
      /excluded\s+from the single-plant view and surfaced in "Missing this week"/,
    );
    expect(SKILL).toMatch(/never silently attributed to the plant/);
    expect(SKILL).toMatch(/readings are tent-level, not\s+plant-specific/);
    expect(SKILL).toMatch(/never borrows tent-level events/);
    expect(SKILL).toMatch(/plant scope is part of the report key/);
  });

  it("keeps saved presets device-local, validated, and judgment-free", () => {
    expect(SKILL).toMatch(/Saved report presets \(grower-facing control — authorized slice\)/);
    expect(SKILL).toMatch(
      /referenced\s+from the current report time preferences at apply time, never frozen/,
    );
    expect(SKILL).toMatch(/re-validated on load like fresh input/);
    expect(SKILL).toMatch(/never falls back\s+to another plant/);
    expect(SKILL).toMatch(/never appear in URLs, analytics, or logs/);
    expect(SKILL).toMatch(/never a database write/);
    expect(SKILL).toMatch(/At most 20 presets/);
    // The ordering's created-at is an explicitly stored selection field.
    expect(SKILL).toMatch(
      /created-at timestamp \(selection metadata used only for the\s+deterministic ordering/,
    );
  });

  it("keeps PDF export a client-side projection of the same report", () => {
    expect(SKILL).toMatch(/One-click PDF export \(authorized slice\)/);
    expect(SKILL).toMatch(/projection of the same data — never a second computation/);
    expect(SKILL).toMatch(/No\s+server round-trip, no external rendering service/);
    expect(SKILL).toMatch(
      /no canvas rasterization of any\s+chart that carries contribution drill-down/,
    );
    // Honest affordance: the print pipeline is one confirm away, not a
    // one-click download; only the library path may claim one click.
    expect(SKILL).toMatch(/one confirm away from a PDF,\s+not a one-click download/);
    expect(SKILL).toMatch(/never promising a download\s+the pipeline cannot deliver/);
    // Determinism is per generated report and scoped to what the app
    // controls: markup on the print path, bytes on the library path.
    expect(SKILL).toMatch(/deterministic print markup/);
    expect(SKILL).toMatch(/outside app control and carry no\s+byte-identity claim/);
    expect(SKILL).toMatch(
      /On the library path, exporting the same generated\s+report twice yields byte-identical files/,
    );
    expect(SKILL).toMatch(/regenerating the report is what\s+changes it, never re-exporting it/);
    expect(SKILL).toMatch(/no server-side PDF service is ever\s+added/);
    expect(SKILL).toMatch(/Never hashes, opaque IDs, emails, or grower notes in the filename/);
  });
});
