import { createFileRoute } from "@tanstack/react-router";
import DiaryRangeReportPage from "@/pages/DiaryRangeReportPage";

export const Route = createFileRoute("/reports/diary-range")({
  component: RouteComponent,
});

function RouteComponent() {
  return <DiaryRangeReportPage />;
}
