import { createFileRoute } from "@tanstack/react-router";
import PhenoHuntDemo from "@/pages/PhenoHuntDemo";

export const Route = createFileRoute("/internal/pheno-hunt-demo")({
  component: RouteComponent,
});

function RouteComponent() {
  return <PhenoHuntDemo />;
}
