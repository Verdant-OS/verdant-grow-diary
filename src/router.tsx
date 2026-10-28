import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import RouteTransitionSkeleton from "@/components/RouteTransitionSkeleton";
import { routeTransitionRouterOptions } from "@/lib/routeTransitionRules";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    ...routeTransitionRouterOptions(),
    defaultPendingComponent: () => <RouteTransitionSkeleton label="Opening page" />,
  });

  return router;
};
