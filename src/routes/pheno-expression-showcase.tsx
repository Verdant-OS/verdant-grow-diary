import { createFileRoute } from "@tanstack/react-router";
import PhenoExpressionShowcase from "@/pages/PhenoExpressionShowcase";

export const Route = createFileRoute("/pheno-expression-showcase")({
  component: RouteComponent,
});

function RouteComponent() {
  return <PhenoExpressionShowcase />;
}
