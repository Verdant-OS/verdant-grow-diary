// Re-export from the canonical Edge Function shared copy so deployed code
// and app/test code never drift. Do NOT add behavior here. Edit the shared
// twin at supabase/functions/_shared/ecowittChannelTentRouter.ts instead.
export * from "../../supabase/functions/_shared/ecowittChannelTentRouter";
