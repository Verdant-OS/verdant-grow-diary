import type { ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";

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
        if (router) void router.navigate({ to });
      }}
    >
      {children}
    </a>
  );
}
