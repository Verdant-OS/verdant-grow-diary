import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Star } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { PrivacyNote, SupportLayout } from "./SupportLayout";
import { HoneypotField } from "./HoneypotField";
import { checkSpam, fingerprint, recordSubmission } from "./spamGuard";

const RATING_LABELS = ["Poor", "Below average", "Okay", "Good", "Excellent"] as const;

const feedbackSchema = z.object({
  overall_rating: z.number().int().min(1, "Pick an overall rating").max(5),
  ai_doctor_rating: z.number().int().min(1).max(5).nullable(),
  sensors_rating: z.number().int().min(1).max(5).nullable(),
  quicklog_rating: z.number().int().min(1).max(5).nullable(),
  trust_rating: z.number().int().min(1).max(5).nullable(),
  whats_working: z.string().trim().max(4000).optional().or(z.literal("")),
  whats_friction: z.string().trim().max(4000).optional().or(z.literal("")),
  one_improvement: z.string().trim().max(4000).optional().or(z.literal("")),
  grow_context: z.string().trim().max(500).optional().or(z.literal("")),
  contact_email: z
    .string()
    .trim()
    .max(320)
    .email("Enter a valid email or leave blank")
    .optional()
    .or(z.literal("")),
  follow_up_ok: z.boolean(),
});

type FeedbackValues = z.infer<typeof feedbackSchema>;

const SPECIFIC_RATINGS: Array<{
  key: keyof Pick<FeedbackValues, "ai_doctor_rating" | "sensors_rating" | "quicklog_rating" | "trust_rating">;
  title: string;
  hint: string;
}> = [
  {
    key: "ai_doctor_rating",
    title: "AI Doctor",
    hint: "Usefulness of suggestions and quality of evidence cited.",
  },
  {
    key: "sensors_rating",
    title: "Sensor snapshots",
    hint: "Reliability and clarity of source labeling.",
  },
  {
    key: "quicklog_rating",
    title: "Quick Log & Timeline",
    hint: "Speed and usefulness when logging in the moment.",
  },
  {
    key: "trust_rating",
    title: "Trust & transparency",
    hint: "How clear it is that you stay in control.",
  },
];

