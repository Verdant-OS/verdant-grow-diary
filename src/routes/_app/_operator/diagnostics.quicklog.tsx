import { createFileRoute } from "@tanstack/react-router";
import QuicklogDiagnostics from "@/pages/QuicklogDiagnostics";

export const Route = createFileRoute("/_app/_operator/diagnostics/quicklog")({
  component: RouteComponent,
});

function RouteComponent() {
  return <QuicklogDiagnostics />;
}
