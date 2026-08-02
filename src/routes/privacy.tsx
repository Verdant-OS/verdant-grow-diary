import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import Privacy from "@/pages/PrivacyPolicy";

export const Route = createFileRoute("/privacy")({
  head: () => staticRouteHead("/privacy"),
  component: RouteComponent,
});

function RouteComponent() {
  return <Privacy />;
}
