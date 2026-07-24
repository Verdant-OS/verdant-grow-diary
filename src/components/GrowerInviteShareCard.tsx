import { useState } from "react";
import { Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildGrowerInviteShareData } from "@/lib/growerInviteRules";
import { trackPricingEvent } from "@/lib/pricingAnalytics";

type ShareStatus = "idle" | "copied" | "manual";

export default function GrowerInviteShareCard() {
  const [status, setStatus] = useState<ShareStatus>("idle");
  const shareData = buildGrowerInviteShareData();

  async function shareVerdant() {
    const nativeShare = navigator.share?.bind(navigator);
    const clipboard = navigator.clipboard?.writeText?.bind(navigator.clipboard);
    const source = nativeShare ? "native_share" : "copy_link";

    trackPricingEvent("grower_invite_share_clicked", { source });

    try {
      if (nativeShare) {
        await nativeShare(shareData);
        setStatus("idle");
        trackPricingEvent("grower_invite_share_completed", { source });
        return;
      }
      if (clipboard) {
        await clipboard(shareData.url);
        setStatus("copied");
        trackPricingEvent("grower_invite_share_completed", { source });
        return;
      }
      setStatus("manual");
      trackPricingEvent("grower_invite_share_failed", { reason: "copy_unavailable" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("manual");
      trackPricingEvent("grower_invite_share_failed", { reason: "share_unavailable" });
    }
  }

  return (
    <section
      aria-labelledby="grower-invite-share-heading"
      className="rounded-2xl border border-primary/30 bg-primary/5 p-6 md:p-8"
      data-testid="grower-invite-share-card"
    >
      <h2 id="grower-invite-share-heading" className="font-display text-2xl font-semibold">
        Send a private recommendation
      </h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Verdant never uploads your contacts or sees who receives the link. It contains fixed
        campaign attribution only—no user ID, email, referral reward, entitlement, or reserved
        Founder spot.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Input
          aria-label="Grower invite link"
          readOnly
          value={shareData.url}
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button type="button" onClick={shareVerdant} className="shrink-0">
          <Share2 aria-hidden="true" className="mr-2 h-4 w-4" />
          Share Verdant
        </Button>
      </div>
      <p className="mt-3 min-h-5 text-xs text-muted-foreground" role="status">
        {status === "copied" && "Link copied. Send it wherever you already talk with growers."}
        {status === "manual" && "Select and copy the link above to share it manually."}
      </p>
    </section>
  );
}
