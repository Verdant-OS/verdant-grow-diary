import { createFileRoute } from "@tanstack/react-router";
import LegacyUpgradeRedirect from "@/pages/LegacyUpgradeRedirect";

export const Route = createFileRoute("/upgrade")({
  component: RouteComponent,
});

function RouteComponent() {
  return <LegacyUpgradeRedirect />;
}
