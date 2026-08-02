import { createFileRoute } from "@tanstack/react-router";
import Leads from "@/pages/Leads";

export const Route = createFileRoute("/admin/leads")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Leads />;
}
