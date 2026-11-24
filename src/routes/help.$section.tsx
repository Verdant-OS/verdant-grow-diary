import { createFileRoute, notFound } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import NotFound from "@/pages/NotFound";
import HelpCenterPage from "@/pages/HelpCenterPage";
import { HelpCenterContent } from "@/lib/helpCenterContent";

export const Route = createFileRoute("/help/$section")({
  loader: ({ params }) => {
    const section = HelpCenterContent.sectionBySlug(params.section);
    if (!section) throw notFound();
    return section;
  },
  head: ({ params }) => {
    const section = HelpCenterContent.sectionBySlug(params.section);
    if (!section) {
      return { meta: [{ name: "robots", content: "noindex, follow" }], links: [], scripts: [] };
    }
    return staticRouteHead(section.path);
  },
  notFoundComponent: NotFound,
  component: function HelpSectionRoute() {
    return <HelpCenterPage section={Route.useLoaderData()} />;
  },
});
