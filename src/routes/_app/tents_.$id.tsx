import { createFileRoute } from "@tanstack/react-router";
import TentDetail from "@/pages/TentDetail";

export const Route = createFileRoute("/_app/tents_/$id")({
  component: RouteComponent,
});

function RouteComponent() {
  return <TentDetail />;
}
