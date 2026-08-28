import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ResultBlockProps {
  eyebrow: string;
  value: ReactNode;
  unit?: string;
  formula: string;
  children?: ReactNode;
  className?: string;
  testId?: string;
}

export default function ResultBlock({
  eyebrow,
  value,
  unit,
  formula,
  children,
  className,
  testId,
}: ResultBlockProps) {
  return (
    <Card className={cn("border-primary/30 bg-primary/[0.04]", className)} data-testid={testId}>
      <CardHeader className="pb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary/80">
          {eyebrow}
        </p>
        <div className="flex flex-wrap items-baseline gap-2">
          <div className="font-display text-3xl font-bold tabular-nums sm:text-4xl">{value}</div>
          {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="rounded-lg bg-background/70 px-3 py-2 font-mono text-xs leading-5 text-muted-foreground">
          {formula}
        </p>
        {children}
      </CardContent>
    </Card>
  );
}
