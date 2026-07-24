import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SubscriberInterestShareCard from "@/components/SubscriberInterestShareCard";
import { supabase } from "@/integrations/supabase/client";
import { trackPricingEvent } from "@/lib/pricingAnalytics";
import {
  buildSubscriberInterestLead,
  subscriberInterestPlanLabel,
  type SubscriberInterestPlanId,
} from "@/lib/subscriberInterestRules";
import type { PaidInterestLeadSource } from "@/lib/paidAcquisitionAttributionRules";

export interface SubscriberInterestFormProps {
  planId: SubscriberInterestPlanId;
  leadSource?: PaidInterestLeadSource;
}

export default function SubscriberInterestForm({
  planId,
  leadSource = "pricing_interest",
}: SubscriberInterestFormProps) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSubmitted(false);
    setError(null);
  }, [planId, leadSource]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const lead = buildSubscriberInterestLead({ email, planId, leadSource });
    if (lead.ok === false) {
      setError(
        lead.reason === "invalid_email"
          ? "Enter a valid email address."
          : "Choose a supported paid plan.",
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    const { error: insertError } = await supabase.from("leads").insert(lead.payload);
    setSubmitting(false);

    if (insertError) {
      setError("We couldn't save your request. Please try again.");
      trackPricingEvent("pricing_interest_submit_failed", { plan: planId, source: leadSource });
      return;
    }

    setSubmitted(true);
    trackPricingEvent("pricing_interest_submitted", { plan: planId, source: leadSource });
  }

  const planLabel = subscriberInterestPlanLabel(planId);

  if (submitted) {
    return (
      <div
        data-testid="subscriber-interest-success"
        data-lead-source={leadSource}
        className="rounded-xl border border-primary/30 bg-primary/5 p-5"
      >
        <div role="status">
          <p className="font-semibold">You're on the {planLabel} launch list.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            We'll send one email when real checkout is available. No subscription started, no charge
            was made, and no Founder spot was reserved.
          </p>
        </div>
        <SubscriberInterestShareCard planId={planId} />
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3"
      data-testid="subscriber-interest-form"
      data-lead-source={leadSource}
    >
      <p className="text-sm font-medium" data-testid="subscriber-interest-plan">
        Selected interest: {planLabel}
      </p>
      <div className="space-y-2">
        <Label htmlFor="subscriber-interest-email">Email</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="subscriber-interest-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={255}
            autoComplete="email"
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? "subscriber-interest-error" : undefined}
            placeholder="grower@example.com"
          />
          <Button type="submit" disabled={submitting} className="sm:shrink-0">
            {submitting ? "Saving…" : "Email me when checkout opens"}
          </Button>
        </div>
      </div>
      {error && (
        <p id="subscriber-interest-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        One requested checkout-availability email for this plan. No SMS, automatic subscription,
        charge, or reservation.
      </p>
    </form>
  );
}
