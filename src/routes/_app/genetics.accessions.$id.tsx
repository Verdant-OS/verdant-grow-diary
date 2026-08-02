import { createFileRoute } from "@tanstack/react-router";
import AccessionDetail from "@/pages/AccessionDetail";

export const Route = createFileRoute("/_app/genetics/accessions/$id")({
  component: RouteComponent,
});

function RouteComponent() {
  return <AccessionDetail />;
}
