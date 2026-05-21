import { useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { useLeadsList } from "@/hooks/useLeadsList";

const LEAD_TYPES = [
  "beta_user",
  "hardware_partner",
  "grower",
  "investor",
  "other",
] as const;

const SOURCES = ["landing", "other"] as const;

export default function Leads() {
  const [leadType, setLeadType] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { loading, authorized, error, leads } = useLeadsList({
    leadType: leadType === "all" ? null : leadType,
    source: source === "all" ? null : source,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l) =>
        l.email.toLowerCase().includes(q) ||
        (l.name ?? "").toLowerCase().includes(q) ||
        (l.company ?? "").toLowerCase().includes(q),
    );
  }, [leads, search]);

  async function copyEmail(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      toast.success("Email copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Leads Inbox" subtitle="Operator-only view of public lead submissions" />

      {!loading && !authorized && (
        <div className="rounded-xl border border-border/50 bg-card/40 p-6 text-center">
          <h2 className="font-display text-lg font-semibold">Unauthorized</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Leads are operator-only. If you should have access, contact an operator.
          </p>
        </div>
      )}

      {authorized && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Lead type</label>
              <Select value={leadType} onValueChange={setLeadType}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {LEAD_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Source</label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  {SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-48">
              <label className="text-xs text-muted-foreground">Search</label>
              <Input
                placeholder="email, name, company"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              Failed to load leads: {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading leads…</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-border/50 bg-card/40 p-8 text-center">
              <p className="text-sm text-muted-foreground">No leads match these filters.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/50 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Received</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(l.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>{l.name ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{l.email}</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => copyEmail(l.email)}
                            aria-label="Copy email"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>{l.company ?? "—"}</TableCell>
                      <TableCell>{l.role ?? "—"}</TableCell>
                      <TableCell><Badge variant="secondary">{l.lead_type}</Badge></TableCell>
                      <TableCell><Badge variant="outline">{l.source}</Badge></TableCell>
                      <TableCell className="max-w-sm whitespace-pre-wrap text-sm text-muted-foreground">
                        {l.message ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
