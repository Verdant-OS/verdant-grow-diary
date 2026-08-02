import { createFileRoute } from "@tanstack/react-router";
import OreozGelonadeDiaryComparison from "@/pages/OreozGelonadeDiaryComparison";

export const Route = createFileRoute("/_app/diary/pheno-expression-comparison")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OreozGelonadeDiaryComparison />;
}
