/**
 * phenoCloneTreeViewModel — pure view-model that turns a keeper's flat clone
 * rows (pheno_keeper_clones, each with an optional parent_clone_id) into an
 * ordered, depth-annotated lineage for indented rendering.
 *
 * The propagation chain (mother → cut → cut-of-cut) is stored via
 * parent_clone_id but was only ever shown as a flat list; this builds the tree.
 *
 * Pure: no React, no Supabase. Deterministic, and defensive against malformed
 * data — orphaned parents become roots, self-parents are ignored, and cycles
 * can't loop the traversal.
 */

export interface CloneInput {
  readonly id: string;
  readonly parentCloneId: string | null;
  readonly cloneLabel: string;
  readonly note?: string | null;
  readonly takenAt?: string | null;
}

export interface CloneTreeRow {
  readonly id: string;
  readonly label: string;
  /** 0 for a root (mother / off-keeper cut), +1 per generation. */
  readonly depth: number;
  readonly note: string | null;
  readonly takenAt: string | null;
  readonly hasChildren: boolean;
}

/** The label as rendered — whitespace-only collapses to a stable placeholder. */
function labelOf(c: CloneInput): string {
  return c.cloneLabel && c.cloneLabel.trim() !== "" ? c.cloneLabel : "unnamed clone";
}

/** Order siblings by taken date (undated last), then label, then id (stable). */
function compareClones(a: CloneInput, b: CloneInput): number {
  const at = a.takenAt ?? "";
  const bt = b.takenAt ?? "";
  if (at && bt && at !== bt) return at < bt ? -1 : 1;
  if (at && !bt) return -1;
  if (!at && bt) return 1;
  // Sort by the *rendered* label so display order matches sort order (a
  // whitespace-only label shows as "unnamed clone", not as leading spaces).
  const al = labelOf(a);
  const bl = labelOf(b);
  if (al !== bl) return al < bl ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Flatten the clone forest to a pre-order, depth-annotated list. Roots are
 * clones with no parent (or whose parent id isn't present — orphans). Every
 * clone appears exactly once even if the data contains a cycle.
 */
export function buildCloneTreeRows(clones: ReadonlyArray<CloneInput>): CloneTreeRow[] {
  const byId = new Map<string, CloneInput>();
  for (const c of clones) if (c.id) byId.set(c.id, c);

  const childrenOf = new Map<string, CloneInput[]>();
  const roots: CloneInput[] = [];
  for (const c of byId.values()) {
    const parent = c.parentCloneId;
    // Root when: no parent, self-parent, or parent not in this keeper's set.
    if (!parent || parent === c.id || !byId.has(parent)) {
      roots.push(c);
    } else {
      (childrenOf.get(parent) ?? childrenOf.set(parent, []).get(parent)!).push(c);
    }
  }
  roots.sort(compareClones);
  for (const list of childrenOf.values()) list.sort(compareClones);

  const rows: CloneTreeRow[] = [];
  const visited = new Set<string>();

  const walk = (c: CloneInput, depth: number) => {
    if (visited.has(c.id)) return; // cycle / duplicate guard
    visited.add(c.id);
    const kids = childrenOf.get(c.id) ?? [];
    rows.push({
      id: c.id,
      label: labelOf(c),
      depth,
      note: c.note ?? null,
      takenAt: c.takenAt ?? null,
      hasChildren: kids.some((k) => !visited.has(k.id)),
    });
    for (const k of kids) walk(k, depth + 1);
  };

  for (const r of roots) walk(r, 0);
  // Any clone left unvisited (only reachable inside a cycle) is surfaced as a
  // root so nothing is silently dropped. Sort the leftovers so the entry point
  // — and thus the whole ordering — stays deterministic regardless of the
  // source row order (which listClonesForKeepers doesn't guarantee).
  const leftovers = [...byId.values()].filter((c) => !visited.has(c.id)).sort(compareClones);
  for (const c of leftovers) walk(c, 0);

  return rows;
}
