import { createFileRoute } from "@tanstack/react-router";
import FieldNotebookTimelineRecovery from "@/components/FieldNotebookTimelineRecovery";
import Timeline from "@/pages/Timeline";

export const Route = createFileRoute("/_app/timeline")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <>
      <FieldNotebookTimelineRecovery />
      <Timeline />
    </>
  );
}
