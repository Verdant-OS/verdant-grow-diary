import { createFileRoute } from "@tanstack/react-router";
import BreederBeta from "@/pages/BreederBeta";

export const Route = createFileRoute("/breeder-beta")({
  component: RouteComponent,
});

function RouteComponent() {
  return <BreederBeta />;
}
