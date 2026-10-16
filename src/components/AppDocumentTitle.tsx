import { useEffect } from "react";
import { appDocumentTitleForPath } from "@/lib/appDocumentTitleRules";

/**
 * Re-applies the route title after usePageSeo's unmount cleanup, which resets
 * document.title to the site name when leaving a page that opted in.
 */
export function AppDocumentTitle({ pathname }: { pathname: string }) {
  useEffect(() => {
    const title = appDocumentTitleForPath(pathname);
    if (title) document.title = title;
  }, [pathname]);
  return null;
}
