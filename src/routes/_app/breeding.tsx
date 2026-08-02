import { createFileRoute } from "@tanstack/react-router";
import BreedingProgramsIndex from "@/pages/BreedingProgramsIndex";

export const Route = createFileRoute("/_app/breeding")({
  component: RouteComponent,
});

function RouteComponent() {
  return <BreedingProgramsIndex />;
}
