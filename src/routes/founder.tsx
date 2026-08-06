import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import Founder from "@/pages/Founder";

export const Route = createFileRoute("/founder")({
  head: () => staticRouteHead("/founder"),
  component: RouteComponent,
});

function RouteComponent() {
  return <Founder />;
}
