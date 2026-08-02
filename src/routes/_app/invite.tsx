import { createFileRoute } from "@tanstack/react-router";
import GrowerInvite from "@/pages/GrowerInvite";

export const Route = createFileRoute("/invite")({
  component: RouteComponent,
});

function RouteComponent() {
  return <GrowerInvite />;
}
