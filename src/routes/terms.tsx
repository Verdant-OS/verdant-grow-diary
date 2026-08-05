import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import Terms from "@/pages/TermsOfService";

export const Route = createFileRoute("/terms")({
  head: () => staticRouteHead("/terms"),
  component: RouteComponent,
});

function RouteComponent() {
  return <Terms />;
}
