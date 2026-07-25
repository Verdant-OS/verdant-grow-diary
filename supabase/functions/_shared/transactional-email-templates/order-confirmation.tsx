/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, brand, signOff, styles } from './_layout.tsx'

interface Props {
  firstName?: string
  productName?: string
  amountFormatted?: string
  orderId?: string
  receiptUrl?: string
  dashboardUrl?: string
}

const Email = ({
  firstName,
  productName = 'Verdant Grow Diary',
  amountFormatted,
  orderId,
  receiptUrl,
  dashboardUrl = 'https://verdantgrowdiary.com/dashboard',
}: Props) => (
  <EmailLayout preview={`Your ${productName} order is confirmed.`}>
    <Text style={styles.h1}>
      {firstName ? `Thanks, ${firstName}.` : 'Thanks for your order.'}
    </Text>
    <Text style={styles.p}>
      Your purchase of <strong>{productName}</strong> is confirmed. Access is
      already active on your account — no activation steps needed.
    </Text>
    {(amountFormatted || orderId) && (
      <Section style={styles.callout}>
        {amountFormatted && (
          <Text style={{ ...styles.muted, margin: '0 0 6px' }}>
            Amount charged: <strong style={{ color: brand.surfaceText }}>{amountFormatted}</strong>
          </Text>
        )}
        {orderId && (
          <Text style={{ ...styles.muted, margin: 0 }}>
            Order reference: <span style={{ color: brand.surfaceText }}>{orderId}</span>
          </Text>
        )}
      </Section>
    )}
    <Button href={dashboardUrl} style={styles.button}>
      Open Verdant
    </Button>
    {receiptUrl && (
      <Text style={{ ...styles.muted, marginTop: '18px' }}>
        Need a formal receipt or invoice?{' '}
        <a href={receiptUrl} style={{ color: brand.primary }}>
          View it here
        </a>
        .
      </Text>
    )}
    <Text style={{ ...styles.p, marginTop: '20px' }}>
      If anything looks off — wrong plan, wrong amount, duplicate charge —
      reply to this email and I&rsquo;ll fix it personally.
    </Text>
    {signOff()}
  </EmailLayout>
)

export const template = {
  component: Email,
  subject: (data: Record<string, unknown>) => {
    const product = typeof data.productName === 'string' ? data.productName : 'Verdant Grow Diary'
    return `Your ${product} order is confirmed`
  },
  displayName: 'Order confirmation',
  previewData: {
    firstName: 'Alex',
    productName: 'Verdant Founder Lifetime',
    amountFormatted: '$129.00 USD',
    orderId: 'txn_01hs...9k',
    dashboardUrl: 'https://verdantgrowdiary.com/dashboard',
  },
} satisfies TemplateEntry
