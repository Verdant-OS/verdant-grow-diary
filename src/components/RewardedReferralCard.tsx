/**
 * RewardedReferralCard — "refer a friend, you both get 10 AI Doctor credits".
 *
 * A NEW rewarded surface, deliberately separate from the reward-free /invite
 * share card (that surface is test-fenced against referral rewards). Mirrors
 * the GrowerInviteShareCard share ladder (native share → clipboard → manual)
 * and adds the loading / absent-code states a user-scoped card needs.
 *
 * Presentation only: the card never grants credits — the give/get flow is
 * server-side (signup capture → email-confirm gate → convert_referral).
 */
import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import {
  buildReferralShareData,
  loadOwnReferralCode,
  REFERRAL_GET_CREDITS,
  REFERRAL_GIVE_CREDITS,
  type ReferralCodeClient,
  type ReferralShareData,
} from "@/lib/referralShareRules";
import { trackPricingEvent } from "@/lib/pricingAnalytics";

type ShareStatus = "idle" | "copied" | "manual";

export default function RewardedReferralCard() {
  const { user } = useAuth();
  const [status, setStatus] = useState<ShareStatus>("idle");
  const [shareData, setShareData] = useState<ReferralShareData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadOwnReferralCode(supabase as unknown as ReferralCodeClient, user?.id).then((code) => {
      if (cancelled) return;
      setShareData(buildReferralShareData(code, window.location.origin));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (shareData) trackPricingEvent("referral_card_view");
  }, [shareData]);

  async function shareReferral() {
    if (!shareData) return;
    const nativeShare = navigator.share?.bind(navigator);
    const clipboard = navigator.clipboard?.writeText?.bind(navigator.clipboard);
    const source = nativeShare ? "native_share" : "copy_link";

    trackPricingEvent("referral_share_clicked", { source });

    try {
      if (nativeShare) {
        await nativeShare(shareData);
        setStatus("idle");
        trackPricingEvent("referral_share_completed", { source });
        return;
      }
      if (clipboard) {
        await clipboard(shareData.url);
        setStatus("copied");
        trackPricingEvent("referral_share_completed", { source });
        return;
      }
      setStatus("manual");
      trackPricingEvent("referral_share_failed", { reason: "copy_unavailable" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("manual");
      trackPricingEvent("referral_share_failed", { reason: "share_unavailable" });
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="rewarded-referral-loading">
        Loading your referral link…
      </p>
    );
  }

  if (!shareData) {
    // Code not provisioned yet (migration not applied / fresh account race).
    return (
      <p className="text-sm text-muted-foreground" data-testid="rewarded-referral-absent">
        Your referral link isn&rsquo;t ready yet. Check back soon.
      </p>
    );
  }

  return (
    <div data-testid="rewarded-referral-card">
      <p className="text-sm leading-6 text-muted-foreground">
        Share your link. When a friend signs up and confirms their email, you get{" "}
        {REFERRAL_GIVE_CREDITS} AI Doctor credits and they get {REFERRAL_GET_CREDITS}.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Input
          aria-label="Your referral link"
          readOnly
          value={shareData.url}
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button type="button" onClick={shareReferral} className="shrink-0">
          <Share2 aria-hidden="true" className="mr-2 h-4 w-4" />
          Share link
        </Button>
      </div>
      <p className="mt-3 min-h-5 text-xs text-muted-foreground" role="status">
        {status === "copied" && "Link copied. Credits land after your friend confirms their email."}
        {status === "manual" && "Select and copy the link above to share it manually."}
      </p>
    </div>
  );
}
