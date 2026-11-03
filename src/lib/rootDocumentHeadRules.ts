/**
 * Root-document head decisions that depend on a child match.
 * The root head always owns the sitewide og:url. A not-found cultivar
 * page must not inherit that tag, because the server HTML is what
 * non-JS crawlers read.
 */
export class RootDocumentHeadRules {
  static omitInheritedOpenGraphUrl(
    matches: ReadonlyArray<{ routeId: string; status: string }>,
  ): boolean {
    return matches.some(
      (match) => match.routeId === "/cultivars/$slug" && match.status === "notFound",
    );
  }
}
