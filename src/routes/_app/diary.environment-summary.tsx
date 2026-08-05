import { createFileRoute } from "@tanstack/react-router";
import EnvironmentSummaryReportPage from "@/pages/EnvironmentSummaryReportPage";

export const Route = createFileRoute("/_app/diary/environment-summary")({
  component: RouteComponent,
});

function RouteComponent() {
  return <EnvironmentSummaryReportPage />;
}
