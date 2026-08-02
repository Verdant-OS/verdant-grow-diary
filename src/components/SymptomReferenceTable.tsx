import { useId } from "react";
import type { SymptomReferenceTableData } from "@/constants/cannabisSymptomReference";

export default function SymptomReferenceTable({
  table,
}: {
  readonly table: SymptomReferenceTableData;
}) {
  const scrollInstructionsId = useId();

  return (
    <div className="mt-8">
      <p id={scrollInstructionsId} className="mb-2 text-xs text-muted-foreground sm:sr-only">
        Swipe horizontally, or focus this table and use the arrow keys, to compare all four evidence
        columns.
      </p>
      <div
        role="region"
        aria-label="Scrollable symptom evidence table"
        aria-describedby={scrollInstructionsId}
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-border/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        data-testid="symptom-reference-table"
      >
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <caption className="bg-muted/40 px-4 py-3 text-left font-medium">{table.caption}</caption>
          <thead>
            <tr className="border-t border-border/60 bg-muted/20">
              <th scope="col" className="px-4 py-3">
                Visible pattern
              </th>
              <th scope="col" className="px-4 py-3">
                Evidence to compare
              </th>
              <th scope="col" className="px-4 py-3">
                What to log next
              </th>
              <th scope="col" className="px-4 py-3">
                What not to assume
              </th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.symptomId} className="border-t border-border/60 align-top">
                <th scope="row" className="px-4 py-3 font-medium">
                  {row.visibleSign}
                </th>
                <td className="px-4 py-3 text-muted-foreground">{row.compareFirst}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.whatToLogNext}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.doNotAssume}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
