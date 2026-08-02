import { createFileRoute } from "@tanstack/react-router";
import GrowLearning from "@/pages/GrowLearning";

export const Route = createFileRoute("/_app/grows/$growId/learning")({
  component: RouteComponent,
});

function RouteComponent() {
  return <GrowLearning />;
}
