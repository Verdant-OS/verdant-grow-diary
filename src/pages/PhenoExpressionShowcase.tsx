/**
 * PhenoExpressionShowcase — /pheno-expression-showcase
 *
 * A read-only DEMO surface: ten example phenos spanning the full expression
 * spectrum (loud gas, dessert, fruit, yield-monster, frost bomb, a
 * herm-flagged beauty, a runt, a balanced hold, a divisive funk, a purple
 * pheno). Toggle any combination to read their expressions against one another.
 *
 * Fixture-only and network-free: no fetch, no Supabase, no AI, no writes. The
 * checkboxes only change which fixtures are shown — they never persist
 * anything. Verdant never picks a phenotype; this just lays them side by side.
 */
import { useMemo, useState } from "react";
import PhenoComparisonView from "@/components/PhenoComparisonView";
import { PHENO_EXAMPLE_STRAINS, PHENO_SHOWCASE_DEFAULT_SELECTION } from "@/lib/phenoExampleStrains";

export default function PhenoExpressionShowcase() {
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(PHENO_SHOWCASE_DEFAULT_SELECTION),
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedInputs = useMemo(
    () => PHENO_EXAMPLE_STRAINS.filter((s) => selected.has(s.candidateId)),
    [selected],
  );

  return (
    <div
      data-testid="pheno-expression-showcase"
      className="container mx-auto max-w-6xl space-y-4 px-4 py-6"
    >
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Pheno Expression Showcase</h1>
        <p className="text-sm text-muted-foreground">
          Ten example phenos, from the loudest gas to a yield-monster to a herm-flagged beauty. Tick
          any combination to read their expressions side by side. Demo data — Verdant never picks a
          phenotype for you.
        </p>
      </header>

      <fieldset
        data-testid="pheno-showcase-picker"
        className="rounded-lg border border-border bg-card p-3"
      >
        <legend className="px-1 text-sm font-medium">
          Mix &amp; match{" "}
          <span data-testid="pheno-showcase-selected-count" className="text-muted-foreground">
            ({selectedInputs.length} selected)
          </span>
        </legend>
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {PHENO_EXAMPLE_STRAINS.map((s) => {
            const isSel = selected.has(s.candidateId);
            return (
              <li key={s.candidateId}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50">
                  <input
                    type="checkbox"
                    data-testid={`pheno-showcase-select-${s.candidateId}`}
                    checked={isSel}
                    onChange={() => toggle(s.candidateId)}
                    className="h-4 w-4"
                  />
                  <span className="font-medium">{s.candidateLabel}</span>
                  <span className="text-xs text-muted-foreground">{s.strain}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <PhenoComparisonView inputs={selectedInputs} mode="demo" />
    </div>
  );
}
