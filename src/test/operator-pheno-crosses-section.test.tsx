/**
 * OperatorPhenoCrossesSection — full-taxonomy render safety.
 *
 * Proves the Operator Mode presenter handles all 15 CrossType values,
 * renders optional metadata only when present, and falls back safely for
 * legacy/unknown types. No Supabase, no writes.
 */
import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import OperatorPhenoCrossesSection from "@/components/OperatorPhenoCrossesSection";
import { CROSS_TYPES } from "@/lib/genetics/breedingReproductionRules";
import type { CrossRow } from "@/lib/phenoKeepersService";

const NAMES: Record<string, string> = {
  "k-female": "Mother",
  "k-male": "Father",
  "k-rp": "Recurrent",
};
const lookup = (id: string | null | undefined) => (id && id in NAMES ? NAMES[id] : null);

function baseRow(over: Partial<CrossRow>): CrossRow {
  return {
    id: "cross-1",
    femaleKeeperId: "k-female",
    maleKeeperId: "k-male",
    crossType: "standard_f1",
    crossName: null,
    note: null,
    crossedAt: null,
    createdAt: null,
    channel: null,
    generation: null,
    recurrentParentId: null,
    ...over,
  };
}

describe("OperatorPhenoCrossesSection — taxonomy coverage", () => {
  it("renders a stable label + type name for all 15 cross types", () => {
    const crosses = CROSS_TYPES.map((t, i) =>
      baseRow({
        id: `x-${t}`,
        crossType: t,
        // Selfing has no male parent; open_pollination may not.
        maleKeeperId:
          t === "selfing_s1" || t === "selfing_sn" || t === "open_pollination" ? null : "k-male",
        // Satisfy the generation UI branch for the types that require it.
        generation:
          t === "filial" || t === "selfing_sn"
            ? 2
            : t === "backcross" || t === "feminized_bx"
              ? 1
              : null,
        recurrentParentId: t === "backcross" || t === "feminized_bx" ? "k-rp" : null,
      }),
    );
    const { getByTestId } = render(
      <OperatorPhenoCrossesSection crosses={crosses} keeperName={lookup} />,
    );
    for (const t of CROSS_TYPES) {
      const row = getByTestId(`operator-pheno-cross-x-${t}`);
      expect(row.getAttribute("data-cross-type-known")).toBe("true");
      // Badge is always populated (never blank).
      const badge = within(row).getByTestId(`operator-pheno-cross-badge-x-${t}`);
      expect((badge.textContent ?? "").trim().length).toBeGreaterThan(0);
      // Type name renders and is non-empty.
      expect(
        (within(row).getByTestId(`operator-pheno-cross-type-name-x-${t}`).textContent ?? "").trim()
          .length,
      ).toBeGreaterThan(0);
    }
    // Recurrent parent row appears only for backcross / feminized_bx.
    for (const t of CROSS_TYPES) {
      const row = getByTestId(`operator-pheno-cross-x-${t}`);
      const rp = within(row).queryByTestId(`operator-pheno-cross-recurrent-x-${t}`);
      if (t === "backcross" || t === "feminized_bx") {
        expect(rp).not.toBeNull();
      } else {
        expect(rp).toBeNull();
      }
    }
  });

  it("renders the EXACT canonical lineage badge (generation- and feminization-aware)", () => {
    // Regression guard: the operator badge used to concatenate the generation
    // onto the placeholder label ("F2+" + 3 = "F2+3", "S2+" + 4 = "S2+4") and
    // ignore the channel (a feminized F2/BX looked identical to a regular one).
    // It now routes through the shared crossLineageBadge, so these must be the
    // real designations, byte-for-byte matching the keepers page / cross form.
    const cases: Array<{ id: string; row: Partial<CrossRow>; badge: string }> = [
      { id: "f1", row: { crossType: "standard_f1" }, badge: "F1" },
      { id: "f3", row: { crossType: "filial", generation: 3 }, badge: "F3" },
      { id: "s1", row: { crossType: "selfing_s1", maleKeeperId: null }, badge: "S1 / Selfed" },
      {
        id: "s4",
        row: { crossType: "selfing_sn", maleKeeperId: null, generation: 4 },
        badge: "S4",
      },
      {
        id: "bx2",
        row: { crossType: "backcross", generation: 2, recurrentParentId: "k-rp" },
        badge: "BX2",
      },
      {
        id: "fbx1",
        row: { crossType: "feminized_bx", generation: 1, recurrentParentId: "k-rp" },
        badge: "Fem BX1",
      },
      { id: "fem", row: { crossType: "feminized_cross", channel: "sts" }, badge: "Feminized" },
      // A reversal-channel (feminized) filial / backcross gets the "Fem " prefix.
      { id: "femf2", row: { crossType: "filial", generation: 2, channel: "sts" }, badge: "Fem F2" },
      {
        id: "membx2",
        row: {
          crossType: "backcross",
          generation: 2,
          channel: "colloidal_silver",
          recurrentParentId: "k-rp",
        },
        badge: "Fem BX2",
      },
      // A regular-channel filial stays plain (never labeled feminized).
      {
        id: "regf2",
        row: { crossType: "filial", generation: 2, channel: "natural_male" },
        badge: "F2",
      },
    ];
    const { getByTestId } = render(
      <OperatorPhenoCrossesSection
        crosses={cases.map((c) => baseRow({ id: c.id, ...c.row }))}
        keeperName={lookup}
      />,
    );
    for (const c of cases) {
      const badge = getByTestId(`operator-pheno-cross-badge-${c.id}`);
      expect((badge.textContent ?? "").trim(), `badge for ${c.id}`).toBe(c.badge);
    }
  });

  it("selfing rows render Self / S1 (never blank donor)", () => {
    const { getByTestId } = render(
      <OperatorPhenoCrossesSection
        crosses={[
          baseRow({ id: "s1", crossType: "selfing_s1", maleKeeperId: null }),
          baseRow({
            id: "sn",
            crossType: "selfing_sn",
            maleKeeperId: null,
            generation: 3,
          }),
        ]}
        keeperName={lookup}
      />,
    );
    const s1 = getByTestId("operator-pheno-cross-donor-s1");
    expect(s1.getAttribute("data-donor-kind")).toBe("self");
    expect(s1.textContent ?? "").toMatch(/self/i);
    const sn = getByTestId("operator-pheno-cross-donor-sn");
    expect(sn.textContent ?? "").toMatch(/self/i);
    // Generation renders for selfing_sn.
    expect((getByTestId("operator-pheno-cross-generation-sn").textContent ?? "").trim()).toMatch(
      /Generation:\s*3/,
    );
    // No blank / broken donor markers.
    expect(s1.textContent ?? "").not.toMatch(/^\s*$/);
  });

  it("open pollination without a named male shows 'Open pollen', not blank", () => {
    const { getByTestId } = render(
      <OperatorPhenoCrossesSection
        crosses={[baseRow({ id: "op", crossType: "open_pollination", maleKeeperId: null })]}
        keeperName={lookup}
      />,
    );
    const donor = getByTestId("operator-pheno-cross-donor-op");
    expect(donor.getAttribute("data-donor-kind")).toBe("open");
    expect(donor.textContent ?? "").toMatch(/open pollen/i);
  });

  it("channel + generation render only when present; absence omits cleanly", () => {
    const { getByTestId, queryByTestId } = render(
      <OperatorPhenoCrossesSection
        crosses={[
          baseRow({
            id: "with",
            crossType: "feminized_cross",
            channel: "sts",
          }),
          baseRow({ id: "without", crossType: "standard_f1" }),
        ]}
        keeperName={lookup}
      />,
    );
    expect(getByTestId("operator-pheno-cross-channel-with").textContent ?? "").toMatch(/STS/i);
    // No channel for the second row.
    expect(queryByTestId("operator-pheno-cross-channel-without")).toBeNull();
    // No generation for either — neither cross_type carries one.
    expect(queryByTestId("operator-pheno-cross-generation-with")).toBeNull();
    expect(queryByTestId("operator-pheno-cross-generation-without")).toBeNull();
  });

  it("recurrent_parent_id renders only for backcross / feminized_bx", () => {
    const { getByTestId, queryByTestId } = render(
      <OperatorPhenoCrossesSection
        crosses={[
          baseRow({
            id: "bx",
            crossType: "backcross",
            generation: 2,
            recurrentParentId: "k-rp",
          }),
          baseRow({ id: "std", crossType: "standard_f1" }),
        ]}
        keeperName={lookup}
      />,
    );
    expect(getByTestId("operator-pheno-cross-recurrent-bx").textContent ?? "").toMatch(
      /Recurrent/i,
    );
    expect(queryByTestId("operator-pheno-cross-recurrent-std")).toBeNull();
  });

  it("invalid cross_type falls back safely (no crash, generic label)", () => {
    const { getByTestId } = render(
      <OperatorPhenoCrossesSection
        crosses={[baseRow({ id: "bad", crossType: "not_a_real_type" as unknown as string })]}
        keeperName={lookup}
      />,
    );
    const row = getByTestId("operator-pheno-cross-bad");
    expect(row.getAttribute("data-cross-type-known")).toBe("false");
    expect(row.textContent ?? "").toMatch(/Cross/);
  });

  it("empty crosses renders empty-state, never a broken list", () => {
    const { getByTestId, queryByTestId } = render(
      <OperatorPhenoCrossesSection crosses={[]} keeperName={lookup} />,
    );
    expect(getByTestId("operator-pheno-crosses-empty")).toBeInTheDocument();
    expect(queryByTestId("operator-pheno-crosses-list")).toBeNull();
  });
});
