from pathlib import Path


def replace(path: str, old: str, new: str, expected: int = 1) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(
            f"{path}: expected {expected} exact match(es), found {count}\n"
            f"--- expected seam ---\n{old[:1200]}"
        )
    file.write_text(text.replace(old, new))


def write(path: str, content: str) -> None:
    Path(path).write_text(content)


write(
    "src/lib/quickLogTimelineNavigationTarget.ts",
    '''/**
 * quickLogTimelineNavigationTarget — pure helper that maps a confirmed
 * Quick Log save into the canonical grow-scoped Timeline destination.
 *
 * Hard constraints:
 *  - Pure. No React, router, DOM, network, or persistence access.
 *  - A confirmed grow id is mandatory. Missing identity fails closed.
 *  - The global Timeline owns grow-scoped reads and async entry anchors.
 *  - Plant/tent query filters are additive context, never authorization.
 *  - No event id means no invented hash target.
 */

import { timelinePath } from "@/lib/routes";
import { buildTimelineEntryAnchorId } from "@/lib/timelineEntryAnchorRules";

export type QuickLogTimelineScopeType = "plant" | "tent";

export interface QuickLogTimelineNavScope {
  /** Server-verified grow that owns the saved record. */
  growId: string | null | undefined;
  targetType: QuickLogTimelineScopeType | null | undefined;
  targetId: string | null | undefined;
  /** Plant saves may preserve their verified tent as additive context. */
  tentId?: string | null;
  /** Saved grow_events id returned by the writer, when available. */
  growEventId?: string | null;
}

export interface QuickLogTimelineNavTarget {
  /** Canonical `/timeline?growId=...` path plus optional filters. */
  path: string;
  /** Fragment without `#`; blank when no real event id exists. */
  hash: string;
  /** Convenience path plus optional fragment. */
  href: string;
}

function normalizedId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildQuickLogTimelineNavTarget(
  scope: QuickLogTimelineNavScope,
): QuickLogTimelineNavTarget | null {
  const growId = normalizedId(scope?.growId);
  if (!growId) return null;

  const targetId = normalizedId(scope?.targetId);
  const tentId = normalizedId(scope?.tentId);
  const filters = new URLSearchParams();

  if (scope?.targetType === "plant" && targetId) {
    filters.set("plantId", targetId);
    if (tentId) filters.set("tentId", tentId);
  } else if (scope?.targetType === "tent" && targetId) {
    filters.set("tentId", targetId);
  } else if (tentId) {
    filters.set("tentId", tentId);
  }

  const filterQuery = filters.toString();
  const path = filterQuery
    ? `${timelinePath(growId)}&${filterQuery}`
    : timelinePath(growId);
  const hash = buildTimelineEntryAnchorId(scope?.growEventId) ?? "";
  return {
    path,
    hash,
    href: hash ? `${path}#${hash}` : path,
  };
}

export const QUICK_LOG_TIMELINE_CTA_LABEL = "View diary" as const;
''',
)

replace(
    "src/lib/quickLogSaveGuardRules.ts",
    '''  /** Growth event id returned from the server, when available. */
  growEventId: string | null;
  /** Target the log was attached to. Used for the "View" CTA. */
''',
    '''  /** Growth event id returned from the server, when available. */
  growEventId: string | null;
  /** Server-verified grow that owns the saved record. */
  growId: string | null;
  /** Target the log was attached to. Used for the "View" CTA. */
''',
)
replace(
    "src/lib/quickLogSaveGuardRules.ts",
    '''export const QUICK_LOG_POST_SAVE_VIEW_LABEL = "View timeline" as const;
export const QUICK_LOG_POST_SAVE_ANOTHER_LABEL = "Log another" as const;
export const QUICK_LOG_POST_SAVE_CLOSE_LABEL = "Close" as const;
''',
    '''export const QUICK_LOG_POST_SAVE_VIEW_LABEL = "View diary" as const;
export const QUICK_LOG_POST_SAVE_ANOTHER_LABEL = "Log another" as const;
export const QUICK_LOG_POST_SAVE_CLOSE_LABEL = "Dismiss" as const;
''',
)
replace(
    "src/lib/quickLogSaveGuardRules.ts",
    'export const QUICK_LOG_POST_SAVE_TITLE = "Saved" as const;\n',
    'export const QUICK_LOG_POST_SAVE_TITLE = "Saved to your diary" as const;\n',
)
replace(
    "src/lib/quickLogSaveGuardRules.ts",
    '''export function buildQuickLogPostSaveDescription(
  input: QuickLogPostSaveDescriptionInput,
): string {
  const verb = (input.action ?? "").trim() || "entry";
  const withPhoto = input.photoAttached ? " with photo" : "";
  const target = (input.targetName ?? "").trim();
  const scopeParts: string[] = [];
  if (target) scopeParts.push(target);
  const tent = (input.tentName ?? "").trim();
  if (tent) scopeParts.push(tent);
  const grow = (input.growName ?? "").trim();
  if (grow) scopeParts.push(grow);
  const scope = scopeParts.length ? ` to ${scopeParts.join(" · ")}` : "";
  return `Logged ${verb}${withPhoto}${scope} · just now`;
}
''',
    '''export function buildQuickLogPostSaveDescription(
  input: QuickLogPostSaveDescriptionInput,
): string {
  const growName = (input.growName ?? "").trim();
  return growName ? `Added to ${growName}.` : "Saved to your diary.";
}
''',
)

