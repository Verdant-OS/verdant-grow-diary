import { useState } from "react";
import { Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildFounderShareData } from "@/lib/founderShareRules";
import { trackPricingEvent } from "@/lib/pricingAnalytics";

type ShareStatus = "idle" | "copied" | "manual";

export default function FounderShareCard() {
  const [status, setStatus] = useState<ShareStatus>("idle");
  const shareData = buildFounderShareData();

  async function shareFounderPage() {
    const nativeShare = navigator.share?.bind(navigator);
    const clipboard = navigator.clipboard?.writeText?.bind(navigator.clipboard);
    trackPricingEvent("founder_share_clicked", {
      source: nativeShare ? "native_share" : "copy_link",
    });

    try {
      if (nativeShare) {
        await nativeShare(shareData);
        setStatus("idle");
        trackPricingEvent("founder_share_completed", { source: "native_share" });
        return;
      }
      if (clipboard) {
        await clipboard(shareData.url);
        setStatus("copied");
        trackPricingEvent("founder_share_completed", { source: "copy_link" });
        return;
      }
      setStatus("manual");
      trackPricingEvent("founder_share_failed", { reason: "copy_unavailable" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("manual");
      trackPricingEvent("founder_share_failed", { reason: "share_unavailable" });
    }
  }

  return (
    <section
      aria-labelledby="founder-share-heading"
      className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-left md:p-8"
      data-testid="founder-share-card"
    >
      <h2 id="founder-share-heading" className="font-display text-2xl font-semibold">
        Know a grower who values careful software?
      </h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Share the Founder page with them. The link carries campaign attribution only—no personal
        identifier, referral reward, or reserved Founder spot.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Input
          aria-label="Founder page share link"
          readOnly
          value={shareData.url}
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button type="button" onClick={shareFounderPage} className="shrink-0">
          <Share2 aria-hidden="true" className="mr-2 h-4 w-4" />
          Share Founder page
        </Button>
      </div>
      <p className="mt-3 min-h-5 text-xs text-muted-foreground" role="status">
        {status === "copied" && "Link copied. Share it wherever you talk with growers."}
        {status === "manual" && "Select and copy the link above to share it manually."}
      </p>
    </section>
  );
}
