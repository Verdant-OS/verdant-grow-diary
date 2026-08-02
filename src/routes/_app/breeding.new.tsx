import { createFileRoute } from "@tanstack/react-router";
import BreedingProgramNew from "@/pages/BreedingProgramNew";

export const Route = createFileRoute("/breeding/new")({
  component: RouteComponent,
});

function RouteComponent() {
  return <BreedingProgramNew />;
}