replace(
    "src/lib/oneTentLoopNavigationRules.ts",
    'import { buildSensorsTentRouteHref } from "@/lib/sensorRouteTentIntentRules";\n',
    'import { buildSensorsTentRouteHref } from "@/lib/sensorRouteTentIntentRules";\nimport { timelinePath } from "@/lib/routes";\n',
)
replace(
    "src/lib/oneTentLoopNavigationRules.ts",
    '''    case "quick-log":
      return enable(base, "/timeline");
''',
    '''    case "quick-log": {
      const confirmedGrowId = typeof growId === "string" ? growId.trim() : "";
      return confirmedGrowId ? enable(base, timelinePath(confirmedGrowId)) : base;
    }
''',
)

replace(
    "src/components/QuickLogV2Sheet.tsx",
    '''  function navigateToTimeline(href: string, hash: string, path: string) {
    navigateToTimelineAnchor(
      { path, hash, href },
      {
        navigate: navigate ?? null,
        currentPath: typeof window !== "undefined" ? (window.location?.pathname ?? null) : null,
      },
    );
  }

  function showTimelineConfirmation(
    message: string,
    scope: {
      targetType: "plant" | "tent" | null;
      targetId: string | null;
      tentId: string | null;
      growEventId?: string | null;
    },
  ) {
    const nav = buildQuickLogTimelineNavTarget({
      targetType: scope.targetType,
      targetId: scope.targetId,
      growEventId: scope.growEventId ?? null,
    });
    toast.success(message, {
      action: {
        label: QUICK_LOG_TIMELINE_CTA_LABEL,
        onClick: () => navigateToTimeline(nav.href, nav.hash, nav.path),
      },
    });
  }
''',
    '''  function navigateToTimeline(href: string, hash: string, path: string) {
    navigateToTimelineAnchor(
      { path, hash, href },
      {
        navigate: navigate ?? null,
        currentPath:
          typeof window !== "undefined"
            ? `${window.location?.pathname ?? ""}${window.location?.search ?? ""}`
            : null,
      },
    );
  }

  function showTimelineConfirmation(
    message: string,
    scope: {
      growId: string | null;
      targetType: "plant" | "tent" | null;
      targetId: string | null;
      tentId: string | null;
      growEventId?: string | null;
    },
  ) {
    const nav = buildQuickLogTimelineNavTarget({
      growId: scope.growId,
      targetType: scope.targetType,
      targetId: scope.targetId,
      tentId: scope.tentId,
      growEventId: scope.growEventId ?? null,
    });
    if (!nav) {
      toast.success(message);
      return;
    }
    toast.success(message, {
      action: {
        label: QUICK_LOG_TIMELINE_CTA_LABEL,
        onClick: () => navigateToTimeline(nav.href, nav.hash, nav.path),
      },
    });
  }
''',
)
replace(
    "src/components/QuickLogV2Sheet.tsx",
    '''  const targetPanel = useMemo(
    () =>
      buildQuickLogTargetPanel({
        resolved: resolvedTarget,
        plants: plants as Parameters<typeof buildQuickLogTargetPanel>[0]["plants"],
        tents: tents as Parameters<typeof buildQuickLogTargetPanel>[0]["tents"],
        grows,
      }),
    [resolvedTarget, plants, tents, grows],
  );
''',
    '''  const targetPanel = useMemo(
    () =>
      buildQuickLogTargetPanel({
        resolved: resolvedTarget,
        plants: plants as Parameters<typeof buildQuickLogTargetPanel>[0]["plants"],
        tents: tents as Parameters<typeof buildQuickLogTargetPanel>[0]["tents"],
        grows,
      }),
    [resolvedTarget, plants, tents, grows],
  );
  const postSaveTimelineTarget = useMemo(
    () =>
      postSave
        ? buildQuickLogTimelineNavTarget({
            growId: postSave.growId,
            targetType: postSave.targetType,
            targetId: postSave.targetId,
            tentId: postSave.tentId,
            growEventId: postSave.growEventId,
          })
        : null,
    [postSave],
  );
  const postSaveGrowName = useMemo(
    () =>
      postSave?.growId
        ? (grows.find((grow) => grow.id === postSave.growId)?.name ?? null)
        : null,
    [grows, postSave?.growId],
  );
''',
)
replace(
    "src/components/QuickLogV2Sheet.tsx",
    '''      showTimelineConfirmation(FEEDING_SAVE_SUCCESS_MESSAGE, {
        // Feed events are currently surfaced in the global typed root-zone
        // lane, not the scoped grouped timeline. Route to the real anchor.
        targetType: null,
        targetId: null,
        tentId: resolved.tentId ?? null,
        growEventId,
      });
''',
    '''      showTimelineConfirmation(FEEDING_SAVE_SUCCESS_MESSAGE, {
        growId: resolved.growId,
        targetType: resolved.targetType as "plant" | "tent",
        targetId: resolved.targetId as string,
        tentId: resolved.tentId ?? null,
        growEventId,
      });
''',
)
replace(
    "src/components/QuickLogV2Sheet.tsx",
    '''      setPostSave({
        growEventId,
        targetType: resolved.targetType as "plant" | "tent",
''',
    '''      setPostSave({
        growEventId,
        growId: resolved.growId,
        targetType: resolved.targetType as "plant" | "tent",
''',
)
replace(
    "src/components/QuickLogV2Sheet.tsx",
    '''    showTimelineConfirmation(successMessage, {
      targetType: resolved.targetType as "plant" | "tent",
''',
    '''    showTimelineConfirmation(successMessage, {
      growId: resolved.growId ?? null,
      targetType: resolved.targetType as "plant" | "tent",
''',
)
replace(
    "src/components/QuickLogV2Sheet.tsx",
    '''    setPostSave({
      growEventId: (res as { growEventId?: string | null }).growEventId ?? null,
      targetType: resolved.targetType as "plant" | "tent",
''',
    '''    setPostSave({
      growEventId: (res as { growEventId?: string | null }).growEventId ?? null,
      growId: resolved.growId ?? null,
      targetType: resolved.targetType as "plant" | "tent",
''',
)
replace(
    "src/components/QuickLogV2Sheet.tsx",
    '''  function handleViewTimeline() {
    if (!postSave) return;
    const nav = buildQuickLogTimelineNavTarget({
      targetType: postSave.action === "feed" ? null : postSave.targetType,
      targetId: postSave.action === "feed" ? null : postSave.targetId,
      growEventId: postSave.growEventId,
    });
    onOpenChange(false);
    navigateToTimeline(nav.href, nav.hash, nav.path);
  }
''',
    '''  function handleViewTimeline() {
    if (!postSaveTimelineTarget) return;
    onOpenChange(false);
    navigateToTimeline(
      postSaveTimelineTarget.href,
      postSaveTimelineTarget.hash,
      postSaveTimelineTarget.path,
    );
  }
''',
)
replace(
    "src/components/QuickLogV2Sheet.tsx",
    '''                    growName: null,
                    action: postSave.action,
''',
    '''                    growName: postSaveGrowName,
                    action: postSave.action,
''',
)
replace(
    "src/components/QuickLogV2Sheet.tsx",
    '''                    onClick={handleViewTimeline}
                    data-testid="quick-log-post-save-view"
''',
    '''                    onClick={handleViewTimeline}
                    disabled={!postSaveTimelineTarget}
                    data-testid="quick-log-post-save-view"
''',
)

