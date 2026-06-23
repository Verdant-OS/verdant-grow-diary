#!/usr/bin/env node
// Demo-Proof local helper: summarize Playwright result artifacts found under
// a directory (default: ./test-results). Looks for trace.zip, *.webm, *.png.
//
// Usage:
//   node scripts/summarize-demo-proof-playwright-results.mjs [path]
//
// Exit codes:
//   0  -> summarized (even if nothing was found)
//   2  -> input path missing or unreadable
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:str" /* placeholder */;
