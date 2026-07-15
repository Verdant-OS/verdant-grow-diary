/**
 * QuickLogStarter — PUBLIC 30-second Quick Log starter (/quick-log).
 *
 * An anonymous visitor nicknames a plant, picks one of four canonical log
 * types, jots a note, and saves a draft that lives ONLY in this browser's
 * localStorage. The single outbound action is the signup CTA built by
 * quickLogStarterLinks (UTM-allow-listed attribution; the draft itself
 * never travels in a URL).
 *
 * Safety posture (pinned by public-quick-log-starter-static-safety.test.ts):
 * local draft only — no Supabase, no AI, no Action Queue, no device calls,
 * no fake-live data. Mounted outside AppShell so no operator chrome renders.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  buildFaqPageJsonLd,
  buildSoftwareApplicationJsonLd,
  safeJsonLdStringify,
} from "@/lib/seoStructuredData";
import { VERDANT_SITE_ORIGIN } from "@/constants/verdantSeoContent";
import { STAGES } from "@/lib/grow";
import { UNKNOWN_STAGE } from "@/lib/quickLogStageDefaultRules";
import { QUICK_LOG_ACTIVITY_DEFINITIONS } from "@/constants/quickLogActivityTypes";
import { pickSafeUtmParams } from "@/lib/utm/preserveUtm";
import {
  PUBLIC_QUICK_LOG_STARTER_LOG_TYPES,
  PUBLIC_QUICK_LOG_STARTER_MAX_NICKNAME_LENGTH,
  PUBLIC_QUICK_LOG_STARTER_MAX_NOTE_LENGTH,
  PUBLIC_QUICK_LOG_STARTER_TYPE_TO_ACTIVITY_ID,
  buildPublicQuickLogStarterDraft,
  validatePublicQuickLogStarterInput,
  type PublicQuickLogStarterField,
  type PublicQuickLogStarterLogType,
} from "@/lib/publicQuickLogStarterRules";
import {
  clearPublicQuickLogStarterDraft,
  usePublicQuickLogStarterDraft,
  writePublicQuickLogStarterDraft,
} from "@/lib/publicQuickLogStarterDraftStore";
import {
  PUBLIC_QUICK_LOG_STARTER_PATH,
  buildQuickLogStarterSignupHref,
} from "@/lib/quickLogStarterLinks";
import { PUBLIC_QUICK_LOG_STARTER_COPY as COPY } from "@/constants/publicQuickLogStarterCopy";

const PAGE_URL = `${VERDANT_SITE_ORIGIN}${PUBLIC_QUICK_LOG_STARTER_PATH}`;

export default function QuickLogStarter() {
  usePageSeo({
    title: COPY.seoTitle,
    description: COPY.seoDescription,
    path: PUBLIC_QUICK_LOG_STARTER_PATH,
  });

  useEffect(() => {
    const app = buildSoftwareApplicationJsonLd({
      name: "Verdant Grow Diary",
      description: COPY.seoDescription,
      url: PAGE_URL,
    });
    const faq = buildFaqPageJsonLd({ pageUrl: PAGE_URL, questions: COPY.faq });
    const appScript = document.createElement("script");
    appScript.type = "application/ld+json";
    appScript.setAttribute("data-page-ldjson", "quick-log-starter-app");
    appScript.text = safeJsonLdStringify(app);
    document.head.appendChild(appScript);
    const faqScript = document.createElement("script");
    faqScript.type = "application/ld+json";
    faqScript.setAttribute("data-page-ldjson", "quick-log-starter-faq");
    faqScript.text = safeJsonLdStringify(faq);
    document.head.appendChild(faqScript);
    return () => {
      appScript.remove();
      faqScript.remove();
    };
  }, []);

  const location = useLocation();
  const signupHref = useMemo(
    () => buildQuickLogStarterSignupHref(location.search),
    [location.search],
  );

  const draft = usePublicQuickLogStarterDraft();

  const [plantNickname, setPlantNickname] = useState(() => draft?.plantNickname ?? "");
  const [logType, setLogType] = useState<PublicQuickLogStarterLogType>(
    () => draft?.logType ?? "observation",
  );
  const [stage, setStage] = useState(() => draft?.stage ?? UNKNOWN_STAGE);
  const [note, setNote] = useState(() => draft?.note ?? "");
  const [wateringVolumeRaw, setWateringVolumeRaw] = useState(() =>
    draft?.wateringVolumeMl != null ? String(draft.wateringVolumeMl) : "",
  );
  const [errors, setErrors] = useState<Partial<Record<PublicQuickLogStarterField, string>>>({});
  const [justSaved, setJustSaved] = useState(false);

  const activity =
    QUICK_LOG_ACTIVITY_DEFINITIONS[PUBLIC_QUICK_LOG_STARTER_TYPE_TO_ACTIVITY_ID[logType]];

  function onSave() {
    const result = validatePublicQuickLogStarterInput({
      plantNickname,
      stage,
      logType,
      note,
      wateringVolumeRaw,
    });
    if (result.fields) {
      setErrors({});
      writePublicQuickLogStarterDraft(
        buildPublicQuickLogStarterDraft({
          fields: result.fields,
          attribution: pickSafeUtmParams(location.search),
          now: new Date(),
          previous: draft,
        }),
      );
      setJustSaved(true);
    } else {
      setErrors(result.errors);
      setJustSaved(false);
    }
  }

  function onClearDraft() {
    clearPublicQuickLogStarterDraft();
    setJustSaved(false);
  }

  return (
    <main
      data-testid="public-quick-log-starter"
      aria-labelledby="quick-log-starter-heading"
      className="container mx-auto max-w-2xl px-4 py-8 space-y-6"
    >
      <header className="space-y-2">
        <h1 id="quick-log-starter-heading" className="text-2xl font-semibold">
          {COPY.pageTitle}
        </h1>
        <p className="text-sm text-muted-foreground">{COPY.valueLine}</p>
      </header>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold leading-none tracking-tight">{COPY.formHeading}</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="starter-plant-nickname">Plant nickname</Label>
            <Input
              id="starter-plant-nickname"
              data-testid="starter-plant-nickname"
              value={plantNickname}
              maxLength={PUBLIC_QUICK_LOG_STARTER_MAX_NICKNAME_LENGTH}
              onChange={(e) => setPlantNickname(e.target.value)}
              placeholder="e.g. Blue Dream #1"
              aria-invalid={errors.plantNickname ? true : undefined}
              aria-describedby={errors.plantNickname ? "starter-plant-nickname-error" : undefined}
            />
            {errors.plantNickname ? (
              <p
                id="starter-plant-nickname-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.plantNickname}
              </p>
            ) : null}
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium leading-none">What are you logging?</legend>
            <RadioGroup
              value={logType}
              onValueChange={(v) => setLogType(v as PublicQuickLogStarterLogType)}
              className="grid grid-cols-2 gap-2 pt-1.5"
              data-testid="starter-log-type"
            >
              {PUBLIC_QUICK_LOG_STARTER_LOG_TYPES.map((type) => {
                const def =
                  QUICK_LOG_ACTIVITY_DEFINITIONS[
                    PUBLIC_QUICK_LOG_STARTER_TYPE_TO_ACTIVITY_ID[type]
                  ];
                return (
                  <div
                    key={type}
                    className="flex items-start gap-2 rounded-lg border border-border/50 p-2"
                  >
                    <RadioGroupItem
                      value={type}
                      id={`starter-log-type-${type}`}
                      data-testid={`starter-log-type-${type}`}
                      className="mt-0.5"
                    />
                    <Label htmlFor={`starter-log-type-${type}`} className="leading-snug">
                      {def.label}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {def.description}
                      </span>
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
            {errors.logType ? (
              <p role="alert" className="text-sm text-destructive">
                {errors.logType}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">{activity.safetyNote}</p>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="starter-stage">Growth stage (optional)</Label>
            <select
              id="starter-stage"
              data-testid="starter-stage"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value={UNKNOWN_STAGE}>Not sure yet</option>
              {STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {logType === "watering" ? (
            <div className="space-y-1.5">
              <Label htmlFor="starter-watering-volume">Water given (ml)</Label>
              <Input
                id="starter-watering-volume"
                data-testid="starter-watering-volume"
                inputMode="decimal"
                value={wateringVolumeRaw}
                onChange={(e) => setWateringVolumeRaw(e.target.value)}
                placeholder="e.g. 500"
                aria-invalid={errors.wateringVolumeMl ? true : undefined}
                aria-describedby={
                  errors.wateringVolumeMl ? "starter-watering-volume-error" : undefined
                }
              />
              {errors.wateringVolumeMl ? (
                <p
                  id="starter-watering-volume-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.wateringVolumeMl}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="starter-note">
              {logType === "watering" ? "Note (optional)" : "Note"}
            </Label>
            <Textarea
              id="starter-note"
              data-testid="starter-note"
              value={note}
              maxLength={PUBLIC_QUICK_LOG_STARTER_MAX_NOTE_LENGTH}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you do or notice?"
              rows={3}
              aria-invalid={errors.note ? true : undefined}
              aria-describedby={errors.note ? "starter-note-error" : undefined}
            />
            {errors.note ? (
              <p id="starter-note-error" role="alert" className="text-sm text-destructive">
                {errors.note}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Button type="button" onClick={onSave} data-testid="starter-save-draft">
              {COPY.saveDraftLabel}
            </Button>
            <p className="text-xs text-muted-foreground" data-testid="starter-truth-line">
              {COPY.truthLine}
            </p>
          </div>
        </CardContent>
      </Card>

      {draft ? (
        <Card data-testid="starter-saved-draft">
          <CardHeader>
            <h2
              className="text-lg font-semibold leading-none tracking-tight"
              data-testid="starter-saved-draft-title"
            >
              {COPY.draftSavedTitle}
            </h2>
          </CardHeader>
          <CardContent className="space-y-3">
            {justSaved ? (
              <p role="status" className="text-sm text-muted-foreground">
                Draft updated.
              </p>
            ) : null}
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">Plant</dt>
                <dd data-testid="starter-saved-nickname">{draft.plantNickname}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">Type</dt>
                <dd data-testid="starter-saved-log-type">
                  {
                    QUICK_LOG_ACTIVITY_DEFINITIONS[
                      PUBLIC_QUICK_LOG_STARTER_TYPE_TO_ACTIVITY_ID[draft.logType]
                    ].label
                  }
                </dd>
              </div>
              {draft.stage !== UNKNOWN_STAGE ? (
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">Stage</dt>
                  <dd data-testid="starter-saved-stage">
                    {STAGES.find((s) => s.value === draft.stage)?.label ?? draft.stage}
                  </dd>
                </div>
              ) : null}
              {draft.wateringVolumeMl != null ? (
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">Water</dt>
                  <dd data-testid="starter-saved-volume">{draft.wateringVolumeMl} ml</dd>
                </div>
              ) : null}
              {draft.note ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">Note</dt>
                  <dd className="whitespace-pre-wrap" data-testid="starter-saved-note">
                    {draft.note}
                  </dd>
                </div>
              ) : null}
            </dl>
            <p className="text-xs text-muted-foreground">{COPY.truthLine}</p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button asChild data-testid="starter-signup-cta">
                <Link to={signupHref}>{COPY.signupCtaLabel}</Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={onClearDraft}
                data-testid="starter-clear-draft"
              >
                {COPY.clearDraftLabel}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{COPY.ctaLine}</p>
          </CardContent>
        </Card>
      ) : (
        <section aria-label="Keep your notes" className="space-y-2">
          <p className="text-sm text-muted-foreground">{COPY.ctaLine}</p>
          <Button asChild variant="outline" data-testid="starter-signup-cta">
            <Link to={signupHref}>{COPY.signupCtaLabel}</Link>
          </Button>
        </section>
      )}

      <section aria-labelledby="quick-log-starter-faq-heading" className="space-y-3">
        <h2 id="quick-log-starter-faq-heading" className="text-lg font-semibold">
          Common questions
        </h2>
        <dl className="space-y-3" data-testid="starter-faq">
          {COPY.faq.map((entry) => (
            <div key={entry.question} className="space-y-1">
              <dt className="text-sm font-medium">{entry.question}</dt>
              <dd className="text-sm text-muted-foreground">{entry.answer}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
