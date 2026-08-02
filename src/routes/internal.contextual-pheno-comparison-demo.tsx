import { createFileRoute } from "@tanstack/react-router";
import ContextualPhenoComparisonDemo from "@/pages/ContextualPhenoComparisonDemo";

export const Route = createFileRoute("/internal/contextual-pheno-comparison-demo")({
  component: RouteComponent,
});

function RouteComponent() {
  return <ContextualPhenoComparisonDemo />;
}
