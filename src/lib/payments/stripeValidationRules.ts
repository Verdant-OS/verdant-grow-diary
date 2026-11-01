export function stripeCreditsVisibleInEnvironment(source: string, rowEnvironment: string, serverEnvironment: 'sandbox' | 'live') {
  return source !== 'stripe_credit_pack' || rowEnvironment === 'live' || (serverEnvironment === 'sandbox' && rowEnvironment === 'sandbox');
}
