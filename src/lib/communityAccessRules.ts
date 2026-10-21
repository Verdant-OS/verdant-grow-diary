import type { AccessFacts } from "@/lib/communityTypes";

/**
 * UI model of collection read authority. Every fact must be strictly true, and
 * the viewer must be the owner or a currently approved reader. Following is not
 * an input. The server's database predicate stays authoritative.
 */
export function canReadCommunityPublication(facts: AccessFacts): boolean {
  const allFactsHold =
    facts.activeAccount === true &&
    facts.activeProfile === true &&
    facts.ownerActive === true &&
    facts.collectionActive === true &&
    facts.publicationActive === true &&
    facts.sourceValid === true &&
    facts.blocked === false;
  if (!allFactsHold) return false;
  return facts.isOwner === true || facts.state === "approved";
}
