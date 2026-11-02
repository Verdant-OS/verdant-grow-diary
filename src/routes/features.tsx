import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import Features from "@/pages/Features";

export const Route = createFileRoute("/features")({
  head: () => staticRouteHead("/features"),
  component: RouteComponent,
});

function RouteComponent() {
  return <Features />;
}
