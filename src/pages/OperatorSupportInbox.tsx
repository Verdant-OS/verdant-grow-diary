/**
 * OperatorSupportInbox — operator-only inbox for /feedback and /contact
 * submissions. Read + mark-reviewed only. Never mutates the original
 * submission fields (name/email/message/ratings) — only the review
 * tracking columns (reviewed_at, reviewed_by, admin_notes).
 *
 * Route is nested under <RequireOperatorRole /> so unauthenticated /
 * non-operator sessions never reach this component. RLS on the tables
 * is the actual boundary; this UI is a presenter.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Mail, MessageSquareText, RefreshCw, Star } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePageSeo } from "@/hooks/usePageSeo";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReviewFilter = "all" | "unreviewed" | "reviewed";

interface FeedbackRow {
  id: string;
  created_at: string;
  overall_rating: number;
  ai_doctor_rating: number | null;
  sensors_rating: number | null;
  quicklog_rating: number | null;
  trust_rating: number | null;
  whats_working: string | null;
  whats_friction: string | null;
  one_improvement: string | null;
  grow_context: string | null;
  contact_email: string | null;
  follow_up_ok: boolean;
  reviewed_at: string | null;
  reviewed_by: string | null;
  admin_notes: string | null;
}

interface ContactRow {
  id: string;
  created_at: string;
  name: string;
  email: string;
  category: string;
  message: string;
  grow_context: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  admin_notes: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  technical_support: "Technical support",
  bug_report: "Bug report",
  feature_idea: "Feature idea",
  billing_account: "Billing & account",
  hardware_integration: "Hardware / sensor",
  other: "Other",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function Stars({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${
            n <= value ? "fill-emerald-500 text-emerald-500" : "text-muted-foreground/40"
          }`}
        />
      ))}
    </span>
  );
}

function ReviewBadge({ reviewed }: { reviewed: boolean }) {
  return reviewed ? (
    <Badge variant="secondary" className="bg-emerald-950 text-emerald-300 border-emerald-900">
      Reviewed
    </Badge>
  ) : (
    <Badge variant="outline" className="border-amber-800 text-amber-300">
      New
    </Badge>
  );
}

function filterRows<T extends { reviewed_at: string | null }>(
  rows: T[],
  filter: ReviewFilter,
): T[] {
  if (filter === "reviewed") return rows.filter((r) => r.reviewed_at != null);
  if (filter === "unreviewed") return rows.filter((r) => r.reviewed_at == null);
  return rows;
}

// ---------------------------------------------------------------------------
// Data hooks
// ---------------------------------------------------------------------------

function useSupportRows() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [contact, setContact] = useState<ContactRow[]>([]);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const [fbRes, ctRes] = await Promise.all([
        supabase
          .from("customer_feedback")
          .select(
            "id, created_at, overall_rating, ai_doctor_rating, sensors_rating, quicklog_rating, trust_rating, whats_working, whats_friction, one_improvement, grow_context, contact_email, follow_up_ok, reviewed_at, reviewed_by, admin_notes",
          )
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("contact_messages")
          .select(
            "id, created_at, name, email, category, message, grow_context, reviewed_at, reviewed_by, admin_notes",
          )
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      if (cancelled) return;
      if (fbRes.error) setError(fbRes.error.message);
      else setFeedback((fbRes.data ?? []) as FeedbackRow[]);
      if (ctRes.error) setError((prev) => prev ?? ctRes.error!.message);
      else setContact((ctRes.data ?? []) as ContactRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { loading, error, feedback, contact, setFeedback, setContact, reload };
}

// ---------------------------------------------------------------------------
// Row components
// ---------------------------------------------------------------------------

interface ReviewControlsProps {
  reviewed: boolean;
  notes: string;
  saving: boolean;
  onNotesChange: (v: string) => void;
  onToggleReviewed: () => void;
  onSaveNotes: () => void;
  reviewedAt: string | null;
}

function ReviewControls(props: ReviewControlsProps) {
  const { reviewed, notes, saving, onNotesChange, onToggleReviewed, onSaveNotes, reviewedAt } =
    props;
  return (
    <div className="mt-3 space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {reviewed && reviewedAt
            ? `Marked reviewed ${formatDate(reviewedAt)}`
            : "Not yet reviewed"}
        </div>
        <Button
          size="sm"
          variant={reviewed ? "outline" : "default"}
          onClick={onToggleReviewed}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : reviewed ? (
            "Mark as new"
          ) : (
            "Mark as reviewed"
          )}
        </Button>
      </div>
      <Textarea
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        placeholder="Internal admin notes (operators only)"
        rows={2}
        className="text-sm"
        disabled={saving}
      />
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" onClick={onSaveNotes} disabled={saving}>
          Save notes
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OperatorSupportInbox() {
  usePageSeo({
    title: "Support Inbox · Operator",
    description: "Operator-only inbox for customer feedback and contact messages.",
    noindex: true,
  });

  const { user } = useAuth();
  const { loading, error, feedback, contact, setFeedback, setContact, reload } = useSupportRows();
  const [filter, setFilter] = useState<ReviewFilter>("unreviewed");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const draftNoteFor = useCallback(
    (id: string, current: string | null) => notesDraft[id] ?? current ?? "",
    [notesDraft],
  );

  const updateFeedback = useCallback(
    async (row: FeedbackRow, patch: Partial<FeedbackRow>) => {
      setSavingId(row.id);
      const { data, error: e } = await supabase
        .from("customer_feedback")
        .update(patch)
        .eq("id", row.id)
        .select(
          "id, created_at, overall_rating, ai_doctor_rating, sensors_rating, quicklog_rating, trust_rating, whats_working, whats_friction, one_improvement, grow_context, contact_email, follow_up_ok, reviewed_at, reviewed_by, admin_notes",
        )
        .maybeSingle();
      setSavingId(null);
      if (e) {
        alert(`Failed to update: ${e.message}`);
        return;
      }
      if (data) {
        setFeedback((prev) => prev.map((r) => (r.id === row.id ? (data as FeedbackRow) : r)));
        setNotesDraft((prev) => {
          const { [row.id]: _drop, ...rest } = prev;
          return rest;
        });
      }
    },
    [setFeedback],
  );

  const updateContact = useCallback(
    async (row: ContactRow, patch: Partial<ContactRow>) => {
      setSavingId(row.id);
      const { data, error: e } = await supabase
        .from("contact_messages")
        .update(patch)
        .eq("id", row.id)
        .select(
          "id, created_at, name, email, category, message, grow_context, reviewed_at, reviewed_by, admin_notes",
        )
        .maybeSingle();
      setSavingId(null);
      if (e) {
        alert(`Failed to update: ${e.message}`);
        return;
      }
      if (data) {
        setContact((prev) => prev.map((r) => (r.id === row.id ? (data as ContactRow) : r)));
        setNotesDraft((prev) => {
          const { [row.id]: _drop, ...rest } = prev;
          return rest;
        });
      }
    },
    [setContact],
  );

  const toggleReviewed = useCallback(
    (kind: "feedback" | "contact", row: FeedbackRow | ContactRow) => {
      const reviewed = row.reviewed_at != null;
      const patch = reviewed
        ? { reviewed_at: null, reviewed_by: null }
        : { reviewed_at: new Date().toISOString(), reviewed_by: user?.id ?? null };
      if (kind === "feedback") return updateFeedback(row as FeedbackRow, patch);
      return updateContact(row as ContactRow, patch);
    },
    [updateContact, updateFeedback, user?.id],
  );

  const filteredFeedback = useMemo(() => filterRows(feedback, filter), [feedback, filter]);
  const filteredContact = useMemo(() => {
    const base = filterRows(contact, filter);
    return categoryFilter === "all" ? base : base.filter((r) => r.category === categoryFilter);
  }, [contact, filter, categoryFilter]);

  const feedbackUnread = feedback.filter((r) => r.reviewed_at == null).length;
  const contactUnread = contact.filter((r) => r.reviewed_at == null).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Support inbox</h1>
          <p className="text-sm text-muted-foreground">
            Operator-only. Original submissions are read-only; only review status and internal
            notes can be updated.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as ReviewFilter)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unreviewed">Unreviewed</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={reload} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <Tabs defaultValue="feedback">
        <TabsList>
          <TabsTrigger value="feedback" className="gap-2">
            <Star className="h-4 w-4" /> Feedback
            {feedbackUnread > 0 && (
              <Badge variant="secondary" className="ml-1">
                {feedbackUnread}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="contact" className="gap-2">
            <MessageSquareText className="h-4 w-4" /> Contact
            {contactUnread > 0 && (
              <Badge variant="secondary" className="ml-1">
                {contactUnread}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Feedback */}
        <TabsContent value="feedback" className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading feedback…
            </div>
          ) : filteredFeedback.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No feedback matches this filter.
              </CardContent>
            </Card>
          ) : (
            filteredFeedback.map((row) => {
              const reviewed = row.reviewed_at != null;
              return (
                <Card key={row.id}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <Stars value={row.overall_rating} />
                        <CardTitle className="text-base">
                          Overall {row.overall_rating}/5
                        </CardTitle>
                        <ReviewBadge reviewed={reviewed} />
                      </div>
                      <CardDescription className="text-xs">
                        {formatDate(row.created_at)}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                      <div>
                        AI Doctor: <Stars value={row.ai_doctor_rating} />
                      </div>
                      <div>
                        Sensors: <Stars value={row.sensors_rating} />
                      </div>
                      <div>
                        Quick Log: <Stars value={row.quicklog_rating} />
                      </div>
                      <div>
                        Trust: <Stars value={row.trust_rating} />
                      </div>
                    </div>
                    {row.whats_working && (
                      <Field label="What's working">{row.whats_working}</Field>
                    )}
                    {row.whats_friction && (
                      <Field label="Friction / missing">{row.whats_friction}</Field>
                    )}
                    {row.one_improvement && (
                      <Field label="One improvement">{row.one_improvement}</Field>
                    )}
                    {row.grow_context && <Field label="Grow context">{row.grow_context}</Field>}
                    {row.contact_email && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Mail className="h-3.5 w-3.5" />
                        <a className="underline" href={`mailto:${row.contact_email}`}>
                          {row.contact_email}
                        </a>
                        {row.follow_up_ok && (
                          <Badge variant="outline" className="ml-1">
                            Follow-up OK
                          </Badge>
                        )}
                      </div>
                    )}
                    <ReviewControls
                      reviewed={reviewed}
                      reviewedAt={row.reviewed_at}
                      notes={draftNoteFor(row.id, row.admin_notes)}
                      saving={savingId === row.id}
                      onNotesChange={(v) =>
                        setNotesDraft((prev) => ({ ...prev, [row.id]: v }))
                      }
                      onToggleReviewed={() => toggleReviewed("feedback", row)}
                      onSaveNotes={() =>
                        updateFeedback(row, {
                          admin_notes: draftNoteFor(row.id, row.admin_notes) || null,
                        })
                      }
                    />
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* Contact */}
        <TabsContent value="contact" className="space-y-3">
          <div className="flex items-center gap-2">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {Object.entries(CATEGORY_LABELS).map(([v, label]) => (
                  <SelectItem key={v} value={v}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading contact messages…
            </div>
          ) : filteredContact.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No contact messages match this filter.
              </CardContent>
            </Card>
          ) : (
            filteredContact.map((row) => {
              const reviewed = row.reviewed_at != null;
              return (
                <Card key={row.id}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{row.name}</CardTitle>
                        <Badge variant="outline">
                          {CATEGORY_LABELS[row.category] ?? row.category}
                        </Badge>
                        <ReviewBadge reviewed={reviewed} />
                      </div>
                      <CardDescription className="text-xs">
                        {formatDate(row.created_at)}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" />
                      <a className="underline" href={`mailto:${row.email}`}>
                        {row.email}
                      </a>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <Field label="Message">
                      <span className="whitespace-pre-wrap">{row.message}</span>
                    </Field>
                    {row.grow_context && <Field label="Grow context">{row.grow_context}</Field>}
                    <ReviewControls
                      reviewed={reviewed}
                      reviewedAt={row.reviewed_at}
                      notes={draftNoteFor(row.id, row.admin_notes)}
                      saving={savingId === row.id}
                      onNotesChange={(v) =>
                        setNotesDraft((prev) => ({ ...prev, [row.id]: v }))
                      }
                      onToggleReviewed={() => toggleReviewed("contact", row)}
                      onSaveNotes={() =>
                        updateContact(row, {
                          admin_notes: draftNoteFor(row.id, row.admin_notes) || null,
                        })
                      }
                    />
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm text-foreground">{children}</div>
    </div>
  );
}
