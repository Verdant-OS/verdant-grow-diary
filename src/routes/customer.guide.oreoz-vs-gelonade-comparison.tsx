import { createFileRoute } from "@tanstack/react-router";
import CustomerOreozGelonadeGuide from "@/pages/CustomerOreozGelonadeGuide";

export const Route = createFileRoute("/customer/guide/oreoz-vs-gelonade-comparison")({
  component: RouteComponent,
});

function RouteComponent() {
  return <CustomerOreozGelonadeGuide />;
}
