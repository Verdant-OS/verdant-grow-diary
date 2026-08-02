import { createFileRoute } from "@tanstack/react-router";
import IngestInspector from "@/pages/IngestInspector";

export const Route = createFileRoute("/ingest-inspector")({
  component: RouteComponent,
});

function RouteComponent() {
  return <IngestInspector />;
}
