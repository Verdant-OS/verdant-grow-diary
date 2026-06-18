/**
 * CustomerModeGuide — public, read-only Customer Mode shell page.
 *
 * Mounted at /customer/:shareId OUTSIDE the AppShell so:
 *   - AppShell chrome (header, GlobalFastAddButton/Quick Log) is NOT rendered.
 *   - No auth-gated providers run.
 *
 * Hard constraints (presenter-only shell):
 *   - No Supabase imports. No fetch. No private diary, sensor, or
 *     raw_payload access. No AI/model calls. No Action Queue writes.
 *   - The :shareId path param is treated as opaque. It is NEVER rendered
 *     as a private grow/plant/tent id.
 *   - All content is customer-facing placeholder copy until a
 *     share-token publishing backend exists.
 */
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import CustomerGuideSectionView from "@/components/customer/CustomerGuideSection";
import CustomerGuideTimeline from "@/components/customer/CustomerGuideTimeline";
import { buildCustomerModeGuideViewModel } from "@/lib/customerModeGuideViewModel";

export default function CustomerModeGuide() {
  const params = useParams<{ shareId?: string }>();
  const vm = useMemo(
    () => buildCustomerModeGuideViewModel(params.shareId ?? null),
    [params.shareId],
  );

  return (
    <main
      data-testid="customer-mode-guide-page"
      data-mode="customer"
      className="min-h-screen bg-background text-foreground"
    >
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-3xl px-5 py-6">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Customer Mode
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            {vm.brandLabel}
          </h1>
          <p
            data-testid="customer-mode-shell-disclaimer"
            className="mt-3 text-xs text-amber-300/80"
          >
            {vm.shellDisclaimer}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-6 space-y-4">
        {vm.sections.map((section) => (
          <CustomerGuideSectionView key={section.id} section={section} />
        ))}

        <CustomerGuideTimeline
          label={vm.timeline.label}
          events={vm.timeline.events}
          emptyCopy={vm.timeline.emptyCopy}
        />

        <footer
          data-testid="customer-mode-guide-footer"
          className="pt-4 text-center text-xs text-muted-foreground"
        >
          Powered by Verdant — private grow data stays with the grower.
        </footer>
      </div>
    </main>
  );
}
