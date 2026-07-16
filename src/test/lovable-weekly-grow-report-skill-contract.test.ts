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
});
