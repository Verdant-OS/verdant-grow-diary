import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useTents } from "@/hooks/use-tents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Camera, ImagePlus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import PlantPhotoView from "@/components/PlantPhotoView";
import PlantPhoto from "@/components/PlantPhoto";
import {
  validatePlantProfilePhotoFile,
  PLANT_PROFILE_PHOTO_ALLOWED_MIME,
  type PlantProfilePhotoMime,
} from "@/lib/plantProfilePhotoFileRules";
import {
  uploadPlantProfilePhoto,
  removeUploadedPlantProfilePhoto,
} from "@/lib/plantProfilePhotoUploadService";
import { usePlantProfilePhotoPreview } from "@/hooks/usePlantProfilePhotoPreview";
import PlantProfilePhotoPreview from "@/components/PlantProfilePhotoPreview";

/**
 * Edits an existing plant's user-facing fields. Profile photo is now
 * a native camera / library upload — the grower never has to find or
 * enter a link. See docs/plant-profile-photo-upload-v1.md.
 *
 * RLS enforces ownership; user_id and grow_id are never touched here.
 * This dialog writes only to `plants` and only uploads to the
 * private `diary-photos` bucket. No alerts, Action Queue, sensor,
 * AI, Edge Function, or device writes.
 */
const STAGES = [
  { value: "seedling", label: "Seedling" },
  { value: "veg", label: "Vegetative" },
  { value: "flower", label: "Flowering" },
  { value: "flush", label: "Flushing" },
  { value: "harvest", label: "Harvest" },
  { value: "cure", label: "Cure" },
];

const HEALTH = [
  { value: "healthy", label: "Healthy" },
  { value: "watch", label: "Watch" },
  { value: "issue", label: "Issue" },
];

const ACCEPT_ATTR = PLANT_PROFILE_PHOTO_ALLOWED_MIME.join(",");

interface Plant {
  id: string;
  name: string;
  strain?: string | null;
  stage: string;
  health: string;
  startedAt?: string | null;
  tentId?: string | null;
  growId?: string | null;
  lastNote?: string | null;
  photo?: string | null;
}

interface Props {
  plant: Plant;
  trigger?: React.ReactNode;
}

interface SelectedPhoto {
  file: File;
  mime: PlantProfilePhotoMime;
}

