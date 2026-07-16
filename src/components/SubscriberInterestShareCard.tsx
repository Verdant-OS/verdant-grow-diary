import { useState } from "react";
import { Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trackPricingEvent } from "@/lib/pricingAnalytics";
import {
  buildSubscriberInterestReferralData,
  subscriberInterestReferralButtonLabel,
} from "@/lib/subscriberInterestReferralRules";
import type { SubscriberInterestPlanId } from "@/lib/subscriberInterestRules";

export interface SubscriberInterestShareCardProps {
  planId: SubscriberInterestPlanId;
}

type ShareStatus = "idle" | "copied" | "manual";

export default function SubscriberInterestShareCard({ planId }: SubscriberInterestShareCardProps) {
  const [status, setStatus] = useState<ShareStatus>("idle");
  const shareData = buildSubscriberInterestReferralData(planId);

  if (!shareData) return null;

  async function sharePaidPlan() {
    const nativeShare = navigator.share?.bind(navigator);
    const clipboard = navigator.clipboard?.writeText?.bind(navigator.clipboard);
    const source = nativeShare ? "native_share" : "copy_link";

    trackPricingEvent("pricing_interest_share_clicked", { plan: planId, source });

    try {
      if (nativeShare) {
        await nativeShare(shareData);
        setStatus("idle");
        trackPricingEvent("pricing_interest_share_completed", { plan: planId, source });
        return;
      }
      if (clipboard) {
        await clipboard(shareData.url);
        setStatus("copied");
        trackPricingEvent("pricing_interest_share_completed", { plan: planId, source });
        return;
      }
      setStatus("manual");
      trackPricingEvent("pricing_interest_share_failed", {
        plan: planId,
        reason: "copy_unavailable",
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("manual");
      trackPricingEvent("pricing_interest_share_failed", {
        plan: planId,
        reason: "share_unavailable",
      });
    }
  }

  return (
    <section
      aria-labelledby="subscriber-interest-share-heading"
      className="mt-5 border-t border-primary/20 pt-5"
      data-testid="subscriber-interest-share-card"
    >
      <h3 id="subscriber-interest-share-heading" className="font-semibold">
        Know another grower who may want this?
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Share the selected plan. The link contains campaign attribution only—no email, personal
        identifier, referral reward, or reserved spot.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label="Paid plan share link"
          readOnly
          value={shareData.url}
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button type="button" onClick={sharePaidPlan} className="shrink-0">
          <Share2 aria-hidden="true" className="mr-2 h-4 w-4" />
          {subscriberInterestReferralButtonLabel(planId)}
        </Button>
      </div>
      <p className="mt-2 min-h-5 text-xs text-muted-foreground" role="status">
        {status === "copied" && "Link copied. Share it wherever you talk with growers."}
        {status === "manual" && "Select and copy the link above to share it manually."}
      </p>
    </section>
  );
}
