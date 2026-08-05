import { createFileRoute } from "@tanstack/react-router";
import SensorCsvPreview from "@/pages/SensorCsvPreview";

export const Route = createFileRoute("/sensors/csv-preview")({
  component: RouteComponent,
});

function RouteComponent() {
  return <SensorCsvPreview />;
}
