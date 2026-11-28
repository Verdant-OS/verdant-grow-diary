import { createFileRoute, notFound } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import NotFound from "@/pages/NotFound";
import HelpCenterPage from "@/pages/HelpCenterPage";
import { HelpCenterContent } from "@/lib/helpCenterContent";

export const Route = createFileRoute("/help/$section")({
  loader: ({ params }) => {
    const page = HelpCenterContent.pageBySlug(params.section);
    if (!page) throw notFound();
    return page;
  },
  head: ({ params }) => {
    const page = HelpCenterContent.pageBySlug(params.section);
    if (!page) {
      return { meta: [{ name: "robots", content: "noindex, follow" }], links: [], scripts: [] };
    }
    return staticRouteHead(page.kind === "section" ? page.section.path : page.article.path);
  },
  notFoundComponent: NotFound,
  component: function HelpSectionRoute() {
    const page = Route.useLoaderData();
    return page.kind === "section" ? (
      <HelpCenterPage section={page.section} />
    ) : (
      <HelpCenterPage section={null} article={page.article} />
    );
  },
});
