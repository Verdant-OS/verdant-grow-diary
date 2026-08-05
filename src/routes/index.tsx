import { createFileRoute } from "@tanstack/react-router";
import RootEntry from "@/components/RootEntry";

const SITE_URL = "https://verdantgrowdiary.com";

export const Route = createFileRoute("/")({
  // No head() canonical: usePageSeo owns <link rel="canonical"> app-wide
  // (Landing calls it with canonicalPath="/"). Declaring one here creates a
  // React-owned hoistable that the hook then mutates and removes — React
  // crashes deleting the detached node on the next navigation, silently
  // freezing every landing-origin route transition
  // (src/test/page-seo-head-ownership.test.tsx).
  head: () => ({
    meta: [
      { property: "og:image", content: `${SITE_URL}/og/home.png` },
      { name: "twitter:image", content: `${SITE_URL}/og/home.png` },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return <RootEntry />;
}
