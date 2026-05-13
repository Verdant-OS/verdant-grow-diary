import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions, icon: Icon }: {
  title: string; subtitle?: string; actions?: ReactNode; icon?: any;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-semibold flex items-center gap-3">
          {Icon && <span className="h-9 w-9 rounded-lg gradient-leaf flex items-center justify-center"><Icon className="h-5 w-5 text-primary-foreground" /></span>}
          {title}
        </h1>
        {subtitle && <p className="text-muted-foreground mt-1 text-sm md:text-base">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action, icon: Icon }: {
  title: string; description?: string; action?: ReactNode; icon?: any;
}) {
  return (
    <div className="glass rounded-xl p-10 text-center">
      {Icon && <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center"><Icon className="h-7 w-7 text-primary" /></div>}
      <div className="font-display text-lg font-semibold">{title}</div>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean }) {
  return (
    <div className={cn("glass rounded-xl p-5", accent && "border-primary/30")}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 font-display text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
