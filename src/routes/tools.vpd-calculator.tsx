import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import PublicVpdCalculator from "@/pages/PublicVpdCalculator";

export const Route = createFileRoute("/tools/vpd-calculator")({
  head: () => staticRouteHead("/tools/vpd-calculator"),
  component: RouteComponent,
});

function RouteComponent() {
  return <PublicVpdCalculator />;
}
