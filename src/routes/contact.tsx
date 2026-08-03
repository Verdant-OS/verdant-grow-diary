import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import Contact from "@/pages/support/Contact";
import { PublicAuthProviders } from "@/components/providers/PublicAuthProviders";

export const Route = createFileRoute("/contact")({
  head: () => staticRouteHead("/contact"),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PublicAuthProviders>
      <Contact />
    </PublicAuthProviders>
  );
}
