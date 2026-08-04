import { createFileRoute } from "@tanstack/react-router";
import GrowDetail from "@/pages/GrowDetail";

export const Route = createFileRoute("/_app/grows_/$growId")({
  component: RouteComponent,
});

function RouteComponent() {
  return <GrowDetail />;
}
