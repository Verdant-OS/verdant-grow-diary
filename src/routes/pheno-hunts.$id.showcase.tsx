import { createFileRoute } from "@tanstack/react-router";
import PhenoHuntShowcase from "@/pages/PhenoHuntShowcase";

export const Route = createFileRoute("/pheno-hunts/$id/showcase")({
  component: RouteComponent,
});

function RouteComponent() {
  return <PhenoHuntShowcase />;
}
