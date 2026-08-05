/**
 * Formats an instant for an HTML `datetime-local` input without changing the
 * user's local wall-clock time.
 */
export function toDateTimeLocalInputValue(date: Date): string {
  if (!Number.isFinite(date.getTime())) return "";

  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
