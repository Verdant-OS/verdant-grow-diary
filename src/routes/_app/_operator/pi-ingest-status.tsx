import { createFileRoute } from "@tanstack/react-router";
import PiIngestStatus from "@/pages/PiIngestStatus";

export const Route = createFileRoute("/_app/_operator/pi-ingest-status")({
  component: RouteComponent,
});

function RouteComponent() {
  return <PiIngestStatus />;
}