export default function EditPlantDialog({ plant, trigger }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: allTents = [] } = useTents();
  const tents = plant.growId
    ? (allTents as Array<{ id: string; name: string; grow_id: string | null }>).filter(
        (t) => t.grow_id === plant.growId,
      )
    : allTents;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [clearPhoto, setClearPhoto] = useState(false);
  const [selected, setSelected] = useState<SelectedPhoto | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState({
    name: plant.name ?? "",
    strain: plant.strain ?? "",
    stage: plant.stage ?? "seedling",
    health: plant.health ?? "healthy",
    tent_id: plant.tentId ?? "none",
    started_at: plant.startedAt ? plant.startedAt.slice(0, 10) : "",
    last_note: plant.lastNote ?? "",
  });

  function resetLocalPhotoState() {
    setSelected(null);
    setClearPhoto(false);
    setPhotoErr(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (libraryInputRef.current) libraryInputRef.current.value = "";
  }

  useEffect(() => {
    if (open) {
      setForm({
        name: plant.name ?? "",
        strain: plant.strain ?? "",
        stage: plant.stage ?? "seedling",
        health: plant.health ?? "healthy",
        tent_id: plant.tentId ?? "none",
        started_at: plant.startedAt ? plant.startedAt.slice(0, 10) : "",
        last_note: plant.lastNote ?? "",
      });
      resetLocalPhotoState();
    } else {
      resetLocalPhotoState();
    }
    // Also reset when the target plant id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plant.id]);

  // Object-URL lifecycle (create + decode-probe + revoke) is owned by
  // the preview hook so unsupported HEIC/HEIF browsers see the
  // accessible "photo selected" fallback instead of a broken image.
  const { preview } = usePlantProfilePhotoPreview({
    file: selected?.file ?? null,
    mimeType: selected?.mime ?? null,
  });

  function onFileChosen(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    const v = validatePlantProfilePhotoFile(file);
    if (v.ok === false) {
      setPhotoErr(v.message);
      return;
    }
    setSelected({ file, mime: v.mime });
    setPhotoErr(null);
    setClearPhoto(false);
  }


  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!user) {
      toast.error("Not signed in");
      return;
    }
    setBusy(true);

    let uploadedPath: string | null = null;
    let newReference: string | null = null;
    try {
      if (selected) {
        const result = await uploadPlantProfilePhoto({
          file: selected.file,
          mime: selected.mime,
          userId: user.id,
          plantId: plant.id,
          growId: plant.growId ?? null,
        });
        uploadedPath = result.path;
        newReference = result.reference;
      }
    } catch {
      setBusy(false);
      setPhotoErr("Upload failed. Try again in a moment.");
      return;
    }

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      strain: form.strain.trim(),
      stage: form.stage,
      health: form.health,
      tent_id: form.tent_id === "none" ? null : form.tent_id,
      last_note: form.last_note.trim() || null,
    };
    if (newReference) {
      payload.photo_url = newReference;
    } else if (clearPhoto) {
      payload.photo_url = null;
    }
    if (form.started_at) {
      payload.started_at = new Date(form.started_at).toISOString();
    }

    const { error } = await supabase
      .from("plants")
      .update(payload as never)
      .eq("id", plant.id);

    if (error) {
      // Clean up orphan upload; keep old plant photo untouched.
      if (uploadedPath) {
        await removeUploadedPlantProfilePhoto(uploadedPath);
      }
      setBusy(false);
      setPhotoErr(null);
      toast.error("Could not save changes. Please try again.");
      return;
    }

    setBusy(false);
    toast.success(newReference ? "Plant photo updated." : "Plant updated");
    qc.invalidateQueries({ queryKey: ["plants"] });
    qc.invalidateQueries({ queryKey: ["grow", "plants"] });
    qc.invalidateQueries({ queryKey: ["grow", "plant", plant.id] });
    qc.invalidateQueries({ queryKey: ["tent-detail"] });
    resetLocalPhotoState();
    setOpen(false);
  }

  const previewName = form.name || plant.name;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            data-testid="edit-plant-trigger"
          >
            <Pencil className="h-4 w-4" /> Edit Plant
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className="glass max-w-md max-h-[90vh] overflow-y-auto"
        data-testid="edit-plant-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display">Edit plant</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div>
            <Label>Profile photo for {previewName}</Label>
            <div className="flex items-start gap-3 mt-1">
              <div className="h-20 w-20 rounded-lg overflow-hidden border border-border/60 flex-shrink-0">
                {selected ? (
                  <PlantPhotoView
                    src={selected.previewUrl}
                    alt={`Preview of new profile photo for ${previewName}`}
                    className="h-full w-full"
                    iconClassName="h-4 w-4"
                    caption=""
                    ctaLabel={null}
                    testId="edit-plant-photo-preview"
                  />
                ) : (
                  <PlantPhoto
                    src={clearPhoto ? null : plant.photo}
                    alt={`Current profile photo for ${previewName}`}
                    className="h-full w-full"
                    iconClassName="h-4 w-4"
                    caption=""
                    ctaLabel={null}
                    testId="edit-plant-photo-preview"
                  />
                )}
              </div>
              <div className="flex-1 grid gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1 min-h-[44px]"
                    onClick={() => cameraInputRef.current?.click()}
                    data-testid="edit-plant-photo-camera"
                    aria-label="Take a photo of this plant"
                  >
                    <Camera className="h-4 w-4" /> Take Photo
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1 min-h-[44px]"
                    onClick={() => libraryInputRef.current?.click()}
                    data-testid="edit-plant-photo-library"
                    aria-label="Choose a photo from your library"
                  >
                    <ImagePlus className="h-4 w-4" /> Choose from Library
                  </Button>
                </div>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept={ACCEPT_ATTR}
                  capture="environment"
                  className="sr-only"
                  aria-hidden="true"
                  tabIndex={-1}
                  onChange={(e) => onFileChosen(e.target.files)}
                  data-testid="edit-plant-photo-camera-input"
                />
                <input
                  ref={libraryInputRef}
                  type="file"
                  accept={ACCEPT_ATTR}
                  className="sr-only"
                  aria-hidden="true"
                  tabIndex={-1}
                  onChange={(e) => onFileChosen(e.target.files)}
                  data-testid="edit-plant-photo-library-input"
                />
                {selected ? (
                  <div
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                    aria-live="polite"
                    data-testid="edit-plant-photo-selected"
                  >
                    <span>Photo ready to upload</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => libraryInputRef.current?.click()}
                      data-testid="edit-plant-photo-replace"
                    >
                      Replace
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 gap-1"
                      onClick={() => {
                        if (selected)
                          URL.revokeObjectURL(selected.previewUrl);
                        setSelected(null);
                        if (cameraInputRef.current)
                          cameraInputRef.current.value = "";
                        if (libraryInputRef.current)
                          libraryInputRef.current.value = "";
                      }}
                      data-testid="edit-plant-photo-remove-selection"
                    >
                      <X className="h-3.5 w-3.5" /> Remove
                    </Button>
                  </div>
                ) : plant.photo && !clearPhoto ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 gap-1 self-start"
                    onClick={() => setClearPhoto(true)}
                    data-testid="edit-plant-photo-clear"
                  >
                    <X className="h-3.5 w-3.5" /> Clear photo
                  </Button>
                ) : clearPhoto ? (
                  <div
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                    data-testid="edit-plant-photo-cleared"
                  >
                    <span>Photo will be cleared on save</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => setClearPhoto(false)}
                      data-testid="edit-plant-photo-undo-clear"
                    >
                      Undo
                    </Button>
                  </div>
                ) : null}
                <p className="text-[11px] text-muted-foreground">
                  This updates the plant profile photo. It does not add a
                  timeline log. Replacing the profile photo does not delete
                  older diary photos.
                </p>
                {photoErr && (
                  <p
                    role="alert"
                    className="text-xs text-destructive"
                    data-testid="edit-plant-photo-error"
                  >
                    {photoErr}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div>
            <Label>Name</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              data-testid="edit-plant-name"
            />
          </div>
          <div>
            <Label>Strain</Label>
            <Input
              value={form.strain}
              onChange={(e) => setForm({ ...form, strain: e.target.value })}
              data-testid="edit-plant-strain"
            />
          </div>
          <div>
            <Label>Tent</Label>
            <Select
              value={form.tent_id}
              onValueChange={(v) => setForm({ ...form, tent_id: v })}
            >
              <SelectTrigger data-testid="edit-plant-tent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No tent</SelectItem>
                {tents.map((t: { id: string; name: string }) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Stage</Label>
              <Select
                value={form.stage}
                onValueChange={(v) => setForm({ ...form, stage: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Health</Label>
              <Select
                value={form.health}
                onValueChange={(v) => setForm({ ...form, health: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HEALTH.map((h) => (
                    <SelectItem key={h.value} value={h.value}>
                      {h.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Started at</Label>
            <Input
              type="date"
              value={form.started_at}
              onChange={(e) =>
                setForm({ ...form, started_at: e.target.value })
              }
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={form.last_note}
              onChange={(e) => setForm({ ...form, last_note: e.target.value })}
              rows={3}
              data-testid="edit-plant-notes"
            />
          </div>
          <Button
            disabled={busy}
            className="gradient-leaf text-primary-foreground gap-1"
            data-testid="edit-plant-submit"
            aria-live="polite"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
