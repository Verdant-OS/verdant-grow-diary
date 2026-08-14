import { createFileRoute } from "@tanstack/react-router";
import AgentIntegrations from "@/pages/AgentIntegrations";

export const Route = createFileRoute("/_app/settings_/agent-integrations")({
  component: RouteComponent,
});

function RouteComponent() {
  return <AgentIntegrations />;
}
