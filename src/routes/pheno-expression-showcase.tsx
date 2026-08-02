import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import PhenoExpressionShowcase from "@/pages/PhenoExpressionShowcase";

export const Route = createFileRoute("/pheno-expression-showcase")({
  head: () => staticRouteHead("/pheno-expression-showcase"),
  component: RouteComponent,
});

function RouteComponent() {
  return <PhenoExpressionShowcase />;
}
