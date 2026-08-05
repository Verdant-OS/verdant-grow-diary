import { createFileRoute } from "@tanstack/react-router";
import BreedingProgramDetail from "@/pages/BreedingProgramDetail";

export const Route = createFileRoute("/_app/breeding_/$programId")({
  component: RouteComponent,
});

function RouteComponent() {
  return <BreedingProgramDetail />;
}
