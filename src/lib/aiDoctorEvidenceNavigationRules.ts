/**
 * aiDoctorEvidenceNavigationRules — pure DOM-only helpers for
 * jumping from an inline AI Doctor recommendation citation to the
 * matching Evidence Used item, with smooth scroll and focus preservation.
 *
 * Hard constraints:
 *  - No fetch, no Supabase, no edge invokes.
 *  - No automation, no writes.
 *  - Safe in jsdom (guards typeof document / scrollIntoView).
 */

export const AI_DOCTOR_EVIDENCE_PANEL_ROOT_ID = "ai-doctor-evidence-panel";

export interface EvidenceNavigationOptions {
  /** Override document for tests. */
  doc?: Document;
  /** ScrollIntoView behavior; defaults to "smooth". */
  behavior?: ScrollBehavior;
  /** When true, do not focus the target (e.g. reduce motion contexts). */
  skipFocus?: boolean;
}

export interface EvidenceNavigationResult {
  ok: boolean;
  /** "exact" when targetId was found, "fallback" when only the panel root was. */
  mode: "exact" | "fallback" | "none";
  /** Resolved element id (or null when nothing was found). */
  resolvedId: string | null;
}

/**
 * Resolve safe target IDs for citation kinds. Returns a stable slug-shaped id
 * that should be mounted on the Evidence Used panel for matching items.
 *
 * NOTE: callers (citation rules) generate the slugs — this helper exists
 * mainly to expose the panel root id and to centralise jsdom-safe DOM work.
 */
export function navigateToEvidenceTarget(
  targetId: string | null | undefined,
  opts: EvidenceNavigationOptions = {},
): EvidenceNavigationResult {
  const doc = opts.doc ?? (typeof document !== "undefined" ? document : null);
  if (!doc) return { ok: false, mode: "none", resolvedId: null };

  const safeId = typeof targetId === "string" && targetId.length > 0 ? targetId : null;
  let el: HTMLElement | null = safeId
    ? (doc.getElementById(safeId) as HTMLElement | null)
    : null;
  let mode: "exact" | "fallback" | "none" = "none";
  if (el) {
    mode = "exact";
  } else {
    const root = doc.getElementById(AI_DOCTOR_EVIDENCE_PANEL_ROOT_ID);
    if (root) {
      el = root as HTMLElement;
      mode = "fallback";
    }
  }
  if (!el) return { ok: false, mode: "none", resolvedId: null };

  try {
    if (typeof (el as unknown as { scrollIntoView?: unknown }).scrollIntoView === "function") {
      (el as HTMLElement).scrollIntoView({
        behavior: opts.behavior ?? "smooth",
        block: "start",
      });
    }
  } catch {
    /* ignore — scrollIntoView is presentation-only */
  }

  if (!opts.skipFocus) {
    try {
      // Make sure the element can receive focus without altering layout.
      if (!el.hasAttribute("tabindex")) {
        el.setAttribute("tabindex", "-1");
      }
      (el as HTMLElement).focus({ preventScroll: true });
    } catch {
      /* ignore — focus is best-effort */
    }
  }

  return { ok: true, mode, resolvedId: el.id || null };
}
