import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import BlueprintTargetsGuide from "@/pages/BlueprintTargetsGuide";

export const Route = createFileRoute("/tools/blueprint-targets")({
  head: () => staticRouteHead("/tools/blueprint-targets"),
  component: RouteComponent,
});

function RouteComponent() {
  return <BlueprintTargetsGuide />;
}
