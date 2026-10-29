#!/usr/bin/env node
/**
 * Verify a production build made with VITE_CHECKOUT_DISABLED="true".
 *
 * Checks the built assets only. Does not deploy, does not print tokens.
 *
 * Expects, across every emitted bundle (client `.js` and the Nitro server
 * `.mjs`, both constant-folded by the same build):
 *  - the paused checkout copy to be present
 *  - the kill switch to have removed Paddle.Initialize and
 *    Paddle.Checkout.open
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { discoverBundleRoots } from "./lib/checkoutDisabledBundleRoots.mjs";

const PAUSED_COPY =
  "New checkout is paused. Existing plans, renewals and billing management are not affected.";
const FORBIDDEN = ["Paddle.Initialize", "Paddle.Checkout.open", "Paddle.Environment.set"];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, out);
    else if (name.endsWith(".js") || name.endsWith(".mjs")) out.push(path);
  }
  return out;
}

// The emitted layout is detected (nitro.json, then conventional trees) so a
// layout move yields a real verdict instead of bundleFiles: 0.
const roots = discoverBundleRoots(process.cwd());
const files = roots.flatMap((root) => walk(root.path));
let pausedHits = 0;
const forbiddenHits = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (text.includes(PAUSED_COPY)) pausedHits += 1;
  for (const needle of FORBIDDEN) {
    if (text.includes(needle)) forbiddenHits.push(`${needle} in ${file}`);
  }
}

const receipt = {
  checkedAt: new Date().toISOString(),
  bundleRoots: roots,
  bundleFiles: files.length,
  pausedCopyHits: pausedHits,
  forbiddenHits,
  pass: files.length > 0 && pausedHits > 0 && forbiddenHits.length === 0,
};

const receiptPath = resolve("checkout-disabled-bundle-receipt.json");
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

if (!receipt.pass) {
  console.error(
    `checkout-disabled bundle verification failed: bundleRoots=${roots.length} bundleFiles=${files.length} pausedCopyHits=${pausedHits} forbidden=${forbiddenHits.length}`,
  );
  process.exit(1);
}

console.log(
  `checkout-disabled bundle verification passed: paused copy in ${pausedHits} file(s), no Paddle init/open in ${files.length} bundle files across ${roots.length} root(s)`,
);
