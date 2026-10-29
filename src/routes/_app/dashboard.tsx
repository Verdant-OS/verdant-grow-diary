import { createFileRoute } from "@tanstack/react-router";
import Home from "@/pages/Home";

export const Route = createFileRoute("/_app/dashboard")({
  component: RouteComponent,
});

// A direct Dashboard link is an explicit destination: always the Advanced view,
// with the Simple/Advanced bar above it. `/` renders the chosen view.
function RouteComponent() {
  return <Home forceView="advanced" />;
}
