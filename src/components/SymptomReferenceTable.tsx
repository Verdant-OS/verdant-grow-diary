import type { SymptomReferenceTableData } from "@/constants/cannabisSymptomReference";

export default function SymptomReferenceTable({
  table,
}: {
  readonly table: SymptomReferenceTableData;
}) {
  return (
    <div
      className="mt-8 overflow-x-auto rounded-lg border border-border/60"
      data-testid="symptom-reference-table"
    >
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <caption className="bg-muted/40 px-4 py-3 text-left font-medium">{table.caption}</caption>
        <thead>
          <tr className="border-t border-border/60 bg-muted/20">
            <th scope="col" className="px-4 py-3">
              Visible sign
            </th>
            <th scope="col" className="px-4 py-3">
              Compare first
            </th>
            <th scope="col" className="px-4 py-3">
              Do not assume
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
              <td className="px-4 py-3 text-muted-foreground">{row.doNotAssume}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
