/// <reference types="npm:@types/react@18.3.1" />
import * as React from "npm:react@18.3.1";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
  Link,
} from "npm:@react-email/components@0.0.22";

export const brand = {
  bodyBg: "#ffffff",
  surface: "#0f1b10",
  surfaceText: "#e6f2df",
  muted: "#8a9c85",
  primary: "#8bd455",
  primaryText: "#0f1b10",
  border: "#1f2b1e",
  radius: "14px",
  fontStack:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
};

interface LayoutProps {
  preview: string;
  children: React.ReactNode;
}

export function EmailLayout({ preview, children }: LayoutProps) {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: brand.bodyBg,
          fontFamily: brand.fontStack,
          margin: 0,
          padding: "24px 12px",
          color: "#111827",
        }}
      >
        <Container
          style={{
            maxWidth: "560px",
            margin: "0 auto",
            backgroundColor: brand.surface,
            color: brand.surfaceText,
            borderRadius: brand.radius,
            overflow: "hidden",
            border: `1px solid ${brand.border}`,
          }}
        >
          <Section
            style={{
              padding: "20px 28px",
              borderBottom: `1px solid ${brand.border}`,
            }}
          >
            <Text
              style={{
                margin: 0,
                fontSize: "13px",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: brand.primary,
                fontWeight: 600,
              }}
            >
              Verdant Grow Diary
            </Text>
          </Section>
          <Section style={{ padding: "28px" }}>{children}</Section>
          <Hr style={{ borderColor: brand.border, margin: 0 }} />
          <Section style={{ padding: "18px 28px 24px" }}>
            <Text style={{ margin: 0, fontSize: "12px", color: brand.muted }}>
              Sent by Matt at Verdant Grow Diary. Reply directly to this email and it comes straight
              to me at{" "}
              <Link href="mailto:matt@verdantgrowdiary.com" style={{ color: brand.primary }}>
                matt@verdantgrowdiary.com
              </Link>
              .
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const styles = {
  h1: {
    margin: "0 0 12px",
    fontSize: "22px",
    lineHeight: "1.25",
    color: brand.surfaceText,
    fontWeight: 700,
  } as React.CSSProperties,
  p: {
    margin: "0 0 14px",
    fontSize: "15px",
    lineHeight: "1.55",
    color: brand.surfaceText,
  } as React.CSSProperties,
  muted: {
    margin: "0 0 12px",
    fontSize: "13px",
    lineHeight: "1.5",
    color: brand.muted,
  } as React.CSSProperties,
  button: {
    display: "inline-block",
    backgroundColor: brand.primary,
    color: brand.primaryText,
    padding: "12px 20px",
    borderRadius: "10px",
    textDecoration: "none",
    fontWeight: 600,
    fontSize: "15px",
  } as React.CSSProperties,
  callout: {
    backgroundColor: "#152318",
    border: `1px solid ${brand.border}`,
    borderRadius: "10px",
    padding: "14px 16px",
    margin: "4px 0 18px",
  } as React.CSSProperties,
};

export function signOff() {
  return (
    <>
      <Text style={styles.p}>Grow well,</Text>
      <Text style={{ ...styles.p, marginBottom: 0 }}>
        Matt
        <br />
        <span style={{ color: brand.muted, fontSize: "13px" }}>Founder, Verdant Grow Diary</span>
      </Text>
    </>
  );
}
