import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  descriptionRole,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** Announce the description to screen readers, e.g. "alert" when it reports a failure. */
  descriptionRole?: "alert" | "status";
}) {
  return (
    <div className={cn("py-16 text-center glass rounded-2xl", className)}>
      {icon && (
        <div className="mx-auto h-14 w-14 rounded-2xl bg-secondary/40 flex items-center justify-center text-primary mb-3">
          {icon}
        </div>
      )}
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto" role={descriptionRole}>
          {description}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
