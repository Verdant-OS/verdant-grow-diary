import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Flame, Citrus, Leaf, Flower2, Wind, TreePine } from "lucide-react";

export type TerpeneProfile = {
  gas: number;
  citrus: number;
  earthy: number;
  floral: number;
  skunk: number;
  pine: number;
};

const TERPENE_CATEGORIES = [
  { key: "gas", label: "Gas / Fuel", icon: Flame, color: "text-red-500" },
  { key: "citrus", label: "Citrus / Fruity", icon: Citrus, color: "text-orange-500" },
  { key: "earthy", label: "Earthy / Spicy", icon: Leaf, color: "text-amber-700" },
  { key: "floral", label: "Floral / Sweet", icon: Flower2, color: "text-pink-500" },
  { key: "skunk", label: "Skunk / Cheese", icon: Wind, color: "text-purple-500" },
  { key: "pine", label: "Pine / Woody", icon: TreePine, color: "text-emerald-500" },
] as const;

export default function TerpeneProfileLog({ 
  value, 
  onChange,
  readOnly = false
}: { 
  value: TerpeneProfile;
  onChange?: (val: TerpeneProfile) => void;
  readOnly?: boolean;
}) {
  const [profile, setProfile] = useState<TerpeneProfile>(value);

  const update = (key: keyof TerpeneProfile, val: number) => {
    if (readOnly) return;
    const next = { ...profile, [key]: val };
    setProfile(next);
    onChange?.(next);
  };

  return (
    <div className="space-y-4">
      <Label>Sensory & Terpene Profile</Label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TERPENE_CATEGORIES.map(({ key, label, icon: Icon, color }) => (
          <div key={key} className="glass rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${color}`} />
                <span className="text-sm font-medium">{label}</span>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {profile[key as keyof TerpeneProfile]}/10
              </Badge>
            </div>
            {!readOnly && (
              <Slider
                value={[profile[key as keyof TerpeneProfile]]}
                max={10}
                step={1}
                onValueChange={(v) => update(key as keyof TerpeneProfile, v[0])}
                className="mt-1"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
