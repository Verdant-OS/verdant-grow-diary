/**
 * Per-card Open control. The accessible name is supplied by the caller so
 * two cards never share a bare "Open". The 24px minimum is inline so it
 * does not depend on a utility class loading.
 */
export function TimelineEntryOpenButton({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      data-testid="timeline-entry-open"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      className="inline-flex min-h-6 min-w-6 items-center justify-center gap-1 rounded-full border border-border/50 px-2 text-[11px] text-foreground hover:bg-secondary/60 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      style={{ minHeight: 24, minWidth: 24 }}
    >
      Open
    </button>
  );
}