replace(
    "src/components/QuickLog.tsx",
    'import { plantDetailPath } from "@/lib/routes";\n',
    'import { buildQuickLogTimelineNavTarget } from "@/lib/quickLogTimelineNavigationTarget";\n',
)
replace(
    "src/components/QuickLog.tsx",
    '''type SavedTarget = {
  id: string;
  name: string;
  tentName: string | null;
  growName: string | null;
  eventType: string;
  savedAt: string;
};
''',
    '''type SavedTarget = {
  id: string;
  name: string;
  growId: string | null;
  tentId: string | null;
  growEventId: string | null;
  tentName: string | null;
  growName: string | null;
  eventType: string;
  savedAt: string;
};
''',
)
replace(
    "src/components/QuickLog.tsx",
    '''      setSavedTarget({
        id: savePlant.id,
        name: plantLabel,
        tentName: saveTent.name ?? null,
        growName: saveGrow?.name ?? null,
        eventType: saveEventType,
        savedAt: new Date().toISOString(),
      });
''',
    '''      setSavedTarget({
        id: savePlant.id,
        name: plantLabel,
        growId: saveTarget.growId ?? null,
        tentId: saveTarget.tentId ?? null,
        growEventId: result.growEventId ?? null,
        tentName: saveTent.name ?? null,
        growName: saveGrow?.name ?? null,
        eventType: saveEventType,
        savedAt: new Date().toISOString(),
      });
''',
)
replace(
    "src/components/QuickLog.tsx",
    '''  const selectedResponseStatus = readResponseCheckStatus(note);

  return (
''',
    '''  const selectedResponseStatus = readResponseCheckStatus(note);
  const savedTimelineTarget = savedTarget
    ? buildQuickLogTimelineNavTarget({
        growId: savedTarget.growId,
        targetType: "plant",
        targetId: savedTarget.id,
        tentId: savedTarget.tentId,
        growEventId: savedTarget.growEventId,
      })
    : null;

  return (
''',
)
replace(
    "src/components/QuickLog.tsx",
    '''                  <a
                    ref={viewPlantBtnRef}
                    href={plantDetailPath(savedTarget.id)}
                    data-testid="quick-log-view-target-plant"
                    data-target-plant-id={savedTarget.id}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={() => {
                      if (typeof document !== "undefined") {
                        (document.activeElement as HTMLElement | null)?.blur?.();
                      }
                      // Match the Dialog wrapper's close path: without reset()
                      // the component (kept mounted in AppShell) reopens showing
                      // the stale post-save panel instead of a fresh form.
                      onOpenChange(false);
                      reset();
                    }}
                  >
                    {QUICK_LOG_POST_SAVE_VIEW_LABEL}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
''',
    '''                  {savedTimelineTarget ? (
                    <a
                      ref={viewPlantBtnRef}
                      href={savedTimelineTarget.href}
                      data-testid="quick-log-view-target-plant"
                      data-target-grow-id={savedTarget.growId ?? undefined}
                      data-target-plant-id={savedTarget.id}
                      className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      onClick={() => {
                        if (typeof document !== "undefined") {
                          (document.activeElement as HTMLElement | null)?.blur?.();
                        }
                        // Match the Dialog wrapper's close path: without reset()
                        // the component (kept mounted in AppShell) reopens showing
                        // the stale post-save panel instead of a fresh form.
                        onOpenChange(false);
                        reset();
                      }}
                    >
                      {QUICK_LOG_POST_SAVE_VIEW_LABEL}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  ) : (
                    <Button
                      type="button"
                      disabled
                      data-testid="quick-log-view-target-plant"
                    >
                      {QUICK_LOG_POST_SAVE_VIEW_LABEL}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  )}
''',
)
replace(
    "src/components/QuickLog.tsx",
    '''                      // Same reset-on-close as the Dialog wrapper path — see
                      // the View-plant handler above.
''',
    '''                      // Same reset-on-close as the Dialog wrapper path — see
                      // the View-diary handler above.
''',
)

print("Issue 675 product patch applied.")
