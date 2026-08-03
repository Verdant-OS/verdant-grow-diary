import { createFileRoute } from "@tanstack/react-router";
import PhenoHuntCompare from "@/pages/PhenoHuntCompare";
import { PublicAuthProviders } from "@/components/providers/PublicAuthProviders";

export const Route = createFileRoute("/pheno-hunts/$id/compare")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PublicAuthProviders>
      <PhenoHuntCompare />
    </PublicAuthProviders>
  );
}
