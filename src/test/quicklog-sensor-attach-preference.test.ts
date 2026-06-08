/**
 * Tests for the Quick Log sensor attach preference localStorage helpers.
 * Pure / browser-storage-only. No React, no network.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  hasQuickLogSensorAttachPreference,
  loadQuickLogSensorAttachPreference,
  saveQuickLogSensorAttachPreference,
} from "@/lib/quickLogSensorAttachPreference";

describe("quickLogSensorAttachPreference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns fallback when nothing is stored", () => {
    expect(loadQuickLogSensorAttachPreference("t1", false)).toBe(false);
    expect(loadQuickLogSensorAttachPreference("t1", true)).toBe(true);
    expect(hasQuickLogSensorAttachPreference("t1")).toBe(false);
  });

  it("persists and reads true / false per tent", () => {
    saveQuickLogSensorAttachPreference("t1", true);
    saveQuickLogSensorAttachPreference("t2", false);
    expect(loadQuickLogSensorAttachPreference("t1", false)).toBe(true);
    expect(loadQuickLogSensorAttachPreference("t2", true)).toBe(false);
    expect(hasQuickLogSensorAttachPreference("t1")).toBe(true);
    expect(hasQuickLogSensorAttachPreference("t2")).toBe(true);
    // Untouched tent stays at fallback.
    expect(hasQuickLogSensorAttachPreference("t3")).toBe(false);
    expect(loadQuickLogSensorAttachPreference("t3", true)).toBe(true);
  });

  it("ignores empty / null tent ids", () => {
    saveQuickLogSensorAttachPreference(null, true);
    saveQuickLogSensorAttachPreference("", true);
    expect(loadQuickLogSensorAttachPreference(null, false)).toBe(false);
    expect(loadQuickLogSensorAttachPreference("", true)).toBe(true);
    expect(hasQuickLogSensorAttachPreference(null)).toBe(false);
  });

  it("treats malformed stored values as missing", () => {
    window.localStorage.setItem("verdant.quicklog.sensorAttach.tx", "yes");
    expect(loadQuickLogSensorAttachPreference("tx", false)).toBe(false);
    expect(loadQuickLogSensorAttachPreference("tx", true)).toBe(true);
    // "1"/"0" are the only accepted values.
    expect(hasQuickLogSensorAttachPreference("tx")).toBe(false);
  });

  it("overwrites prior value on subsequent save", () => {
    saveQuickLogSensorAttachPreference("t1", true);
    saveQuickLogSensorAttachPreference("t1", false);
    expect(loadQuickLogSensorAttachPreference("t1", true)).toBe(false);
  });
});
