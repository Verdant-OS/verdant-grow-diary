import { createFileRoute } from "@tanstack/react-router";
import PlantDetail from "@/pages/PlantDetail";

export const Route = createFileRoute("/plants/$id")({
  component: RouteComponent,
});

function RouteComponent() {
  return <PlantDetail />;
}
