/**
 * QuickLogTargetPanel — presenter for the Quick Log target summary.
 *
 * Purely renders the view-model built by
 * `buildQuickLogTargetPanel`. No data fetching. No mutation. No save
 * state. Kept mobile-friendly with stacked label/value rows.
 */
import type {
  QuickLogTargetPanel as PanelVM,
  QuickLogTargetPanelField,
} from "@/lib/quickLogTargetPanelViewModel";

interface Props {
  panel: PanelVM;
  className?: string;
}

function emphasisClass(field: QuickLogTargetPanelField): string {
  if (field.emphasis === "warning") return "text-amber-600 dark:text-amber-400";
  if (field.emphasis === "muted") return "text-muted-foreground";
  return "text-foreground";
}

export default function QuickLogTargetPanel({ panel, className }: Props) {
  if (!panel?.visible) return null;
  return (
    <section
      aria-label="Quick Log target details"
      data-testid="qlv2-target-panel"
      data-scope={panel.scope}
      className={[
        "mt-2 rounded-md border border-border/60 bg-secondary/10 p-3",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <dl className="grid grid-cols-[minmax(3.5rem,auto)_1fr] gap-x-3 gap-y-1 text-sm">
        {panel.fields.map((field) => (
          <div key={field.label} className="contents">
            <dt
              className="font-medium text-muted-foreground"
              data-testid={`qlv2-target-panel-${field.testId}-label`}
            >
              {field.label}
            </dt>
            <dd
              className={emphasisClass(field)}
              data-testid={`qlv2-target-panel-${field.testId}-value`}
              data-present={field.present ? "true" : "false"}
            >
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
