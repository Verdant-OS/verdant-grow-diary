/**
 * The persisted un-nested detail route inventory — the shared source of
 * truth for BOTH the static file/id contract
 * (authenticated-detail-route-unnesting.test.ts) and the runtime matching
 * contract (authenticated-deep-link-runtime-matching.test.ts). Living here
 * (not derived from the current marker set) is what keeps a future
 * re-nesting LOUD: a regressed route disappears from the derived set but
 * never from this list.
 */
export interface UnnestedRouteContract {
  routeFile: string;
  routeId: string;
  classicPathTemplate: string;
  parentListPath: string;
  mustBeUnnested: true;
}
export const UNNESTED_ROUTE_CONTRACTS: readonly UnnestedRouteContract[] = [
  {
    routeFile: "actions_.$actionId.tsx",
    routeId: "/_app/actions_/$actionId",
    classicPathTemplate: "/actions/:actionId",
    parentListPath: "/actions",
    mustBeUnnested: true,
  },
  {
    routeFile: "alerts_.$alertId.tsx",
    routeId: "/_app/alerts_/$alertId",
    classicPathTemplate: "/alerts/:alertId",
    parentListPath: "/alerts",
    mustBeUnnested: true,
  },
  {
    routeFile: "breeding_.$programId.tsx",
    routeId: "/_app/breeding_/$programId",
    classicPathTemplate: "/breeding/:programId",
    parentListPath: "/breeding",
    mustBeUnnested: true,
  },
  {
    routeFile: "breeding_.log.new.tsx",
    routeId: "/_app/breeding_/log/new",
    classicPathTemplate: "/breeding/log/new",
    parentListPath: "/breeding",
    mustBeUnnested: true,
  },
  {
    routeFile: "breeding_.new.tsx",
    routeId: "/_app/breeding_/new",
    classicPathTemplate: "/breeding/new",
    parentListPath: "/breeding",
    mustBeUnnested: true,
  },
  {
    routeFile: "doctor_.sessions.tsx",
    routeId: "/_app/doctor_/sessions",
    classicPathTemplate: "/doctor/sessions",
    parentListPath: "/doctor",
    mustBeUnnested: true,
  },
  {
    routeFile: "doctor_.sessions_.$sessionId.tsx",
    routeId: "/_app/doctor_/sessions_/$sessionId",
    classicPathTemplate: "/doctor/sessions/:sessionId",
    parentListPath: "/doctor/sessions",
    mustBeUnnested: true,
  },
  {
    routeFile: "grows_.$growId.tsx",
    routeId: "/_app/grows_/$growId",
    classicPathTemplate: "/grows/:growId",
    parentListPath: "/grows",
    mustBeUnnested: true,
  },
  {
    routeFile: "grows_.$growId_.learning.tsx",
    routeId: "/_app/grows_/$growId_/learning",
    classicPathTemplate: "/grows/:growId/learning",
    parentListPath: "/grows/:growId",
    mustBeUnnested: true,
  },
  {
    routeFile: "pheno-hunts_.$id.keepers.tsx",
    routeId: "/_app/pheno-hunts_/$id/keepers",
    classicPathTemplate: "/pheno-hunts/:id/keepers",
    parentListPath: "/pheno-hunts",
    mustBeUnnested: true,
  },
  {
    routeFile: "pheno-hunts_.$id.workspace.tsx",
    routeId: "/_app/pheno-hunts_/$id/workspace",
    classicPathTemplate: "/pheno-hunts/:id/workspace",
    parentListPath: "/pheno-hunts",
    mustBeUnnested: true,
  },
  {
    routeFile: "pheno-hunts_.new.tsx",
    routeId: "/_app/pheno-hunts_/new",
    classicPathTemplate: "/pheno-hunts/new",
    parentListPath: "/pheno-hunts",
    mustBeUnnested: true,
  },
  {
    routeFile: "plants_.$id.tsx",
    routeId: "/_app/plants_/$id",
    classicPathTemplate: "/plants/:id",
    parentListPath: "/plants",
    mustBeUnnested: true,
  },
  {
    routeFile: "reports_.diary-range.tsx",
    routeId: "/_app/reports_/diary-range",
    classicPathTemplate: "/reports/diary-range",
    parentListPath: "/reports",
    mustBeUnnested: true,
  },
  {
    routeFile: "reports_.post-grow.$growId.tsx",
    routeId: "/_app/reports_/post-grow/$growId",
    classicPathTemplate: "/reports/post-grow/:growId",
    parentListPath: "/reports",
    mustBeUnnested: true,
  },
  {
    routeFile: "settings_.agent-integrations.tsx",
    routeId: "/_app/settings_/agent-integrations",
    classicPathTemplate: "/settings/agent-integrations",
    parentListPath: "/settings",
    mustBeUnnested: true,
  },
  {
    routeFile: "settings_.analytics.tsx",
    routeId: "/_app/settings_/analytics",
    classicPathTemplate: "/settings/analytics",
    parentListPath: "/settings",
    mustBeUnnested: true,
  },
  {
    routeFile: "tents_.$id.tsx",
    routeId: "/_app/tents_/$id",
    classicPathTemplate: "/tents/:id",
    parentListPath: "/tents",
    mustBeUnnested: true,
  },
] as const;
