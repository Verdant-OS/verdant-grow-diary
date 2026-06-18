/**
 * CustomerGuideSection — presenter for a single customer-facing branded
 * content section. Renders plain text only. No private grow data.
 */
import type { CustomerGuideSection } from "@/lib/customerModeGuideViewModel";

export interface CustomerGuideSectionProps {
  section: CustomerGuideSection;
}

export default function CustomerGuideSectionView({
  section,
}: CustomerGuideSectionProps) {
  return (
    <section
      data-testid={`customer-guide-section-${section.id}`}
      data-placeholder={section.isPlaceholder ? "true" : "false"}
      aria-labelledby={`customer-guide-section-${section.id}-heading`}
      className="rounded-xl border border-border/60 bg-card/60 p-5"
    >
      <h2
        id={`customer-guide-section-${section.id}-heading`}
        className="text-base font-semibold tracking-tight"
      >
        {section.title}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
        {section.body}
      </p>
      {section.isPlaceholder ? (
        <p
          data-testid={`customer-guide-section-${section.id}-placeholder-label`}
          className="mt-3 text-[11px] uppercase tracking-[0.14em] text-amber-300/80"
        >
          Customer-facing placeholder content
        </p>
      ) : null}
    </section>
  );
}
