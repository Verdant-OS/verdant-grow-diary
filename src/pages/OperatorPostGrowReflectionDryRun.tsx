import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PostGrowReflectionPreviewCard } from "@/components/PostGrowReflectionPreviewCard";
import { buildPostGrowReflectionOperatorDiagnosticsViewModel } from "@/lib/ai/postGrowReflectionOperatorDiagnosticsViewModel";
import { buildPostGrowReflectionPreviewViewModel } from "@/lib/ai/postGrowReflectionPreviewViewModel";

export default function OperatorPostGrowReflectionDryRun() {
  const viewModel = buildPostGrowReflectionOperatorDiagnosticsViewModel();
  const previewViewModel = buildPostGrowReflectionPreviewViewModel();

  return (
    <div className="container mx-auto max-w-6xl p-6 space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{viewModel.title}</h1>
          <Badge variant={viewModel.statusLabel === "Green" ? "secondary" : "destructive"}>
            {viewModel.statusLabel}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{viewModel.subtitle}</p>
        <p className="text-xs text-muted-foreground">
          Route: <code>{viewModel.route}</code> · Harness: <code>{viewModel.harnessVersion}</code>
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Dry-run status</CardTitle>
          <CardDescription>{viewModel.statusDetail}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-5">
            {viewModel.metrics.map((metric) => (
              <div key={metric.label} className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">{metric.label}</div>
                <div className="mt-1 text-2xl font-semibold">{metric.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{metric.helper}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Safety reason codes</CardTitle>
          <CardDescription>
            Validation issue codes observed across rejected fixture candidates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{viewModel.safetyIssueCodesLabel}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scenario results</CardTitle>
          <CardDescription>
            Fixture-only smoke scenarios passed through the Phase 2C adapter.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Scenario</th>
                  <th className="py-2 pr-3 font-medium">Expected</th>
                  <th className="py-2 pr-3 font-medium">Actual</th>
                  <th className="py-2 pr-3 font-medium">Result</th>
                  <th className="py-2 pr-3 font-medium">Issue codes</th>
                  <th className="py-2 pr-3 font-medium">Validation options</th>
                </tr>
              </thead>
              <tbody>
                {viewModel.scenarios.map((scenario) => (
                  <tr key={scenario.id} className="border-b align-top last:border-0">
                    <td className="py-3 pr-3">
                      <div className="font-medium">{scenario.label}</div>
                      <div className="text-xs text-muted-foreground">
                        <code>{scenario.id}</code> · grow <code>{scenario.growId}</code>
                      </div>
                    </td>
                    <td className="py-3 pr-3">{scenario.expectedStatus}</td>
                    <td className="py-3 pr-3">{scenario.actualStatus}</td>
                    <td className="py-3 pr-3">
                      <Badge variant={scenario.passedLabel === "Pass" ? "secondary" : "destructive"}>
                        {scenario.passedLabel}
                      </Badge>
                    </td>
                    <td className="py-3 pr-3">{scenario.issueCodesLabel}</td>
                    <td className="py-3 pr-3 text-xs text-muted-foreground">
                      {scenario.validationOptionsLabel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <PostGrowReflectionPreviewCard viewModel={previewViewModel} />



      <Card>
        <CardHeader>
          <CardTitle>Operator guardrails</CardTitle>
          <CardDescription>Keep this page diagnostic-only.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {viewModel.safetyRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
