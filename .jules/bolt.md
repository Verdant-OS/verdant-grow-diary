## 2026-03-31 - Memoize Array Parameters Passed to Custom Multi-Tent Query Hooks
**Learning:** In `Dashboard.tsx`, mapping `tents` to extract `tentIds` created a fresh array reference on every render (which occurs at least every minute due to `useNowTick`). Hooks like `useEnvironmentTrends` receive `tentIds` directly; passing unmemoized mapped arrays causes unnecessary query key recalculations and re-evaluations across renders.
**Action:** Always memoize derived array props/arguments (like `tentIds`) using `useMemo` when passing them into custom query hooks across major dashboard pages.
