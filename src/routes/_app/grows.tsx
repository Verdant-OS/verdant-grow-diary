import { createFileRoute } from "@tanstack/react-router";
import Grows from "@/pages/Grows";

export const Route = createFileRoute("/_app/grows")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Grows />;
}
