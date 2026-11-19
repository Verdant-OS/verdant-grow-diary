import type { ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";

/** Client navigation for a helper-built href, including `?growId=`. */
export function navigateNotebookHref(
  router: {
    navigate: (opts: {
      to: string;
      search?: Record<string, string>;
      hash?: string;
    }) => Promise<unknown>;
  },
  href: string,
): void {
  const hashIndex = href.indexOf("#");
  const pathAndSearch = hashIndex < 0 ? href : href.slice(0, hashIndex);
  const hash = hashIndex < 0 ? undefined : href.slice(hashIndex + 1);
  const queryIndex = pathAndSearch.indexOf("?");
  const pathname = queryIndex < 0 ? pathAndSearch : pathAndSearch.slice(0, queryIndex);
  const search =
    queryIndex < 0
      ? undefined
      : Object.fromEntries(new URLSearchParams(pathAndSearch.slice(queryIndex + 1)));
  void router.navigate({ to: pathname, search, hash });
}

/**
 * Client navigation when a router is mounted. preventDefault keeps an
 * in-memory recovery draft from being dropped by a document load.
 */
export default function NotebookRouteLink({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter({ warn: false });
  return (
    <a
      href={to}
      className={className}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        if (router) navigateNotebookHref(router, to);
      }}
    >
      {children}
    </a>
  );
}
