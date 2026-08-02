import { createFileRoute } from "@tanstack/react-router";
import PhenoComparison from "@/pages/PhenoComparison";

export const Route = createFileRoute("/pheno-comparison")({
  component: RouteComponent,
});

function RouteComponent() {
  return <PhenoComparison />;
}
