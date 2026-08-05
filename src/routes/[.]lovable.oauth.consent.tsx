import { createFileRoute } from "@tanstack/react-router";
import OAuthConsent from "@/pages/OAuthConsent";

export const Route = createFileRoute("/.lovable/oauth/consent")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OAuthConsent />;
}
