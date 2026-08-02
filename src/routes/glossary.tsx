import { createFileRoute } from "@tanstack/react-router";
import Glossary from "@/pages/Glossary";

export const Route = createFileRoute("/glossary")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Glossary />;
}
