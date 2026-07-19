/**
 * FounderOwnerPrefsForm — signed-in founder's editor for their public
 * Founders Wall row. Client validation mirrors the DB CHECKs via
 * `founderPrefsSchema`; the `save-founder-prefs` edge function re-validates
 * server-side and writes only the caller's own row.
 *
 * Presentation-only: never trusts client-derived visibility. Public wall
 * always reads `founders_wall_public` where the server is authoritative.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useMyFounderRow } from "@/hooks/useMyFounderRow";
import {
  deriveWallDisplayName,
  founderPrefsSchema,
  FOUNDER_DISPLAY_NAME_MAX,
  type FounderDisplayStyle,
} from "@/lib/founderWallRules";

const DISPLAY_STYLE_OPTIONS: Array<{ value: FounderDisplayStyle; label: string }> = [
  { value: "custom_name", label: "Custom name" },
  { value: "first_initial", label: "First initial only" },
  { value: "number_only", label: "Founder number only" },
  { value: "hidden", label: "Hidden — do not list me" },
];

export default function FounderOwnerPrefsForm() {
  const { loading, row, refetch } = useMyFounderRow();
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState<string>("");
  const [displayStyle, setDisplayStyle] = useState<FounderDisplayStyle>("hidden");
  const [showOnWall, setShowOnWall] = useState<boolean>(false);
  const [optionalLink, setOptionalLink] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    setDisplayName(row.display_name ?? "");
    setDisplayStyle(row.display_style);
    setShowOnWall(row.show_on_wall);
    setOptionalLink(row.optional_link ?? "");
  }, [row]);

  const previewName = useMemo(() => {
    if (!row) return null;
    return deriveWallDisplayName({
      founder_number: row.founder_number,
      display_name: displayName.trim().length === 0 ? null : displayName,
      display_style: displayStyle,
      show_on_wall: showOnWall,
    });
  }, [row, displayName, displayStyle, showOnWall]);

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-2xl border border-border/60 bg-card/30 p-6 text-sm text-muted-foreground"
      >
        Loading your Founder settings…
      </div>
    );
  }

  if (!row) return null;

  const isRefunded = row.status !== "confirmed";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isRefunded) return;
    setError(null);

    const candidate = {
      display_name: displayName.trim().length === 0 ? null : displayName,
      display_style: displayStyle,
      show_on_wall: showOnWall,
      optional_link: optionalLink.trim().length === 0 ? null : optionalLink.trim(),
    };
    const parsed = founderPrefsSchema.safeParse(candidate);
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message ?? "Invalid preferences.";
      setError(first);
      return;
    }

    setSaving(true);
    const { data, error: fnError } = await supabase.functions.invoke("save-founder-prefs", {
      body: parsed.data,
    });
    setSaving(false);

    if (fnError || !data || (data as { ok?: boolean }).ok !== true) {
      const msg =
        (data as { error?: string } | null)?.error ??
        fnError?.message ??
        "Could not save.";
      setError(msg);
      toast({
        title: "Could not save Founder settings",
        description: msg,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Founder settings saved",
      description: "Your Founders Wall preferences are updated.",
    });
    await refetch();
  }

  return (
    <section
      aria-labelledby="founder-prefs-heading"
      className="rounded-2xl border border-primary/30 bg-card/45 p-6 md:p-8"
    >
      <h2 id="founder-prefs-heading" className="font-display text-2xl font-semibold">
        Your Founder settings
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        You are Founder #{row.founder_number}. Control how (or whether) you appear on the public
        Founders Wall. Nothing here is auto-populated.
      </p>

      {isRefunded ? (
        <p className="mt-4 rounded-md border border-border/50 bg-background/40 p-3 text-sm text-muted-foreground">
          This Founder seat has been refunded — settings are locked.
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-6 grid gap-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="founder-show-on-wall" className="text-sm font-medium">
              Show me on the Founders Wall
            </Label>
            <p className="text-xs text-muted-foreground">
              Off means you never appear publicly.
            </p>
          </div>
          <Switch
            id="founder-show-on-wall"
            checked={showOnWall}
            onCheckedChange={setShowOnWall}
            disabled={isRefunded || saving}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="founder-display-style">Display style</Label>
          <Select
            value={displayStyle}
            onValueChange={(v) => setDisplayStyle(v as FounderDisplayStyle)}
            disabled={isRefunded || saving}
          >
            <SelectTrigger id="founder-display-style">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISPLAY_STYLE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="founder-display-name">
            Display name{" "}
            <span className="text-xs text-muted-foreground">
              (used for custom name / first initial)
            </span>
          </Label>
          <Input
            id="founder-display-name"
            value={displayName}
            maxLength={FOUNDER_DISPLAY_NAME_MAX}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={isRefunded || saving}
            placeholder="e.g. Jane Cultivator"
          />
          <p className="text-xs text-muted-foreground">
            {FOUNDER_DISPLAY_NAME_MAX} characters max. No control characters.
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="founder-optional-link">
            Optional link <span className="text-xs text-muted-foreground">(https:// only)</span>
          </Label>
          <Input
            id="founder-optional-link"
            type="url"
            inputMode="url"
            value={optionalLink}
            onChange={(e) => setOptionalLink(e.target.value)}
            disabled={isRefunded || saving}
            placeholder="https://your-site.example"
          />
          <p className="text-xs text-muted-foreground">
            Rendered with rel="noopener noreferrer nofollow". Leave blank for none.
          </p>
        </div>

        <div className="rounded-md border border-border/50 bg-background/40 p-3 text-sm">
          <p className="font-medium">Public preview</p>
          <p className="mt-1 text-muted-foreground">
            {showOnWall
              ? previewName
                ? `#${row.founder_number} — ${previewName}`
                : `#${row.founder_number}`
              : "Not shown on the wall."}
          </p>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div>
          <Button
            type="submit"
            disabled={isRefunded || saving}
            aria-busy={saving ? "true" : "false"}
            aria-label={saving ? "Saving…" : undefined}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              "Save Founder settings"
            )}
          </Button>
        </div>

        {/*
         * Polite live region for screen readers. Rendered persistently and
         * mutated in place so assistive tech announces the current message
         * once and does not replay stale text after completion.
         */}
        <div
          data-testid="founder-prefs-status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {saving ? "Saving Founder settings…" : ""}
        </div>
      </form>
    </section>
  );
}
