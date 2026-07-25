/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, brand, signOff, styles } from './_layout.tsx'

interface Props {
  firstName?: string
  growName?: string
  tentName?: string
  plantSummary?: string
  observation?: string
  suggestedAction?: string
  timelineUrl?: string
}

const Email = ({
  firstName,
  growName = 'your grow',
  tentName,
  plantSummary,
  observation,
  suggestedAction,
  timelineUrl = 'https://verdantgrowdiary.com/dashboard',
}: Props) => (
  <EmailLayout preview={`Grow update: ${growName}${tentName ? ` / ${tentName}` : ''}`}>
    <Text style={styles.h1}>
      {firstName ? `Hey ${firstName},` : 'Hey,'} here&rsquo;s what Verdant saw.
    </Text>
    <Text style={styles.p}>
      Update on <strong>{growName}</strong>
      {tentName ? (
        <>
          {' '}/ <strong>{tentName}</strong>
        </>
      ) : null}
      . This is an observation from your own logs and sensors — no
      automation ran and nothing was changed on your setup.
    </Text>
    {plantSummary && (
      <Section style={styles.callout}>
        <Text style={{ ...styles.muted, margin: '0 0 4px' }}>Plants</Text>
        <Text style={{ ...styles.p, margin: 0 }}>{plantSummary}</Text>
      </Section>
    )}
    {observation && (
      <Section style={styles.callout}>
        <Text style={{ ...styles.muted, margin: '0 0 4px' }}>What Verdant noticed</Text>
        <Text style={{ ...styles.p, margin: 0 }}>{observation}</Text>
      </Section>
    )}
    {suggestedAction && (
      <Section style={styles.callout}>
        <Text style={{ ...styles.muted, margin: '0 0 4px' }}>Suggested next step</Text>
        <Text style={{ ...styles.p, margin: 0 }}>{suggestedAction}</Text>
        <Text style={{ ...styles.muted, margin: '8px 0 0', fontSize: '12px' }}>
          Suggestions are grower-approved. Verdant never acts on your equipment.
        </Text>
      </Section>
    )}
    <Button href={timelineUrl} style={styles.button}>
      Open the timeline
    </Button>
    <Text style={{ ...styles.muted, marginTop: '18px' }}>
      Want fewer of these, or a different cadence? Adjust email preferences in
      your{' '}
      <a
        href="https://verdantgrowdiary.com/account/notifications"
        style={{ color: brand.primary }}
      >
        account settings
      </a>
      .
    </Text>
    {signOff()}
  </EmailLayout>
)

export const template = {
  component: Email,
  subject: (data: Record<string, unknown>) => {
    const grow = typeof data.growName === 'string' ? data.growName : 'your grow'
    return `Grow update: ${grow}`
  },
  displayName: 'Grow update',
  previewData: {
    firstName: 'Alex',
    growName: 'Winter Run 3',
    tentName: 'Tent A',
    plantSummary: '4 plants in early flower, day 21/63.',
    observation:
      'VPD trended above 1.6 kPa for 6 hours overnight in Tent A. Leaf edges on Plant 2 curled slightly in the last photo log.',
    suggestedAction:
      'Consider raising humidity 5–10% for the next dark cycle and re-checking leaf posture in 24 hours before changing feed.',
    timelineUrl: 'https://verdantgrowdiary.com/grows/demo',
  },
} satisfies TemplateEntry
