import { createFileRoute } from "@tanstack/react-router";
import GrowLearning from "@/pages/GrowLearning";

export const Route = createFileRoute("/_app/grows_/$growId_/learning")({
  component: RouteComponent,
});

function RouteComponent() {
  return <GrowLearning />;
}
