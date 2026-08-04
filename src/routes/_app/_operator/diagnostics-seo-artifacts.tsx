import { createFileRoute } from "@tanstack/react-router";
import SeoBuildArtifactsDiagnostics from "@/pages/SeoBuildArtifactsDiagnostics";

export const Route = createFileRoute("/_app/_operator/diagnostics-seo-artifacts")({
  head: () => ({
    meta: [
      { title: "SEO build artifacts diagnostics | Verdant Grow Diary" },
      {
        name: "description",
        content:
          "Operator diagnostics: whether seo-manifest.json and the generated static route documents exist in the current build output.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return <SeoBuildArtifactsDiagnostics />;
}
