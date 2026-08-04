import { createFileRoute } from "@tanstack/react-router";
import GeneticsLibrary from "@/pages/GeneticsLibrary";

export const Route = createFileRoute("/_app/genetics/")({
  component: GeneticsLibrary,
});
