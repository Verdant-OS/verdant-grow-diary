import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import Glossary from "@/pages/Glossary";

export const Route = createFileRoute("/glossary")({
  head: () => staticRouteHead("/glossary"),
  component: RouteComponent,
});

function RouteComponent() {
  return <Glossary />;
}
