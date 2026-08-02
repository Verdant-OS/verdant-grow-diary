import { createFileRoute } from "@tanstack/react-router";
import PhenoHuntCompare from "@/pages/PhenoHuntCompare";

export const Route = createFileRoute("/pheno-hunts/$id/compare")({
  component: RouteComponent,
});

function RouteComponent() {
  return <PhenoHuntCompare />;
}
