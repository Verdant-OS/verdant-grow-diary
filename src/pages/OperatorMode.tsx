/**
 * OperatorMode — dedicated operator-only page that hosts <OperatorModePanel />.
 * Kept intentionally thin: the panel is a self-contained presenter so it can
 * also be dropped onto Diagnostics or the schema-audit page later.
 */
import OperatorModePanel from "@/components/OperatorModePanel";
import { usePageSeo } from "@/hooks/usePageSeo";

export default function OperatorMode() {
  usePageSeo({
    title: "Operator Mode · Verdant",
    description:
      "Operator-only snapshot of critical Supabase migrations the shipped frontend depends on.",
    path: "/operator/mode",
    noindex: true,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Operator Mode</h1>
        <p className="text-sm text-muted-foreground">
          Fast health check for the migrations that most often drift between the shipped
          frontend and the live database.
        </p>
      </header>
      <OperatorModePanel />
    </div>
  );
}
