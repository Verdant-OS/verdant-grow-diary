import { createFileRoute } from "@tanstack/react-router";
import PlantDetail from "@/pages/PlantDetail";

export const Route = createFileRoute("/_app/plants_/$id")({
  component: RouteComponent,
});

function RouteComponent() {
  return <PlantDetail />;
}
