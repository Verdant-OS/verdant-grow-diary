import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export default function PageHeader({ title, description, icon, actions, className }: Props) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 mb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="h-10 w-10 rounded-xl glass flex items-center justify-center text-primary shrink-0">{icon}</div>}
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight break-words">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
