import { createFileRoute } from "@tanstack/react-router";
import BreedingProgramDetail from "@/pages/BreedingProgramDetail";

export const Route = createFileRoute("/breeding/$programId")({
  component: RouteComponent,
});

function RouteComponent() {
  return <BreedingProgramDetail />;
}
