import { SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import type { LeadDetailViewModel } from "@/lib/leadDetailViewModel";

export interface LeadDetailHeaderProps {
  vm: LeadDetailViewModel;
}

export default function LeadDetailHeader({ vm }: LeadDetailHeaderProps) {
  return (
    <SheetHeader className="space-y-1 text-left">
      <SheetTitle className="font-display text-xl">{vm.title}</SheetTitle>
      <SheetDescription>{vm.subtitle}</SheetDescription>
    </SheetHeader>
  );
}
