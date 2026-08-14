import { createFileRoute } from "@tanstack/react-router";
import RootEntry from "@/components/RootEntry";
import { staticRouteHead } from "@/lib/build/staticRouteHead";

export const Route = createFileRoute("/")({
  // The shared route-head contract supplies the SSR self-canonical and reuses
  // the existing /og/home.png card. Landing's client manager adopts this
  // foreign canonical without removing it; this is the same ownership model
  // already exercised by the other static public routes.
  head: () => staticRouteHead("/"),
  component: RouteComponent,
});

function RouteComponent() {
  return <RootEntry />;
}
