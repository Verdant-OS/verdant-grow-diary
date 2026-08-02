import { createFileRoute } from "@tanstack/react-router";
import Tents from "@/pages/Tents";

export const Route = createFileRoute("/tents")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Tents />;
}
