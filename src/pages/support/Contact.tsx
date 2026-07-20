import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Mail } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
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
import { PrivacyNote, SupportLayout } from "./SupportLayout";

const CATEGORIES = [
  { value: "technical_support", label: "Technical Support" },
  { value: "bug_report", label: "Bug Report" },
  { value: "feature_idea", label: "Feature Idea" },
  { value: "billing_account", label: "Billing & Account" },
  { value: "hardware_integration", label: "Hardware or Sensor Integration" },
  { value: "other", label: "Other" },
] as const;

const contactSchema = z.object({
  name: z.string().trim().min(1, "Add your name").max(120),
  email: z.string().trim().email("Enter a valid email").max(320),
  category: z.enum([
    "technical_support",
    "bug_report",
    "feature_idea",
    "billing_account",
    "hardware_integration",
    "other",
  ]),
  message: z
    .string()
    .trim()
    .min(1, "Add a short message")
    .max(8000, "Message is too long"),
  grow_context: z.string().trim().max(500).optional().or(z.literal("")),
});

type ContactValues = z.infer<typeof contactSchema>;

export default function Contact() {
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      category: "technical_support",
      message: "",
      grow_context: "",
    },
  });

  const { register, handleSubmit, setValue, watch, formState } = form;

  const onSubmit = async (values: ContactValues) => {
    setSubmitState("submitting");
    setErrorMessage(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id ?? null;

    const payload = {
      user_id: userId,
      name: values.name.trim(),
      email: values.email.trim(),
      category: values.category,
      message: values.message.trim(),
      grow_context: values.grow_context?.trim() || null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
    };

    const { error } = await supabase.from("contact_messages").insert(payload);
    if (error) {
      setSubmitState("error");
      setErrorMessage(error.message || "Something went wrong. Please try again.");
      return;
    }
    setSubmitState("success");
  };

  if (submitState === "success") {
    return (
      <SupportLayout
        title="Message received"
        description="Your message has been received. Expect a human reply within 1–2 business days."
        path="/contact"
      >
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-primary/40 bg-primary/5 p-6"
        >
          <h1 className="text-xl font-semibold tracking-tight">Message received.</h1>
          <p className="mt-2 text-sm leading-relaxed text-foreground/90">
            Expect a human reply within 1–2 business days (usually faster). We never use your grow
            details for anything except helping you.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Button asChild variant="outline">
              <a href="/dashboard">Back to app</a>
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                form.reset();
                setSubmitState("idle");
              }}
            >
              Send another message
            </Button>
          </div>
        </div>
      </SupportLayout>
    );
  }

  const category = watch("category");

  return (
    <SupportLayout
      title="Contact Us"
      description="Reach the humans building Verdant. Support, bugs, hardware ideas, billing, or questions."
      path="/contact"
    >
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Talk to the people building Verdant
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Support, bugs, hardware integration ideas, billing, or just questions. We reply as humans.
        </p>
        <p className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-card px-3 py-1.5 text-sm">
          <Mail className="h-4 w-4 text-primary" aria-hidden />
          <a
            href="mailto:support@verdantgrowdiary.com"
            className="font-medium underline-offset-2 hover:underline"
          >
            support@verdantgrowdiary.com
          </a>
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-6" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              autoComplete="name"
              maxLength={120}
              aria-invalid={formState.errors.name ? true : undefined}
              aria-describedby={formState.errors.name ? "name-error" : undefined}
              {...register("name")}
            />
            {formState.errors.name ? (
              <p id="name-error" role="alert" className="text-xs text-destructive">
                {formState.errors.name.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              maxLength={320}
              aria-invalid={formState.errors.email ? true : undefined}
              aria-describedby={formState.errors.email ? "email-error" : undefined}
              {...register("email")}
            />
            {formState.errors.email ? (
              <p id="email-error" role="alert" className="text-xs text-destructive">
                {formState.errors.email.message}
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="category">
            Category <span className="text-destructive">*</span>
          </Label>
          <Select
            value={category}
            onValueChange={(v) =>
              setValue("category", v as ContactValues["category"], { shouldDirty: true })
            }
          >
            <SelectTrigger id="category">
              <SelectValue placeholder="Pick a category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="message">
            Message <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="message"
            rows={7}
            maxLength={8000}
            placeholder="Describe what you're seeing, what you expected, and any steps to reproduce."
            aria-invalid={formState.errors.message ? true : undefined}
            aria-describedby={formState.errors.message ? "message-error" : undefined}
            {...register("message")}
          />
          {formState.errors.message ? (
            <p id="message-error" role="alert" className="text-xs text-destructive">
              {formState.errors.message.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="grow_context">
            Grow context <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="grow_context"
            maxLength={500}
            placeholder="e.g. 4×4 tent, AC Infinity + Ecowitt, week 4 flower"
            {...register("grow_context")}
          />
        </div>

        <PrivacyNote />

        {submitState === "error" && errorMessage ? (
          <div role="alert" className="rounded-lg border border-destructive/60 bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <p className="text-xs text-muted-foreground sm:mr-auto">
            Typical reply time: 1–2 business days.
          </p>
          <Button type="submit" disabled={submitState === "submitting"} className="min-w-[160px]">
            {submitState === "submitting" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
              </>
            ) : (
              "Send message"
            )}
          </Button>
        </div>
      </form>
    </SupportLayout>
  );
}
