import type { QuickLogV2Action } from "@/lib/quickLogV2Rules";

/**
 * Pure routing for the two AppShell entries that used to open the legacy
 * Quick Log dialog. Both now open the existing Quick Log V2 sheet.
 */
export class AppShellQuickLogV2Entry {
  static plantTargetKey(plantId: unknown): string | null {
    if (typeof plantId !== "string") return null;
    const id = plantId.trim();
    if (!id || id !== plantId || id.includes(":") || /\s/.test(id)) return null;
    return `plant:${id}`;
  }

  static actionForEventType(eventType: unknown): QuickLogV2Action {
    if (eventType === "watering") return "water";
    if (eventType === "feeding") return "feed";
    return "note";
  }

  static eventTypeFromDetail(detail: unknown): string | null {
    if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
    const eventType = (detail as { eventType?: unknown }).eventType;
    return typeof eventType === "string" ? eventType : null;
  }

  static plantIdFromDetail(detail: unknown): unknown {
    if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
    return (detail as { plantId?: unknown }).plantId;
  }
}
