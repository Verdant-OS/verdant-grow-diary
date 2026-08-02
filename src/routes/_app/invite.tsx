import { createFileRoute } from "@tanstack/react-router";
import GrowerInvite from "@/pages/GrowerInvite";

export const Route = createFileRoute("/_app/invite")({
  component: RouteComponent,
});

function RouteComponent() {
  return <GrowerInvite />;
}
