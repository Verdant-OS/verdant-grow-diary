import { createFileRoute } from "@tanstack/react-router";
import PhenoHuntShowcase from "@/pages/PhenoHuntShowcase";
import { PublicAuthProviders } from "@/components/providers/PublicAuthProviders";

export const Route = createFileRoute("/pheno-hunts/$id/showcase")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PublicAuthProviders>
      <PhenoHuntShowcase />
    </PublicAuthProviders>
  );
}
