import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import Contact from "@/pages/support/Contact";

export const Route = createFileRoute("/contact")({
  head: () => staticRouteHead("/contact"),
  component: RouteComponent,
});

function RouteComponent() {
  return <Contact />;
}
