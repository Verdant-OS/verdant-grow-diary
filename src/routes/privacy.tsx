import { createFileRoute } from "@tanstack/react-router";
import Privacy from "@/pages/PrivacyPolicy";

export const Route = createFileRoute("/privacy")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Privacy />;
}
