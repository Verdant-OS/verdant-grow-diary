import { createFileRoute } from "@tanstack/react-router";
import BreedingProgramsIndex from "@/pages/BreedingProgramsIndex";

export const Route = createFileRoute("/breeding")({
  component: RouteComponent,
});

function RouteComponent() {
  return <BreedingProgramsIndex />;
}
