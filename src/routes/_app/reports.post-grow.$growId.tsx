import { createFileRoute } from "@tanstack/react-router";
import PostGrowLearningReport from "@/pages/PostGrowLearningReport";

export const Route = createFileRoute("/reports/post-grow/$growId")({
  component: RouteComponent,
});

function RouteComponent() {
  return <PostGrowLearningReport />;
}
