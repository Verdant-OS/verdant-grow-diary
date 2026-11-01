import { Body, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { main, container, h1, text } from "./styles";
import { OWNER_SUBMISSION_EMAIL } from "@/lib/formSubmissionRules";

function OwnerSubmission({ kind, name, email, message, category, source }: Record<string, unknown>) {
  const value = (input: unknown) => typeof input === "string" ? input : "Not provided";
  return <Html lang="en"><Head /><Preview>A new submission has been saved in Verdant.</Preview>
    <Body style={main}><Container style={container}>
      <Heading style={h1}>Verdant — new {kind === "contact" ? "contact message" : "lead"}</Heading>
      <Text style={text}>Name: {value(name)}<br />Email: {value(email)}<br />Category: {value(category)}<br />Source: {value(source)}</Text>
      <Text style={text}>{value(message)}</Text>
      <Text style={text}>The submission is saved in your Verdant inbox.</Text>
    </Container></Body>
  </Html>;
}
export const template = {
  component: OwnerSubmission,
  subject: (data: Record<string, unknown>) => data.kind === "contact" ? "Verdant: new contact message" : "Verdant: new lead",
  to: OWNER_SUBMISSION_EMAIL,
  displayName: "Owner submission notification",
  previewData: { kind: "contact", name: "Example grower", email: "grower@example.com", message: "Example contact message.", category: "technical_support" },
} satisfies TemplateEntry;