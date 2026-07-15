import { useEffect } from "react";
import { Share2, ShieldCheck } from "lucide-react";

import GrowerInviteShareCard from "@/components/GrowerInviteShareCard";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePageSeo } from "@/hooks/usePageSeo";
import { trackPricingEvent } from "@/lib/pricingAnalytics";

export default function GrowerInvite() {
  usePageSeo({
    title: "Invite a Grower | Verdant Grow Diary",
    description: "Share a private, PII-free link to Verdant with another grower.",
    path: "/invite",
  });

  useEffect(() => {
    trackPricingEvent("grower_invite_page_view");
  }, []);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6" data-testid="grower-invite-page">
      <PageHeader
        title="Invite a grower"
        description="Recommend Verdant to someone who values plant memory, sensor truth, and grower-controlled decisions."
        icon={<Share2 className="h-5 w-5" />}
      />

      <GrowerInviteShareCard />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck aria-hidden="true" className="h-5 w-5 text-primary" />
            What the link does—and does not do
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            It opens Verdant's public product tour, where the recipient can see the One-Tent Loop,
            start Free, or review paid plans.
          </p>
          <p>It never grants access to your grows, plants, diary, photos, sensors, or account.</p>
          <p>It does not promise a reward, discount, entitlement, or reserved Founder position.</p>
        </CardContent>
      </Card>
    </main>
  );
}
