import { createFileRoute } from "@tanstack/react-router";
import Terms from "@/pages/TermsOfService";

export const Route = createFileRoute("/terms")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Terms />;
}
