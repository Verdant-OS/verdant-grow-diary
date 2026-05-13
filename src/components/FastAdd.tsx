import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { BookOpen, Droplets, FlaskConical, Scissors, Camera, Activity, Stethoscope, Sprout } from "lucide-react";

const opts = [
  { label: "Diary Note", icon: BookOpen, to: "/app/diary?new=note" },
  { label: "Watering", icon: Droplets, to: "/app/diary?new=watering" },
  { label: "Feeding", icon: FlaskConical, to: "/app/diary?new=feeding" },
  { label: "Training", icon: Scissors, to: "/app/diary?new=training" },
  { label: "Photo", icon: Camera, to: "/app/photos?upload=1" },
  { label: "Environment", icon: Activity, to: "/app/sensors?new=1" },
  { label: "Diagnosis", icon: Stethoscope, to: "/app/diagnosis" },
  { label: "Harvest", icon: Sprout, to: "/app/diary?new=harvest" },
];

export function FastAdd({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const nav = useNavigate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass border-border/60 max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Fast Add</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {opts.map(o => (
            <Button key={o.label} variant="outline"
              className="h-20 flex-col gap-2 border-border/60 hover:border-primary hover:bg-primary/5"
              onClick={() => { onOpenChange(false); nav(o.to); }}>
              <o.icon className="h-5 w-5 text-primary" />
              <span className="text-xs">{o.label}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
