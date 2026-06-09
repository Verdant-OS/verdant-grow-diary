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
    <div className={cn("flex flex-wrap items-start justify-between gap-3 mb-6 w-full min-w-0", className)}>
      <div className="flex items-start gap-3 min-w-0 flex-1 basis-full sm:basis-auto">
        {icon && <div className="h-10 w-10 rounded-xl glass flex items-center justify-center text-primary shrink-0">{icon}</div>}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight break-words">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-1 break-words">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
    </div>
  );
}
