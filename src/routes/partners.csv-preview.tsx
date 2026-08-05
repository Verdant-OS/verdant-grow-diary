import { createFileRoute } from "@tanstack/react-router";
import PartnerCsvPreviewLanding from "@/pages/PartnerCsvPreviewLanding";

export const Route = createFileRoute("/partners/csv-preview")({
  component: RouteComponent,
});

function RouteComponent() {
  return <PartnerCsvPreviewLanding />;
}
