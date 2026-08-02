import { createFileRoute } from "@tanstack/react-router";
import DiaryRangeReportPage from "@/pages/DiaryRangeReportPage";

export const Route = createFileRoute("/_app/reports/diary-range")({
  component: RouteComponent,
});

function RouteComponent() {
  return <DiaryRangeReportPage />;
}
