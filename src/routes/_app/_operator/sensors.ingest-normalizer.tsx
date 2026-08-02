import { createFileRoute } from "@tanstack/react-router";
import SensorsIngestNormalizer from "@/pages/SensorsIngestNormalizer";

export const Route = createFileRoute("/sensors/ingest-normalizer")({
  component: RouteComponent,
});

function RouteComponent() {
  return <SensorsIngestNormalizer />;
}
