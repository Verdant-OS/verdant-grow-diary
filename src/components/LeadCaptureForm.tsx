import { useState } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { submitPublicForm } from "@/lib/formSubmission.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

/**
 * Public lead capture form. Writes ONLY to public.leads.
 *
 * - Does not read any private grow/plant/tent/alert/action data.
 * - Does not collect phone numbers and does not enroll in SMS.
 * - Anyone (signed in or not) can submit; RLS allows insert only.
 */

const LEAD_TYPES = [
  { value: "beta_user", label: "Join the beta" },
  { value: "hardware_partner", label: "Hardware partner" },
  { value: "grower", label: "Grower" },
  { value: "investor", label: "Investor" },
  { value: "other", label: "Other" },
] as const;

const leadSchema = z.object({
  name: z.string().trim().max(100).optional().or(z.literal("")),
  email: z.string().trim().email("Enter a valid email").max(255),
  company: z.string().trim().max(120).optional().or(z.literal("")),
  lead_type: z.enum(["beta_user", "hardware_partner", "grower", "investor", "other"]),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
});

export interface LeadCaptureFormProps {
  defaultLeadType?: "beta_user" | "hardware_partner" | "grower" | "investor" | "other";
}

export default function LeadCaptureForm({
  defaultLeadType = "beta_user",
}: LeadCaptureFormProps = {}) {
  const submitForm = useServerFn(submitPublicForm);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [leadType, setLeadType] = useState<string>(defaultLeadType);

  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSaveError(null);
    const parsed = leadSchema.safeParse({
      name,
      email,
      company,
      lead_type: leadType,
      message,
    });
    if (!parsed.success) {
      setSaveError(parsed.error.issues[0]?.message ?? "Please check the form");
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitForm({ data: { kind: "lead", payload: {
        name: parsed.data.name || null,
        email: parsed.data.email,
        company: parsed.data.company || null,
        lead_type: parsed.data.lead_type,
        message: parsed.data.message || null,
        source: "landing",
      } } });
      if ("error" in result) throw new Error("Lead save failed");
    } catch {
      setSaveError("We couldn't save your request. Your text is still here. Please try again.");
      return;
    } finally {
      setSubmitting(false);
    }
    setDone(true);
    toast.success("Thanks — we'll be in touch.");
  }

  if (done) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-xl border border-border/50 bg-card/40 backdrop-blur p-6 text-center"
      >
        <h3 className="font-display text-lg font-semibold">You're on the list</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Your request has been saved for the Verdant team. Thank you for reaching out.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-border/50 bg-card/40 backdrop-blur p-6 space-y-4 text-left"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="lead-name">Name</Label>
          <Input
            id="lead-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoComplete="name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-email">Email *</Label>
          <Input
            id="lead-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={255}
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-company">Company</Label>
          <Input
            id="lead-company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            maxLength={120}
            autoComplete="organization"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-type">I am a…</Label>
          <Select value={leadType} onValueChange={setLeadType}>
            <SelectTrigger id="lead-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAD_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="lead-message">Message</Label>
        <Textarea
          id="lead-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="Tell us about your grow or hardware integration."
        />
      </div>
      {saveError && (
        <p role="alert" className="text-sm text-destructive">
          {saveError}
        </p>
      )}
      <Button type="submit" disabled={submitting} size="lg" className="w-full md:w-auto">
        {submitting ? "Submitting…" : "Submit"}
      </Button>
      <p className="text-xs text-muted-foreground">
        No phone number, no SMS enrollment. We'll only use your email to reply.
      </p>
    </form>
  );
}
