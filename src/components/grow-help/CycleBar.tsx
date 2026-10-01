import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CycleInputs, UnitSystem } from "@/lib/growHelpToolkitState";
import NumberField from "./NumberField";

export interface CycleBarProps {
  cycle: CycleInputs;
  unitSystem: UnitSystem;
  onChange: (cycle: CycleInputs) => void;
  onUnitSystemChange: (unitSystem: UnitSystem) => void;
}

export default function CycleBar({
  cycle,
  unitSystem,
  onChange,
  onUnitSystemChange,
}: CycleBarProps) {
  const cycleDays = (cycle.vegDays ?? 0) + (cycle.flowerDays ?? 0);
  return (
    <Card className="border-primary/25 bg-card/90 shadow-sm" data-testid="grow-help-cycle-bar">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 pb-3">
        <div>
          <p className="flex items-center gap-2 font-display text-lg font-semibold">
            <CalendarDays aria-hidden="true" className="h-5 w-5 text-primary" />
            Shared cycle
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            One change updates light energy and expense timing everywhere.
          </p>
        </div>
        <div
          className="inline-flex rounded-lg border border-border bg-background p-1"
          aria-label="Unit system"
        >
          <Button
            type="button"
            size="sm"
            variant={unitSystem === "us" ? "default" : "ghost"}
            onClick={() => onUnitSystemChange("us")}
            aria-pressed={unitSystem === "us"}
          >
            US · gal / ft
          </Button>
          <Button
            type="button"
            size="sm"
            variant={unitSystem === "metric" ? "default" : "ghost"}
            onClick={() => onUnitSystemChange("metric")}
            aria-pressed={unitSystem === "metric"}
          >
            Metric · L / m
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-7">
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
          <Label htmlFor="cycle-name">Cycle name</Label>
          <Input
            id="cycle-name"
            value={cycle.name}
            maxLength={80}
            onChange={(event) => onChange({ ...cycle, name: event.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            {cycleDays > 0
              ? `${cycleDays} planned days`
              : "Add veg and flower days to price a cycle."}
          </p>
        </div>
        <NumberField
          id="cycle-veg-days"
          label="Veg days"
          value={cycle.vegDays}
          onChange={(vegDays) => onChange({ ...cycle, vegDays })}
          min={0}
          max={365}
          step={1}
          unit="days"
          integer
          required
        />
        <NumberField
          id="cycle-flower-days"
          label="Flower days"
          value={cycle.flowerDays}
          onChange={(flowerDays) => onChange({ ...cycle, flowerDays })}
          min={0}
          max={365}
          step={1}
          unit="days"
          integer
          required
        />
        <NumberField
          id="cycle-veg-hours"
          label="Veg light"
          value={cycle.vegPhotoperiodHours}
          onChange={(vegPhotoperiodHours) => onChange({ ...cycle, vegPhotoperiodHours })}
          min={0.1}
          max={24}
          step={0.5}
          unit="h/day"
          required
        />
        <NumberField
          id="cycle-flower-hours"
          label="Flower light"
          value={cycle.flowerPhotoperiodHours}
          onChange={(flowerPhotoperiodHours) => onChange({ ...cycle, flowerPhotoperiodHours })}
          min={0.1}
          max={24}
          step={0.5}
          unit="h/day"
          required
        />
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <NumberField
            id="cycle-electricity-rate"
            label="Electricity"
            value={cycle.electricityRate}
            onChange={(electricityRate) => onChange({ ...cycle, electricityRate })}
            min={0}
            max={10}
            step={0.001}
            unit="/ kWh"
            required
          />
          <div className="space-y-1.5">
            <Label htmlFor="cycle-currency">Currency</Label>
            <Input
              id="cycle-currency"
              value={cycle.currency}
              maxLength={3}
              onChange={(event) =>
                onChange({
                  ...cycle,
                  currency: event.target.value.replace(/[^A-Za-z]/g, "").toUpperCase(),
                })
              }
              aria-label="Three-letter currency code"
            />
            <p className="sr-only">Three-letter code such as USD, CAD, EUR, or AUD.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
