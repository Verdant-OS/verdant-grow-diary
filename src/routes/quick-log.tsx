import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import QuickLogStarter from "@/pages/QuickLogStarter";

export const Route = createFileRoute("/quick-log")({
  head: () => staticRouteHead("/quick-log"),
  component: RouteComponent,
});

function RouteComponent() {
  return <QuickLogStarter />;
}
