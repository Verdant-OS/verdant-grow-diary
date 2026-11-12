/**
 * I/O for the Stripe Pro checkout start: one call to the stripe-checkout
 * Edge function. The function reads the user from the caller's JWT; the body
 * carries only the plan key.
 */
import { supabase } from "@/integrations/supabase/client";
import { readEdgeFunctionErrorCode } from "@/lib/edgeFunctionError";
import { readStripeCheckoutUrl, type StripeProPlanKey } from "@/lib/stripeCheckoutClientRules";

export type StripeCheckoutStart =
  { ok: true; url: string } | { ok: false; code: string | null; status: number | null };

function readStatus(error: unknown): number | null {
  const status = (error as { context?: { status?: unknown } } | null)?.context?.status;
  return typeof status === "number" ? status : null;
}

export async function requestStripeCheckout(plan: StripeProPlanKey): Promise<StripeCheckoutStart> {
  try {
    const { data, error } = await supabase.functions.invoke("stripe-checkout", {
      body: { plan },
    });
    if (error) {
      return {
        ok: false,
        code: await readEdgeFunctionErrorCode(error),
        status: readStatus(error),
      };
    }
    const url = readStripeCheckoutUrl(data);
    return url === null ? { ok: false, code: null, status: null } : { ok: true, url };
  } catch {
    return { ok: false, code: null, status: null };
  }
}