function StarRating({
  value,
  onChange,
  label,
  required,
  errorId,
}: {
  value: number | null;
  onChange: (v: number) => void;
  label: string;
  required?: boolean;
  errorId?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-required={required}
      aria-describedby={errorId}
      className="flex items-center gap-1"
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const active = value !== null && n <= value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} out of 5 — ${RATING_LABELS[n - 1]}`}
            onClick={() => onChange(n)}
            className="rounded-md p-1.5 text-muted-foreground transition hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Star
              className={`h-6 w-6 ${active ? "fill-primary text-primary" : ""}`}
              strokeWidth={1.5}
            />
          </button>
        );
      })}
      {value !== null ? (
        <span className="ml-2 text-xs text-muted-foreground">{RATING_LABELS[value - 1]}</span>
      ) : null}
    </div>
  );
}

export default function Feedback() {
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const formOpenedAt = useRef<number>(Date.now());

  const form = useForm<FeedbackValues>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: {
      overall_rating: 0 as unknown as number,
      ai_doctor_rating: null,
      sensors_rating: null,
      quicklog_rating: null,
      trust_rating: null,
      whats_working: "",
      whats_friction: "",
      one_improvement: "",
      grow_context: "",
      contact_email: "",
      follow_up_ok: false,
    },
  });

  const { register, handleSubmit, setValue, watch, formState } = form;

  const onSubmit = async (values: FeedbackValues) => {
    setSubmitState("submitting");
    setErrorMessage(null);

    const fp = fingerprint(
      [
        values.overall_rating,
        values.whats_working ?? "",
        values.whats_friction ?? "",
        values.one_improvement ?? "",
        values.contact_email ?? "",
      ].join("|"),
    );
    const guard = checkSpam({
      honeypotValue: honeypot,
      formOpenedAt: formOpenedAt.current,
      storageKey: "verdant.spam.feedback",
      contentFingerprint: fp,
    });
    if (!guard.ok) {
      setSubmitState("error");
      setErrorMessage(guard.message);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id ?? null;

    const payload = {
      user_id: userId,
      overall_rating: values.overall_rating,
      ai_doctor_rating: values.ai_doctor_rating,
      sensors_rating: values.sensors_rating,
      quicklog_rating: values.quicklog_rating,
      trust_rating: values.trust_rating,
      whats_working: values.whats_working?.trim() || null,
      whats_friction: values.whats_friction?.trim() || null,
      one_improvement: values.one_improvement?.trim() || null,
      grow_context: values.grow_context?.trim() || null,
      contact_email: values.contact_email?.trim() || null,
      follow_up_ok: values.follow_up_ok,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
    };

    const { error } = await supabase.from("customer_feedback").insert(payload);
    if (error) {
      setSubmitState("error");
      setErrorMessage(error.message || "Something went wrong. Please try again.");
      return;
    }
    recordSubmission("verdant.spam.feedback", fp);
    setSubmitState("success");
  };

  if (submitState === "success") {
    return (
      <SupportLayout
        title="Feedback sent"
        description="Your feedback has been received. A human on the Verdant team will read it."
        path="/feedback"
      >
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-primary/40 bg-primary/5 p-6"
        >
          <h1 className="text-xl font-semibold tracking-tight">Thanks.</h1>
          <p className="mt-2 text-sm leading-relaxed text-foreground/90">
            A human on the Verdant team will read this. Your input directly shapes what we build
            next. Grower stays in control.
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
              Send more feedback
            </Button>
          </div>
        </div>
      </SupportLayout>
    );
  }

  const overall = watch("overall_rating");

  return (
    <SupportLayout
      title="Customer Feedback"
      description="Tell the humans building Verdant what's working and what isn't. Read by real people, no automated replies."
      path="/feedback"
    >
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Help make the tools better for the next run
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Your real-world feedback on AI Doctor, sensors, and logging is read by the humans building
          Verdant. No automated replies. No data used without consent.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-8" noValidate>
        <HoneypotField value={honeypot} onChange={setHoneypot} />
        <section className="rounded-lg border border-border bg-card p-5 space-y-3">
          <div>
            <Label className="text-base">
              Overall experience <span className="text-destructive">*</span>
            </Label>
            <p className="text-xs text-muted-foreground">How is Verdant working for you right now?</p>
          </div>
          <StarRating
            value={overall && overall > 0 ? overall : null}
            onChange={(v) =>
              setValue("overall_rating", v, { shouldValidate: true, shouldDirty: true })
            }
            label="Overall experience"
            required
            errorId={formState.errors.overall_rating ? "overall-error" : undefined}
          />
          {formState.errors.overall_rating ? (
            <p id="overall-error" role="alert" className="text-xs text-destructive">
              {formState.errors.overall_rating.message}
            </p>
          ) : null}
        </section>

        <section className="rounded-lg border border-border bg-card p-5 space-y-5">
          <div>
            <h2 className="text-base font-semibold">Specific ratings</h2>
            <p className="text-xs text-muted-foreground">Optional but encouraged.</p>
          </div>
          {SPECIFIC_RATINGS.map((row) => {
            const value = watch(row.key);
            return (
              <div key={row.key} className="space-y-1.5">
                <div>
                  <Label className="text-sm">{row.title}</Label>
                  <p className="text-xs text-muted-foreground">{row.hint}</p>
                </div>
                <StarRating
                  value={value}
                  onChange={(v) => setValue(row.key, v, { shouldDirty: true })}
                  label={row.title}
                />
              </div>
            );
          })}
        </section>

        <section className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="whats_working">What's working well in real grows?</Label>
            <Textarea
              id="whats_working"
              rows={4}
              maxLength={4000}
              placeholder="e.g. Sensor snapshots caught VPD drift I would have missed."
              {...register("whats_working")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="whats_friction">What's friction or missing?</Label>
            <Textarea
              id="whats_friction"
              rows={4}
              maxLength={4000}
              placeholder="Where does the tool slow you down or get in your way?"
              {...register("whats_friction")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="one_improvement">
              One feature or improvement that would help your next run
            </Label>
            <Textarea
              id="one_improvement"
              rows={3}
              maxLength={4000}
              placeholder="If you could change one thing before your next run, what would it be?"
              {...register("one_improvement")}
            />
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5 space-y-5">
          <div>
            <h2 className="text-base font-semibold">A little context (optional)</h2>
            <p className="text-xs text-muted-foreground">
              Helps us picture your setup. Private — never shared, never used to train models.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="grow_context">
              Brief grow context <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="grow_context"
              maxLength={500}
              placeholder="e.g. 4×4 tent, AcuRite + Pulse, mid-flower"
              {...register("grow_context")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact_email">
              Email <span className="text-muted-foreground">(optional, for follow-up)</span>
            </Label>
            <Input
              id="contact_email"
              type="email"
              autoComplete="email"
              maxLength={320}
              aria-invalid={formState.errors.contact_email ? true : undefined}
              aria-describedby={formState.errors.contact_email ? "contact-email-error" : undefined}
              {...register("contact_email")}
            />
            {formState.errors.contact_email ? (
              <p id="contact-email-error" role="alert" className="text-xs text-destructive">
                {formState.errors.contact_email.message}
              </p>
            ) : null}
          </div>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              id="follow_up_ok"
              checked={watch("follow_up_ok")}
              onCheckedChange={(c) => setValue("follow_up_ok", c === true, { shouldDirty: true })}
              className="mt-0.5"
            />
            <span className="leading-snug">
              I'm okay with a human from the team emailing me about this feedback.
            </span>
          </label>
        </section>

        <PrivacyNote />

        {submitState === "error" && errorMessage ? (
          <div role="alert" className="rounded-lg border border-destructive/60 bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <p className="text-xs text-muted-foreground sm:mr-auto">Read by humans, not bots.</p>
          <Button type="submit" disabled={submitState === "submitting"} className="min-w-[160px]">
            {submitState === "submitting" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
              </>
            ) : (
              "Send feedback"
            )}
          </Button>
        </div>
      </form>
    </SupportLayout>
  );
}
