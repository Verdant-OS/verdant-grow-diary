/**
 * Runtime ownership bridge for route-specific JSON-LD.
 *
 * Static route documents keep their complete JSON-LD for non-JavaScript
 * crawlers. Once React mounts a route, the presenter owns the semantic types
 * it can keep current during SPA navigation. This helper removes only those
 * overlapping types from static route blocks, preserves complementary static
 * schema (for example WebPage), and mounts the runtime documents.
 */
import { safeJsonLdStringify } from "@/lib/seoStructuredData";

export interface RuntimePageJsonLdDocument {
  readonly marker: string;
  readonly value: unknown;
}

export interface RuntimePageJsonLdOptions {
  readonly documents: ReadonlyArray<RuntimePageJsonLdDocument>;
  /**
   * Top-level schema.org types owned by the mounted route.
   *
   * Keep this explicit rather than inferring it from `documents`: an omitted
   * optional runtime document (such as an undated Article) must still remove a
   * stale static copy of that type.
   */
  readonly ownedStaticTypes: ReadonlyArray<string>;
}

interface ReconciledJsonLd {
  readonly changed: boolean;
  readonly removed: boolean;
  readonly value?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reconcileArray(
  values: ReadonlyArray<unknown>,
  ownedTypes: ReadonlySet<string>,
): ReconciledJsonLd {
  const next: unknown[] = [];
  let changed = false;

  for (const value of values) {
    const reconciled = reconcileJsonLd(value, ownedTypes);
    changed ||= reconciled.changed;
    if (reconciled.removed) {
      changed = true;
      continue;
    }
    next.push(reconciled.value);
  }

  return next.length === 0
    ? { changed: changed || values.length > 0, removed: true }
    : { changed, removed: false, value: changed ? next : values };
}

function reconcileJsonLd(value: unknown, ownedTypes: ReadonlySet<string>): ReconciledJsonLd {
  if (Array.isArray(value)) {
    return reconcileArray(value, ownedTypes);
  }
  if (!isRecord(value)) {
    return { changed: false, removed: false, value };
  }

  const rawType = value["@type"];
  if (typeof rawType === "string" && ownedTypes.has(rawType)) {
    return { changed: true, removed: true };
  }

  let next: Record<string, unknown> = value;
  let changed = false;

  if (Array.isArray(rawType)) {
    const remainingTypes = rawType.filter(
      (type) => typeof type !== "string" || !ownedTypes.has(type),
    );
    if (remainingTypes.length !== rawType.length) {
      if (remainingTypes.length === 0) {
        return { changed: true, removed: true };
      }
      next = { ...next, "@type": remainingTypes };
      changed = true;
    }
  }

  const graph = next["@graph"];
  if (Array.isArray(graph)) {
    const reconciledGraph = reconcileArray(graph, ownedTypes);
    if (reconciledGraph.changed) {
      next = { ...next };
      changed = true;
      if (reconciledGraph.removed) {
        delete next["@graph"];
      } else {
        next["@graph"] = reconciledGraph.value;
      }
    }

    // A graph container with no remaining nodes has no semantic payload.
    const remainingKeys = Object.keys(next).filter((key) => key !== "@context");
    if (remainingKeys.length === 0) {
      return { changed: true, removed: true };
    }
  }

  return { changed, removed: false, value: next };
}

function reconcileStaticRouteJsonLd(ownedTypes: ReadonlySet<string>): void {
  if (ownedTypes.size === 0) return;

  document.head
    .querySelectorAll<HTMLScriptElement>(
      'script[type="application/ld+json"][data-static-route-ldjson]',
    )
    .forEach((script) => {
      const raw = script.textContent ?? "";
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // A malformed or non-JSON block is not ours to rewrite.
        return;
      }

      const reconciled = reconcileJsonLd(parsed, ownedTypes);
      if (reconciled.removed) {
        script.remove();
      } else if (reconciled.changed) {
        script.textContent = safeJsonLdStringify(reconciled.value);
      }
    });
}

/**
 * Reconcile static route schema and mount the React-owned JSON-LD documents.
 *
 * The returned cleanup removes only the runtime scripts created by this call.
 * Static reconciliation intentionally remains in place for the rest of the
 * SPA session so an initial route's stale schemas cannot leak into a later
 * route.
 */
export function mountRuntimePageJsonLd({
  documents,
  ownedStaticTypes,
}: RuntimePageJsonLdOptions): () => void {
  const ownedTypes = new Set(ownedStaticTypes.filter((type) => type.trim().length > 0));
  reconcileStaticRouteJsonLd(ownedTypes);

  const scripts = documents.map(({ marker, value }) => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-page-ldjson", marker);
    script.textContent = safeJsonLdStringify(value);
    document.head.appendChild(script);
    return script;
  });

  return () => scripts.forEach((script) => script.remove());
}
