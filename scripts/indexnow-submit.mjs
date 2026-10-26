#!/usr/bin/env node
/**
 * IndexNow submission for production sitemap URLs.
 *
 * Not wired to CI, the merge queue, or any post-deploy hook. Run it yourself
 * after a production deploy of verdant-grow-diary is live:
 *
 *   INDEXNOW_SUBMIT=1 node scripts/indexnow-submit.mjs
 *
 * The key file is public/a7c3e91b4d8f2e6c0b5a19d47e83f012.txt and must be
 * reachable at https://verdantgrowdiary.com/a7c3e91b4d8f2e6c0b5a19d47e83f012.txt
 * before a search engine will accept the ping. This process exits without
 * a network call unless INDEXNOW_SUBMIT=1.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const KEY = "a7c3e91b4d8f2e6c0b5a19d47e83f012";
const HOST = "verdantgrowdiary.com";
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = "https://api.indexnow.org/indexnow";

if (process.env.INDEXNOW_SUBMIT !== "1") {
  console.log(
    "IndexNow submit is disabled. After the production deploy is live, run: INDEXNOW_SUBMIT=1 node scripts/indexnow-submit.mjs",
  );
  process.exit(0);
}

const sitemap = readFileSync(resolve("public/sitemap.xml"), "utf8");
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
const body = {
  host: HOST,
  key: KEY,
  keyLocation: KEY_LOCATION,
  urlList,
};

const response = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});

if (!response.ok) {
  const text = await response.text();
  console.error(`IndexNow responded ${response.status}: ${text.slice(0, 500)}`);
  process.exit(1);
}

console.log(`IndexNow accepted ${urlList.length} sitemap URLs (${response.status}).`);
