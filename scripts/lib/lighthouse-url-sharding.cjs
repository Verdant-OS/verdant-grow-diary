"use strict";

const fs = require("node:fs");

const SHARD_INDEX_ENV = "LHCI_SHARD_INDEX";
const SHARD_COUNT_ENV = "LHCI_SHARD_COUNT";

function parseIntegerEnvironmentValue(value, name) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`${name} must be a non-negative integer string`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be a safe integer`);
  }

  return parsed;
}

function resolveLighthouseShardConfig(environment = process.env) {
  if (environment === null || typeof environment !== "object") {
    throw new Error("Lighthouse shard environment must be an object");
  }

  const indexValue = environment[SHARD_INDEX_ENV];
  const countValue = environment[SHARD_COUNT_ENV];
  const hasIndex = indexValue !== undefined;
  const hasCount = countValue !== undefined;

  if (!hasIndex && !hasCount) {
    return { index: 0, count: 1 };
  }

  if (!hasIndex || !hasCount) {
    throw new Error(`${SHARD_INDEX_ENV} and ${SHARD_COUNT_ENV} must be set together`);
  }

  const index = parseIntegerEnvironmentValue(indexValue, SHARD_INDEX_ENV);
  const count = parseIntegerEnvironmentValue(countValue, SHARD_COUNT_ENV);

  if (count < 1) {
    throw new Error(`${SHARD_COUNT_ENV} must be at least 1`);
  }

  if (index >= count) {
    throw new Error(`${SHARD_INDEX_ENV} must be less than ${SHARD_COUNT_ENV}`);
  }

  return { index, count };
}

function normalizeSitemapUrls(urls) {
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error("Lighthouse URL list must contain at least one URL");
  }

  const normalized = urls.map((url, position) => {
    if (typeof url !== "string" || url.trim().length === 0) {
      throw new Error(`Lighthouse URL at position ${position} must be a non-empty string`);
    }

    return url.trim();
  });

  const uniqueUrls = new Set(normalized);
  if (uniqueUrls.size !== normalized.length) {
    throw new Error("Lighthouse URL list must not contain duplicate URLs");
  }

  return normalized;
}

function extractSitemapUrls(xml) {
  if (typeof xml !== "string") {
    throw new Error("Sitemap XML must be a string");
  }

  const urls = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((match) => match[1]);
  return normalizeSitemapUrls(urls);
}

function loadSitemapUrls(sitemapPath) {
  if (typeof sitemapPath !== "string" || sitemapPath.trim().length === 0) {
    throw new Error("Sitemap path must be a non-empty string");
  }

  return extractSitemapUrls(fs.readFileSync(sitemapPath, "utf8"));
}

function selectLighthouseShard(urls, shardConfig) {
  const normalizedUrls = normalizeSitemapUrls(urls);

  if (
    shardConfig === null ||
    typeof shardConfig !== "object" ||
    !Number.isSafeInteger(shardConfig.index) ||
    !Number.isSafeInteger(shardConfig.count)
  ) {
    throw new Error("Lighthouse shard config must contain safe integer index and count values");
  }

  const { index, count } = shardConfig;
  if (count < 1) {
    throw new Error("Lighthouse shard count must be at least 1");
  }
  if (index < 0 || index >= count) {
    throw new Error("Lighthouse shard index must be between 0 and count - 1");
  }
  if (count > normalizedUrls.length) {
    throw new Error("Lighthouse shard count must not exceed the number of sitemap URLs");
  }

  const selectedUrls = normalizedUrls.filter((_, position) => position % count === index);
  if (selectedUrls.length === 0) {
    throw new Error(`Lighthouse shard ${index} of ${count} selected no URLs`);
  }

  return selectedUrls;
}

module.exports = {
  extractSitemapUrls,
  loadSitemapUrls,
  normalizeSitemapUrls,
  resolveLighthouseShardConfig,
  selectLighthouseShard,
};
