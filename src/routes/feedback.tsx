import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import Feedback from "@/pages/support/Feedback";
import { PublicAuthProviders } from "@/components/providers/PublicAuthProviders";

export const Route = createFileRoute("/feedback")({
  head: () => staticRouteHead("/feedback"),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PublicAuthProviders>
      <Feedback />
    </PublicAuthProviders>
  );
}
