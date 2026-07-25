/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, signOff, styles } from './_layout.tsx'

interface Props {
  firstName?: string
  dashboardUrl?: string
  docsUrl?: string
}

const Email = ({
  firstName,
  dashboardUrl = 'https://verdantgrowdiary.com/dashboard',
  docsUrl = 'https://verdantgrowdiary.com/docs/quick-start',
}: Props) => (
  <EmailLayout preview="Welcome to Verdant — a quick start to your first grow.">
    <Text style={styles.h1}>
      {firstName ? `Welcome, ${firstName}.` : 'Welcome to Verdant.'}
    </Text>
    <Text style={styles.p}>
      Verdant is plant memory and sensor truth for serious growers. Grower
      decides, always — Verdant just makes the evidence easier to read.
    </Text>
    <Text style={styles.p}>To get value in the first ten minutes:</Text>
    <Text style={styles.p}>
      1. Create a Grow, add a Tent, and add one Plant.
      <br />
      2. Log the first Quick Note or photo from the plant page.
      <br />
      3. Add a sensor reading (manual is fine) so the timeline has real data.
    </Text>
    <Button href={dashboardUrl} style={styles.button}>
      Open your dashboard
    </Button>
    <Text style={{ ...styles.muted, marginTop: '18px' }}>
      Prefer to skim the guide first?{' '}
      <a href={docsUrl} style={{ color: '#8bd455' }}>
        Read the quick start
      </a>
      .
    </Text>
    <Text style={{ ...styles.p, marginTop: '20px' }}>
      Reply to this email with anything confusing, broken, or missing.
      I read every one.
    </Text>
    {signOff()}
  </EmailLayout>
)

export const template = {
  component: Email,
  subject: 'Welcome to Verdant Grow Diary',
  displayName: 'Welcome / onboarding',
  previewData: {
    firstName: 'Alex',
    dashboardUrl: 'https://verdantgrowdiary.com/dashboard',
  },
} satisfies TemplateEntry
