import { createFileRoute } from "@tanstack/react-router";
import GeneticsLibrary from "@/pages/GeneticsLibrary";

export const Route = createFileRoute("/genetics")({
  component: RouteComponent,
});

function RouteComponent() {
  return <GeneticsLibrary />;
}
