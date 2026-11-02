import { createFileRoute } from "@tanstack/react-router";
import { findCultivarBySlug } from "@/constants/verdantCultivars";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import CultivarPage from "@/pages/CultivarPage";

export const Route = createFileRoute("/cultivars/$slug")({
  head: ({ params }) => {
    if (!findCultivarBySlug(params.slug)) {
      return {
        meta: [
          { title: "Cultivar not found | Verdant" },
          { name: "robots", content: "noindex, follow" },
        ],
        links: [],
        scripts: [],
      };
    }
    return staticRouteHead(`/cultivars/${params.slug}`);
  },
  component: RouteComponent,
});

function RouteComponent() {
  return <CultivarPage />;
}
