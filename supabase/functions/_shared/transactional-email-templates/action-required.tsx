/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, brand, signOff, styles } from './_layout.tsx'

interface Props {
  firstName?: string
  headline?: string
  reason?: string
  actionLabel?: string
  actionUrl?: string
  deadlineText?: string
}

const Email = ({
  firstName,
  headline = 'Action needed on your Verdant account',
  reason = 'One item on your account needs your attention before it can proceed.',
  actionLabel = 'Review now',
  actionUrl = 'https://verdantgrowdiary.com/account',
  deadlineText,
}: Props) => (
  <EmailLayout preview={headline}>
    <Text style={styles.h1}>{headline}</Text>
    <Text style={styles.p}>
      {firstName ? `Hi ${firstName},` : 'Hi,'} {reason}
    </Text>
    {deadlineText && (
      <Section style={styles.callout}>
        <Text style={{ ...styles.muted, margin: 0 }}>
          <strong style={{ color: brand.surfaceText }}>When:</strong> {deadlineText}
        </Text>
      </Section>
    )}
    <Button href={actionUrl} style={styles.button}>
      {actionLabel}
    </Button>
    <Text style={{ ...styles.muted, marginTop: '18px' }}>
      If the button doesn&rsquo;t work, paste this link into your browser:
      <br />
      <span style={{ color: brand.surfaceText, wordBreak: 'break-all' }}>
        {actionUrl}
      </span>
    </Text>
    <Text style={{ ...styles.p, marginTop: '20px' }}>
      If you weren&rsquo;t expecting this or something looks wrong, reply and
      I&rsquo;ll take a look before anything changes on your account.
    </Text>
    {signOff()}
  </EmailLayout>
)

export const template = {
  component: Email,
  subject: (data: Record<string, unknown>) =>
    typeof data.headline === 'string' && data.headline.length > 0
      ? data.headline
      : 'Action needed on your Verdant account',
  displayName: 'Action required',
  previewData: {
    firstName: 'Alex',
    headline: 'Update your payment method to keep Pro active',
    reason:
      'Your last renewal payment failed. Verdant will keep retrying, but updating your card now avoids losing access.',
    actionLabel: 'Update payment method',
    actionUrl: 'https://verdantgrowdiary.com/account/billing',
    deadlineText: 'Retries stop in about 3 days.',
  },
} satisfies TemplateEntry
