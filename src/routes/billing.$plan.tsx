import { createFileRoute } from "@tanstack/react-router";
import LegacyBillingRedirect from "@/pages/LegacyBillingRedirect";

export const Route = createFileRoute("/billing/$plan")({
  component: RouteComponent,
});

function RouteComponent() {
  return <LegacyBillingRedirect />;
}
