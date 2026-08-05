import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import CustomerOreozGelonadeGuide from "@/pages/CustomerOreozGelonadeGuide";

export const Route = createFileRoute("/customer/guide/oreoz-vs-gelonade-comparison")({
  head: () => staticRouteHead("/customer/guide/oreoz-vs-gelonade-comparison"),
  component: RouteComponent,
});

function RouteComponent() {
  return <CustomerOreozGelonadeGuide />;
}
