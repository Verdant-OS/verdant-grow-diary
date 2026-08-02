import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import BreederBeta from "@/pages/BreederBeta";

export const Route = createFileRoute("/breeder-beta")({
  head: () => staticRouteHead("/breeder-beta"),
  component: RouteComponent,
});

function RouteComponent() {
  return <BreederBeta />;
}
