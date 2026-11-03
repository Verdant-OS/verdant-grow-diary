/**
 * Rules shared by every verified cultivar profile.
 * Later pages (#2719–#2723) reuse this instead of special-casing one slug.
 */
import type {
  CultivarDifficulty,
  CultivarVerificationStatus,
  VerdantCultivarProfile,
} from "@/constants/verdantCultivars";

export class CultivarVerifiedProfileRules {
  static suppressesSamplePhenos(status: CultivarVerificationStatus): boolean {
    return status === "verified";
  }

  static hasSourcedDifficulty(difficulty: CultivarDifficulty | null): boolean {
    return difficulty != null;
  }

  static verifiedDefinition(): string {
    return "Source-backed means every claim on this page links to a dated public source below, conflicts are shown rather than resolved, and claims found only in seed-bank or nursery marketing are labeled. It does not mean DNA-verified, lab-verified, or that any cut you buy is authentic.";
  }

  static phenoHuntNote(): string {
    return "Pheno hunting is available on paid plans.";
  }

  static diaryCta(cultivar: VerdantCultivarProfile): { label: string; href: string } {
    return {
      label: `Start your ${cultivar.name} diary`,
      href: `/auth?mode=signup&utm_source=organic_guide&utm_medium=owned&utm_campaign=search_to_first_value&utm_content=cultivar-${cultivar.slug}`,
    };
  }
}
