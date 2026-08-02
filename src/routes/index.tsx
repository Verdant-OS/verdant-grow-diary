import { createFileRoute } from "@tanstack/react-router";
import RootEntry from "@/components/RootEntry";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <RootEntry />;
}
