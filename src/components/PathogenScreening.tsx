import { AlertTriangle, CheckCircle, Clock, ShieldAlert, ShieldCheck, FileSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface PathogenTest {
  id: string;
  testedAt: string;
  pathogen: string;
  result: "clean" | "infected" | "pending" | "inconclusive";
  labName?: string;
  notes?: string;
}

export default function PathogenScreening({ tests }: { tests: PathogenTest[] }) {
  if (!tests || tests.length === 0) {
    return (
      <div className="glass rounded-2xl p-5 border border-border/50">
        <h3 className="font-semibold flex items-center gap-2 mb-4">
          <FileSearch className="h-5 w-5 text-muted-foreground" />
          Pathogen Indexing (PCR)
        </h3>
        <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
          <ShieldAlert className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm">No PCR tests logged.</p>
          <p className="text-xs mt-1">James Loud Methodology recommends testing library mothers for HLVd.</p>
        </div>
      </div>
    );
  }

  // Find if there are any infections
  const hasInfection = tests.some(t => t.result === "infected");
  const isPending = tests.some(t => t.result === "pending");

  return (
    <div className={`glass rounded-2xl p-5 border ${hasInfection ? 'border-destructive/50 bg-destructive/5' : 'border-emerald-500/30 bg-emerald-500/5'}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          {hasInfection ? (
            <AlertTriangle className="h-5 w-5 text-destructive" />
          ) : (
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
          )}
          Pathogen Indexing (PCR)
        </h3>
        {hasInfection ? (
          <Badge variant="destructive" className="text-xs">Quarantine Required</Badge>
        ) : isPending ? (
          <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/50">Awaiting Results</Badge>
        ) : (
          <Badge variant="outline" className="text-xs text-emerald-500 border-emerald-500/50 bg-emerald-500/10">Clean Library</Badge>
        )}
      </div>

      <div className="space-y-3">
        {tests.map((test) => (
          <div key={test.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50 gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{test.pathogen}</span>
                {test.result === "clean" && <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />}
                {test.result === "infected" && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                {test.result === "pending" && <Clock className="h-3.5 w-3.5 text-amber-500" />}
                {test.result === "inconclusive" && <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span>{new Date(test.testedAt).toLocaleDateString()}</span>
                {test.labName && (
                  <>
                    <span>&bull;</span>
                    <span>{test.labName}</span>
                  </>
                )}
              </div>
            </div>
            
            <div className="flex items-center">
              <Badge 
                variant={
                  test.result === "clean" ? "default" :
                  test.result === "infected" ? "destructive" :
                  test.result === "pending" ? "secondary" : "outline"
                }
                className={test.result === "clean" ? "bg-emerald-500 hover:bg-emerald-600" : ""}
              >
                {test.result.toUpperCase()}
              </Badge>
            </div>
            {test.notes && (
              <p className="text-xs text-muted-foreground w-full sm:hidden mt-2">{test.notes}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
