import { createFileRoute } from "@tanstack/react-router";
import IngestInspector from "@/pages/IngestInspector";

export const Route = createFileRoute("/_app/_operator/ingest-inspector")({
  component: RouteComponent,
});

function RouteComponent() {
  return <IngestInspector />;
}
