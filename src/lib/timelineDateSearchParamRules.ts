import { isTimelineDateFilterValue } from "@/lib/timelineEvidenceFilterRules";

export const TIMELINE_DATE_START_PARAM = "start";
export const TIMELINE_DATE_END_PARAM = "end";

/** Mirror the date inputs into start/end params. Blank or non-ISO values are removed. */
export function timelineDateParamsAfterSync(
  params: URLSearchParams,
  start: string,
  end: string,
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (isTimelineDateFilterValue(start)) next.set(TIMELINE_DATE_START_PARAM, start);
  else next.delete(TIMELINE_DATE_START_PARAM);
  if (isTimelineDateFilterValue(end)) next.set(TIMELINE_DATE_END_PARAM, end);
  else next.delete(TIMELINE_DATE_END_PARAM);
  return next;
}
