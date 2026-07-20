import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
  meta?: ReactNode;
  className?: string;
}

export default function PageHeader({
  title,
  description,
  icon,
  actions,
  eyebrow,
  meta,
  className,
}: Props) {
  return (
    <header
      className={cn(
        "relative mb-6 w-full min-w-0 overflow-hidden rounded-3xl border border-border/60 bg-card/70 p-4 shadow-card backdrop-blur-xl sm:p-5",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-primary/80"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 size-48 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {icon && (
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-inner">
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/80">
                {eyebrow}
              </p>
            )}
            <h1 className="break-words font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              {title}
            </h1>
            {description && (
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
            {meta && <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">{meta}</div>}
          </div>
        </div>
        {actions && (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto lg:shrink-0 lg:justify-end">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
