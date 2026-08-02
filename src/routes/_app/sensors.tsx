import { createFileRoute } from "@tanstack/react-router";
import Sensors from "@/pages/Sensors";

export const Route = createFileRoute("/sensors")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Sensors />;
}
