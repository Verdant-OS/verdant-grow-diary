import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface Props {
  title: string;
  body: string;
  onClose: () => void;
}

/** Honest empty state for a permalink that cannot show an entry. */
export default function TimelineEntryDetailUnavailable({ title, body, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="timeline-entry-detail-unavailable"
      className="fixed inset-0 z-50 flex w-full items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="glass relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-border/50 p-5 sm:max-w-lg sm:rounded-2xl">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close entry details"
          data-testid="timeline-entry-detail-unavailable-close"
          className="absolute top-3 right-3 rounded-full p-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground focus:ring-2 focus:ring-primary/60 focus:outline-hidden"
        >
          <X className="h-4 w-4" />
        </button>
        <h2 className="pr-8 text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
