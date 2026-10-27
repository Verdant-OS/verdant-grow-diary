import { describe, expect, it } from "vitest";

import { buildFeedLogTsv, createDefaultFeedLogState } from "@/lib/publicFeedLogRules";

describe("feed log TSV formula guard", () => {
  it("prefixes formula cells on copy and leaves plain signed numbers alone", () => {
    const state = createDefaultFeedLogState();
    state.weeks[0].notes = "=1+1";
    state.weeks[1].notes = "@x";
    state.weeks[2].notes = "+SUM(A1)";
    state.weeks[3].notes = "-2+3";
    state.weeks[4].notes = "\tcmd";
    state.weeks[5].notes = "\rnote";
    state.weeks[6].notes = "+1.50";
    state.weeks[7].notes = "-0.5";
    state.weeks[8].notes = "2.5";
    const rows = buildFeedLogTsv(state).split("\n");
    const notes = rows.slice(1).map((row) => row.split("\t").at(-1));
    expect(notes[0]).toBe("'=1+1");
    expect(notes[1]).toBe("'@x");
    expect(notes[2]).toBe("'+SUM(A1)");
    expect(notes[3]).toBe("'-2+3");
    expect(notes[4]).toBe("' cmd");
    expect(notes[5]).toBe("' note");
    expect(notes[6]).toBe("+1.50");
    expect(notes[7]).toBe("-0.5");
    expect(notes[8]).toBe("2.5");
  });
});
