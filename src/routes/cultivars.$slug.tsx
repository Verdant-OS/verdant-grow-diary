import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { usePageSeo } from "@/hooks/usePageSeo";
import { CultivarSlugRouteRules } from "@/lib/cultivarSlugRouteRules";
import CultivarPage, { CultivarNotFound } from "@/pages/CultivarPage";

export const Route = createFileRoute("/cultivars/$slug")({
  loader: async ({ params }) => {
    const decision = await CultivarSlugRouteRules.decide(params.slug);
    if (decision.status === "redirect") {
      throw redirect({
        href: `/cultivars/${decision.slug}`,
        replace: true,
        statusCode: 308,
      });
    }
    if (decision.status === "unavailable") {
      throw redirect({
        href: `/cultivars/${params.slug}`,
        statusCode: 503,
        reloadDocument: true,
        headers: { "cache-control": "no-store", "retry-after": "30" },
      });
    }
    if (decision.status === "missing") throw notFound();
    return { slug: decision.slug, profile: decision.profile };
  },
  head: async ({ params }) => {
    const decision = await CultivarSlugRouteRules.decide(params.slug);
    return CultivarSlugRouteRules.headFor(decision);
  },
  notFoundComponent: CultivarSlugNotFound,
  component: RouteComponent,
});

function CultivarSlugNotFound() {
  const { slug } = Route.useParams();
  usePageSeo({
    title: "Cultivar not found | Verdant",
    description: "This cultivar reference is not in the library.",
    path: "/cultivars",
    noindex: true,
    omitCanonical: true,
  });
  return <CultivarNotFound slug={slug} />;
}

function RouteComponent() {
  const { profile } = Route.useLoaderData();
  return <CultivarPage routeProfile={profile} />;
}
