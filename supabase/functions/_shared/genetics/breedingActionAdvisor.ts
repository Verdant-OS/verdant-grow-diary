import type { BreedingEvent, BreedingEventType } from "./breedingTypes.ts";

export type RiskLevel = "high" | "medium" | "low";

export interface SuggestedAction {
  title: string;
  due_offset_days: number;
  risk_level: RiskLevel;
  reason: string;
  next_steps: string[];
}

export function suggestBreedingFollowUpActions(event: BreedingEvent): SuggestedAction[] {
  const suggestions: SuggestedAction[] = [];

  switch (event.type) {
    case "reversal_application": {
      const method = (event.details?.method || "").trim().toLowerCase();
      
      if (method === "sts_spray" || method === "colloidal_silver") {
        suggestions.push({
          title: "Isolate reversed plant",
          due_offset_days: 5,
          risk_level: "high",
          reason: `Chemical reversal application recorded on ${event.occurred_at.split('T')[0]}. Isolate before pollen drops.`,
          next_steps: [
            "Log an isolation start event when moving the plant",
          ]
        });
      }

      suggestions.push({
        title: "Check for pollen shed",
        due_offset_days: 9,
        risk_level: "medium",
        reason: `Reversal application recorded on ${event.occurred_at.split('T')[0]}. Begin monitoring for pollen sacks.`,
        next_steps: [
          "Log 'pollen_shed_observed' when pollen starts dropping",
        ]
      });
      break;
    }

    case "isolation_start": {
      suggestions.push({
        title: "End isolation",
        due_offset_days: 14,
        risk_level: "medium",
        reason: `Isolation started on ${event.occurred_at.split('T')[0]}. Monitor closely.`,
        next_steps: [
          "Log an isolation end event or observation when moving plants back.",
        ]
      });
      break;
    }

    case "pollination": {
      suggestions.push({
        title: "Monitor seed development",
        due_offset_days: 14,
        risk_level: "medium",
        reason: `Pollination recorded on ${event.occurred_at.split('T')[0]}. Check calyx swelling.`,
        next_steps: [
          "Inspect calyxes for seed formation",
        ]
      });
      suggestions.push({
        title: "Prepare for cross harvest",
        due_offset_days: 28,
        risk_level: "medium",
        reason: `Pollination recorded on ${event.occurred_at.split('T')[0]}. Seeds may be nearing maturity.`,
        next_steps: [
          "Log 'cross_harvest' when seeds are ready",
        ]
      });
      break;
    }

    case "pollen_shed_observed": {
      const intensity = (event.details?.intensity || "").trim().toLowerCase();
      
      if (intensity === "heavy") {
        suggestions.push({
          title: "Inspect receivers for receptive stigmas",
          due_offset_days: 1,
          risk_level: "high",
          reason: `Heavy pollen shed observed. Receivers may now be in peak receptive window. Event date: ${event.occurred_at.split('T')[0]}`,
          next_steps: [
            "Log \"stigmas_receptive\" if stigmas are white and sticky",
            "Consider performing pollination within the next 48 hours if not already done"
          ]
        });
      } else {
        const isModerate = intensity === "moderate";
        const isLight = intensity === "light";
        
        const prefix = isModerate ? "Moderate p" : (isLight ? "Light p" : "P");
        
        suggestions.push({
          title: "Inspect receivers for receptive stigmas",
          due_offset_days: 2,
          risk_level: "medium",
          reason: `${prefix}ollen shed observed. Receivers may be entering receptive window. Event date: ${event.occurred_at.split('T')[0]}`,
          next_steps: [
            "Log \"stigmas_receptive\" if stigmas are white and sticky",
            "Monitor daily for the next 3 days"
          ]
        });
      }
      break;
    }

    case "stigmas_receptive": {
      suggestions.push({
        title: "Confirm pollination success",
        due_offset_days: 3,
        risk_level: "high",
        reason: `Stigmas became receptive on ${event.occurred_at.split('T')[0]}. Confirm pollen catch.`,
        next_steps: [
          "Look for browned/receded stigmas",
          "Log a 'pollination' event if successful"
        ]
      });
      break;
    }

    case "cross_harvest": {
      suggestions.push({
        title: "Process harvested seeds",
        due_offset_days: 7,
        risk_level: "medium",
        reason: `Cross harvested on ${event.occurred_at.split('T')[0]}. Time to dry and sort.`,
        next_steps: [
          "Ensure seeds are properly dried",
          "Sort viable seeds from chaff"
        ]
      });
      break;
    }
  }

  return suggestions;
}
