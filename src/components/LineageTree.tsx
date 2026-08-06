import { GitFork, Sprout, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface LineageNode {
  id: string;
  name: string;
  type: "seed" | "clone" | "cross" | "target";
  mother?: LineageNode;
  father?: LineageNode;
}

function LineageCard({ node, isRoot = false }: { node: LineageNode; isRoot?: boolean }) {
  return (
    <div className={`relative flex flex-col items-center p-3 rounded-xl border ${isRoot ? 'border-primary bg-primary/10' : 'border-border/50 bg-secondary/20'} min-w-[140px]`}>
      <div className="flex items-center gap-1.5 mb-1">
        {node.type === "target" ? <Target className="h-4 w-4 text-primary" /> : 
         node.type === "cross" ? <GitFork className="h-4 w-4 text-amber-500" /> : 
         <Sprout className="h-4 w-4 text-emerald-500" />}
        <span className="font-semibold text-sm">{node.name}</span>
      </div>
      <Badge variant="outline" className="text-[10px] uppercase">
        {node.type}
      </Badge>
    </div>
  );
}

export default function LineageTree({ rootNode }: { rootNode: LineageNode }) {
  if (!rootNode.mother && !rootNode.father) {
    return (
      <div className="glass rounded-2xl p-5 overflow-x-auto">
        <h3 className="font-semibold flex items-center gap-2 mb-4">
          <GitFork className="h-5 w-5 text-primary" />
          Genetic Lineage
        </h3>
        <div className="flex justify-center">
          <LineageCard node={rootNode} isRoot />
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-5 overflow-x-auto">
      <h3 className="font-semibold flex items-center gap-2 mb-6">
        <GitFork className="h-5 w-5 text-primary" />
        Genetic Lineage
      </h3>
      
      <div className="flex flex-col items-center">
        <div className="flex items-end justify-center gap-8 md:gap-16 relative">
          {/* Connecting lines for parents */}
          <div className="absolute top-full left-1/4 right-1/4 h-6 border-b-2 border-l-2 border-r-2 border-border/50 rounded-b-xl translate-y-[-2px] z-0" />
          <div className="absolute top-[calc(100%+1.3rem)] left-1/2 w-0.5 h-6 bg-border/50 z-0" />
          
          {rootNode.mother && (
            <div className="flex flex-col items-center relative z-10 pb-6">
              <span className="text-xs text-muted-foreground mb-2 uppercase tracking-widest font-semibold">Mother</span>
              <LineageCard node={rootNode.mother} />
            </div>
          )}
          
          {rootNode.father && (
            <div className="flex flex-col items-center relative z-10 pb-6">
              <span className="text-xs text-muted-foreground mb-2 uppercase tracking-widest font-semibold">Father</span>
              <LineageCard node={rootNode.father} />
            </div>
          )}
        </div>
        
        <div className="pt-6 relative z-10">
          <LineageCard node={rootNode} isRoot />
        </div>
      </div>
    </div>
  );
}
