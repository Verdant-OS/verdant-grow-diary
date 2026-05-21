import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Bookmark, Pencil, Trash2 } from "lucide-react";
import type { LeadSavedView } from "@/lib/leadSavedViewsRules";

interface Props {
  views: LeadSavedView[];
  onApply: (view: LeadSavedView) => void;
  onSave: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export default function LeadSavedViewsMenu({
  views,
  onApply,
  onSave,
  onRename,
  onDelete,
}: Props) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [renameTarget, setRenameTarget] = useState<LeadSavedView | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function handleSave() {
    if (!name.trim()) return;
    onSave(name);
    setName("");
    setSaveOpen(false);
  }
  function handleRename() {
    if (!renameTarget || !renameValue.trim()) return;
    onRename(renameTarget.id, renameValue);
    setRenameTarget(null);
    setRenameValue("");
  }

  return (
    <div className="flex items-end gap-2" data-testid="leads-saved-views">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" data-testid="leads-saved-views-trigger">
            <Bookmark />
            Saved views
            <span className="text-xs text-muted-foreground">({views.length})</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Saved views</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {views.length === 0 ? (
            <div
              className="px-2 py-3 text-xs text-muted-foreground"
              data-testid="leads-saved-views-empty"
            >
              No saved views yet.
            </div>
          ) : (
            views.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-1 px-1"
                data-testid="leads-saved-view-row"
              >
                <DropdownMenuItem
                  className="flex-1 cursor-pointer"
                  onSelect={(e) => {
                    e.preventDefault();
                    onApply(v);
                  }}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{v.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {v.quickFilter} · {v.sort}
                      {v.search ? ` · "${v.search}"` : ""}
                    </span>
                  </div>
                </DropdownMenuItem>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => {
                    setRenameTarget(v);
                    setRenameValue(v.name);
                  }}
                  aria-label={`Rename ${v.name}`}
                  data-testid="leads-saved-view-rename"
                >
                  <Pencil />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => onDelete(v.id)}
                  aria-label={`Delete ${v.name}`}
                  data-testid="leads-saved-view-delete"
                >
                  <Trash2 />
                </Button>
              </div>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        size="sm"
        variant="secondary"
        onClick={() => setSaveOpen(true)}
        data-testid="leads-saved-view-save"
      >
        Save view
      </Button>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save current view</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="e.g. Overdue beta growers"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="leads-saved-view-name-input"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!name.trim()}>
              Save view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(o) => !o && setRenameTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename saved view</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            data-testid="leads-saved-view-rename-input"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!renameValue.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
