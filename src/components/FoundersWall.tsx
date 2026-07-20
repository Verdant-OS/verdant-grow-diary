/**
 * FoundersWall — public roster component.
 *
 * Renders rows from `founders_wall_public`. Every optional_link is
 * rendered with `rel="noopener noreferrer nofollow"` and `target="_blank"`
 * so we do not leak referrer to arbitrary outbound sites, do not enable
 * tabnabbing, and do not hand SEO signal to whatever link a founder puts
 * on a public cannabis-adjacent wall. The DB CHECK guarantees the URL
 * is https-only; the rel attrs are the defense-in-depth layer.
 */
import { useFoundersWall } from "@/hooks/useFoundersWall";

export interface FoundersWallProps {
  /** Optional cap on rendered rows (roster is naturally ≤ 100). */
  limit?: number;
}

export default function FoundersWall({ limit }: FoundersWallProps) {
  const state = useFoundersWall();

  if (state.status === "loading") {
    return (
      <div
        data-testid="founders-wall-loading"
        className="text-sm text-muted-foreground"
        aria-live="polite"
      >
        Loading Founders Wall…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div
        data-testid="founders-wall-error"
        className="text-sm text-muted-foreground"
      >
        The Founders Wall is temporarily unavailable.
      </div>
    );
  }

  const rows = limit ? state.rows.slice(0, limit) : state.rows;

  if (rows.length === 0) {
    return (
      <div
        data-testid="founders-wall-empty"
        className="text-sm text-muted-foreground"
      >
        No founders have opted in to the public wall yet.
      </div>
    );
  }

  return (
    <ul
      data-testid="founders-wall"
      className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3"
    >
      {rows.map((row) => (
        <li
          key={row.founder_number}
          data-testid="founders-wall-row"
          data-founder-number={row.founder_number}
          className="flex items-center gap-3 rounded-md border border-border/60 bg-card/40 px-3 py-2"
        >
          <span className="inline-flex min-w-[2.5rem] justify-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            #{String(row.founder_number).padStart(3, "0")}
          </span>
          <span className="flex-1 truncate text-sm">
            {row.public_display_name ?? (
              <span className="text-muted-foreground">Anonymous founder</span>
            )}
          </span>
          {row.optional_link ? (
            <a
              href={row.optional_link}
              target="_blank"
              rel="noopener noreferrer nofollow"
              data-testid="founders-wall-row-link"
              className="text-xs text-primary underline underline-offset-2 hover:opacity-80"
            >
              Link
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
