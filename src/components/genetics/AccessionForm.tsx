/**
 * Create/edit a genetics accession. Provenance is explicit and never inferred:
 * source kind + known-state are chosen, breeder/cultivar are free text, and the
 * acquisition date is optional (unknown stays unknown, never today()).
 */
import { useState } from "react";
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
import { useUpsertAccession } from "@/hooks/useGeneticsMutations";
import {
  ACCESSION_SOURCE_KINDS,
  KNOWN_STATES,
  accessionSourceLabel,
  knownStateLabel,
} from "@/lib/genetics/traceabilityTypes";
import { SaveStateBar } from "./SaveStateBar";

export interface AccessionFormProps {
  onSaved?: (accessionId: string) => void;
}

export function AccessionForm({ onSaved }: AccessionFormProps) {
  const { submit, retry, status, error } = useUpsertAccession();
  const [sourceKind, setSourceKind] = useState("unknown");
  const [knownState, setKnownState] = useState("known");
  const [cultivar, setCultivar] = useState("");
  const [lineName, setLineName] = useState("");
  const [sourceParty, setSourceParty] = useState("");
  const [generation, setGeneration] = useState("");
  const [acquisitionDate, setAcquisitionDate] = useState("");
  const [notes, setNotes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await submit({
      source_kind: sourceKind,
      known_state: knownState,
      cultivar_name: cultivar,
      line_name: lineName,
      source_party: sourceParty,
      generation,
      acquisition_date: acquisitionDate,
      notes,
    });
    if (res.ok === true && onSaved) onSaved(String(res.data.accession_id ?? ""));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 min-w-0" data-testid="accession-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="acc-source-kind">Source kind</Label>
          <Select value={sourceKind} onValueChange={setSourceKind}>
            <SelectTrigger id="acc-source-kind" className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCESSION_SOURCE_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {accessionSourceLabel(k)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="acc-known-state">Provenance certainty</Label>
          <Select value={knownState} onValueChange={setKnownState}>
            <SelectTrigger id="acc-known-state" className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KNOWN_STATES.map((k) => (
                <SelectItem key={k} value={k}>
                  {knownStateLabel(k)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="acc-cultivar">Cultivar / line</Label>
          <Input id="acc-cultivar" className="min-h-11" value={cultivar} onChange={(e) => setCultivar(e.target.value)} placeholder="e.g. Blue Dream" />
        </div>
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="acc-line">Line name</Label>
          <Input id="acc-line" className="min-h-11" value={lineName} onChange={(e) => setLineName(e.target.value)} />
        </div>
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="acc-party">Breeder / source</Label>
          <Input id="acc-party" className="min-h-11" value={sourceParty} onChange={(e) => setSourceParty(e.target.value)} placeholder="Leave blank if unknown" />
        </div>
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="acc-gen">Generation</Label>
          <Input id="acc-gen" className="min-h-11" value={generation} onChange={(e) => setGeneration(e.target.value)} placeholder="e.g. F1, S1" />
        </div>
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="acc-date">Acquisition date (optional)</Label>
          <Input id="acc-date" type="date" className="min-h-11" value={acquisitionDate} onChange={(e) => setAcquisitionDate(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5 min-w-0">
        <Label htmlFor="acc-notes">Notes</Label>
        <Textarea id="acc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="min-h-11" disabled={status === "pending"}>
          Save accession
        </Button>
        <SaveStateBar status={status} error={error} onRetry={retry} />
      </div>
    </form>
  );
}

export default AccessionForm;
