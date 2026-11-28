import { Link } from "@/lib/react-router-compat";
import { cn } from "@/lib/utils";
import {
  formatGlanceHeading,
  formatGlanceToggleLabel,
  type GlanceNameListView,
} from "@/lib/glanceNameListRules";

interface Props {
  view: GlanceNameListView;
  title: string;
  noun: { singular: string; plural: string };
  emptyText: string;
  loadingText: string;
  unknownText: string;
  onToggle: () => void;
  testId: string;
  className?: string;
}

/**
 * Presenter for the at-a-glance name list at the top of Grow and Tent pages.
 * Names are links with 44px touch targets; "See all" expands on the page.
 */
export default function GlanceNameList({
  view,
  title,
  noun,
  emptyText,
  loadingText,
  unknownText,
  onToggle,
  testId,
  className,
}: Props) {
  const listId = `${testId}-list`;
  return (
    <section
      aria-labelledby={`${testId}-heading`}
      data-testid={testId}
      data-state={view.state}
      className={cn("glass rounded-2xl p-3 mb-3", className)}
    >
      <h2 id={`${testId}-heading`} className="font-display text-sm font-semibold">
        {formatGlanceHeading(title, view)}
      </h2>
      {view.state === "list" ? (
        <>
          <ul id={listId} className="mt-2 flex flex-wrap gap-2" data-testid={`${testId}-items`}>
            {view.items.map((item) => (
              <li
                key={item.id}
                className={cn(
                  "min-w-0 max-w-full",
                  item.visibility === "desktop" && "hidden sm:block",
                  item.visibility === "expanded" && "hidden",
                )}
                data-visibility={item.visibility}
              >
                <Link
                  to={item.href}
                  className="inline-flex min-h-11 max-w-full items-center rounded-full border border-border/60 bg-secondary/40 px-3 text-sm font-medium hover:bg-secondary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  data-testid={`${testId}-item`}
                >
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
          {view.showToggle ? (
            <button
              type="button"
              aria-expanded={view.expanded}
              aria-controls={listId}
              onClick={onToggle}
              className={cn(
                "mt-2 inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                view.toggleMobileOnly && "sm:hidden",
              )}
              data-testid={`${testId}-toggle`}
            >
              {formatGlanceToggleLabel(view, noun)}
            </button>
          ) : null}
        </>
      ) : (
        <p
          className="mt-1 text-sm text-muted-foreground"
          data-testid={`${testId}-${view.state}`}
          role={view.state === "unknown" ? "status" : undefined}
        >
          {view.state === "empty"
            ? emptyText
            : view.state === "loading"
              ? loadingText
              : unknownText}
        </p>
      )}
    </section>
  );
}
