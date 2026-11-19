import { QueryClient } from "@tanstack/react-query";
import { QUERY_CLIENT_DEFAULT_OPTIONS } from "@/constants/queryClientDefaults";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({ defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
