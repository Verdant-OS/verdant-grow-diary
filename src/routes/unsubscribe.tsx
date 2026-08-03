import { createFileRoute } from "@tanstack/react-router";
import Unsubscribe from "@/pages/Unsubscribe";
import { PublicAuthProviders } from "@/components/providers/PublicAuthProviders";

export const Route = createFileRoute("/unsubscribe")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PublicAuthProviders>
      <Unsubscribe />
    </PublicAuthProviders>
  );
}
