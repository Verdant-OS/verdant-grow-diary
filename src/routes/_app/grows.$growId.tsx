import { createFileRoute } from "@tanstack/react-router";
import GrowDetail from "@/pages/GrowDetail";

export const Route = createFileRoute("/grows/$growId")({
  component: RouteComponent,
});

function RouteComponent() {
  return <GrowDetail />;
}
