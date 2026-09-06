# Amplitude Agent Analytics — Edge status

## Status: BLOCKED on Supabase Edge (`ai-doctor-review`)

`supabase/functions/ai-doctor-review` runs on **Deno** (Supabase Edge Functions).

`@amplitude/ai` (and its `@amplitude/analytics-node` dependency) requires Node.js
builtins (`node:async_hooks`, `node:module`, `node:crypto`) and is **not
Deno-compatible**. Installing it into the Edge function would fail at bundle/
runtime rather than produce Agent Analytics sessions.

## What we did instead

- Documented `AMPLITUDE_AI_API_KEY` in `.env.example` for a future Node agent
  runtime (or a fetch-based HTTP API transport if Edge instrumentation is
  required later).
- Did **not** add `@amplitude/ai` to the Edge function, invent a custom
  transport, or change production Edge behavior in this stay-draft.

## Unblock path (out of scope for this PR)

1. Prefer a Node-hosted agent path and follow `amplitude-ai.md` from
   `@amplitude/ai`, **or**
2. Implement Amplitude’s documented fetch-based `[Agent]` event transport for
   edge runtimes (HTTP API v2) without importing `@amplitude/ai` at runtime.
