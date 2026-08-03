import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import Landing from "@/pages/Landing";
import { PublicAuthProviders } from "@/components/providers/PublicAuthProviders";

export const Route = createFileRoute("/welcome")({
  head: () => staticRouteHead("/welcome"),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PublicAuthProviders>
      <Landing />
    </PublicAuthProviders>
  );
}
