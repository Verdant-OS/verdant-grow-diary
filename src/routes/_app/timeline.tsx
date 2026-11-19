import { createFileRoute } from "@tanstack/react-router";
import FieldNotebookTimelineRecovery from "@/components/FieldNotebookTimelineRecovery";
import { useLocation } from "@/lib/react-router-compat";
import Timeline from "@/pages/Timeline";

export const Route = createFileRoute("/_app/timeline")({
  component: RouteComponent,
});

function RouteComponent() {
  const location = useLocation();
  const growId = new URLSearchParams(location.search).get("growId");
  return (
    <>
      <FieldNotebookTimelineRecovery growId={growId} />
      <Timeline />
    </>
  );
}
