import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import PhenoComparison from "@/pages/PhenoComparison";

export const Route = createFileRoute("/pheno-comparison")({
  head: () => staticRouteHead("/pheno-comparison"),
  component: RouteComponent,
});

function RouteComponent() {
  return <PhenoComparison />;
}
