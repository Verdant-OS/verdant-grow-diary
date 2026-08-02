import { createFileRoute } from "@tanstack/react-router";
import BreedingLogNew from "@/pages/BreedingLogNew";

export const Route = createFileRoute("/_app/breeding/log/new")({
  component: RouteComponent,
});

function RouteComponent() {
  return <BreedingLogNew />;
}
