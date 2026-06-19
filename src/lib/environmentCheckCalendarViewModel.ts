/**
 * environmentCheckCalendarViewModel — pure helper that groups Environment
 * Check Quick Log diary entries onto calendar days. Designed to be
 * consumed by any existing diary-backed calendar surface without a new
 * persistence path or table.
 *
 * Hard constraints:
 *   - Pure. No I/O, no React, no Supabase, no Action Queue, no AI.
 *   - Never labels Environment Check data as live.
 *   - Never reads from or creates `sensor_readings` / `calendar_events`.
 *   - Never throws — untrusted inputs.
 */
import {
  buildEnvironmentCheckTimelineList,
  type EnvironmentCheckTimelineRawEntry,
  type EnvironmentCheckTimelineViewModel,
} from "./environmentCheckTimelineViewModel";

export const ENVIRONMENT_CHECK_CALENDAR_LABEL = "Environment Check" as const;
export const ENVIRONMENT_CHECK_CALENDAR_SUBTITLE =
  "Quick Log environment check — not live sensor telemetry." as const;
export const ENVIRONMENT_CHECK_CALENDAR_EMPTY =
  "No environment checks logged for this period." as const;

export interface EnvironmentCheckCalendarEvent {
  id: string;
  occurredAt: string;
  dateKey: string;
  label: typeof ENVIRONMENT_CHECK_CALENDAR_LABEL;
  subtitle: typeof ENVIRONMENT_CHECK_CALENDAR_SUBTITLE;
  fields: EnvironmentCheckTimelineViewModel["fields"];
  noteSummary: string | null;
  /** Always false — Environment Check is never a sensor_readings row. */
  isSensorReading: false;
  /** Always true — never label as live telemetry. */
  notLive: true;
}

export interface EnvironmentCheckCalendarDayGroup {
  dateKey: string;
  events: EnvironmentCheckCalendarEvent[];
  count: number;
}

function toCalendarEvent(
  vm: EnvironmentCheckTimelineViewModel,
): EnvironmentCheckCalendarEvent {
  return {
    id: vm.entryId,
    occurredAt: vm.occurredAt,
    dateKey: vm.dateKey,
    label: ENVIRONMENT_CHECK_CALENDAR_LABEL,
    subtitle: ENVIRONMENT_CHECK_CALENDAR_SUBTITLE,
    fields: vm.fields.slice(),
    noteSummary: vm.noteSummary,
    isSensorReading: false,
    notLive: true,
  };
}

/**
 * Group Environment Check entries by UTC calendar day, newest-day-first.
 * Pure & deterministic.
 */
export function buildEnvironmentCheckCalendarGroups(
  rawEntries:
    | readonly EnvironmentCheckTimelineRawEntry[]
    | null
    | undefined,
): EnvironmentCheckCalendarDayGroup[] {
  const list = buildEnvironmentCheckTimelineList(rawEntries);
  const byDate = new Map<string, EnvironmentCheckCalendarEvent[]>();
  for (const vm of list) {
    const ev = toCalendarEvent(vm);
    const bucket = byDate.get(ev.dateKey);
    if (bucket) bucket.push(ev);
    else byDate.set(ev.dateKey, [ev]);
  }
  const groups: EnvironmentCheckCalendarDayGroup[] = [];
  for (const [dateKey, items] of byDate) {
    items.sort((a, b) => {
      const t = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
      if (t !== 0) return t;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    groups.push({ dateKey, events: items, count: items.length });
  }
  groups.sort((a, b) => (a.dateKey < b.dateKey ? 1 : a.dateKey > b.dateKey ? -1 : 0));
  return groups;
}
