import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";
import {
  appendSample, filterByWindow, windowMsFor, WINDOWS,
  recentSamples, applyTelemetry, resetSamples, chartWindow,
} from "./stores.js";

describe("appendSample", () => {
  it("pushes onto an empty buffer", () => {
    const out = appendSample([], { ts: 1, readings: {}, quality: {} }, 5);
    expect(out.length).toBe(1);
    expect(out[0].ts).toBe(1);
  });

  it("does not mutate the input array", () => {
    const buf = [{ ts: 1, readings: {}, quality: {} }];
    const out = appendSample(buf, { ts: 2, readings: {}, quality: {} }, 5);
    expect(buf.length).toBe(1);
    expect(out.length).toBe(2);
    expect(out).not.toBe(buf);
  });

  it("drops oldest samples when over cap", () => {
    let buf: Array<{ ts: number; readings: any; quality: any }> = [];
    for (let i = 0; i < 7; i++) buf = appendSample(buf, { ts: i, readings: {}, quality: {} }, 5);
    expect(buf.length).toBe(5);
    expect(buf[0].ts).toBe(2);
    expect(buf[4].ts).toBe(6);
  });

  it("keeps order monotonic", () => {
    let buf: Array<{ ts: number; readings: any; quality: any }> = [];
    for (let i = 0; i < 10; i++) buf = appendSample(buf, { ts: i * 100, readings: {}, quality: {} }, 4);
    for (let i = 1; i < buf.length; i++) expect(buf[i].ts).toBeGreaterThan(buf[i - 1].ts);
  });
});

describe("filterByWindow", () => {
  const samples = [10, 20, 30, 40, 50, 60].map((ts) => ({ ts }));

  it("returns the input unchanged when window is null (unlimited)", () => {
    const out = filterByWindow(samples, null, 100);
    expect(out).toBe(samples);
  });

  it("returns empty when input is empty", () => {
    expect(filterByWindow([], 60_000, 100)).toEqual([]);
  });

  it("returns the suffix within the window", () => {
    // window = 25, now = 60 → cutoff = 35; keep ts >= 35 → 40, 50, 60
    const out = filterByWindow(samples, 25, 60);
    expect(out.map((s) => s.ts)).toEqual([40, 50, 60]);
  });

  it("returns all samples when none are older than the cutoff", () => {
    const out = filterByWindow(samples, 1000, 60);
    expect(out).toBe(samples);
  });

  it("returns nothing when all samples are older than the cutoff", () => {
    const out = filterByWindow(samples, 1, 1000);
    expect(out).toEqual([]);
  });

  it("includes samples exactly at the cutoff boundary", () => {
    // window = 30, now = 60 → cutoff = 30; ts=30 should be kept.
    const out = filterByWindow(samples, 30, 60);
    expect(out.map((s) => s.ts)).toEqual([30, 40, 50, 60]);
  });
});

describe("windowMsFor", () => {
  it("returns ms for known labels", () => {
    expect(windowMsFor("60s")).toBe(60_000);
    expect(windowMsFor("10m")).toBe(600_000);
    expect(windowMsFor("All")).toBeNull();
  });
  it("falls back to 60s for unknown labels", () => {
    expect(windowMsFor("nope")).toBe(60_000);
  });
  it("WINDOWS list exposes the expected presets", () => {
    expect(WINDOWS.map((w) => w.label)).toEqual(["60s", "5m", "10m", "30m", "All"]);
  });
});

describe("applyTelemetry + resetSamples", () => {
  beforeEach(() => {
    recentSamples.set({});
  });

  it("adds a sample to the device's buffer", () => {
    applyTelemetry({ device_id: "d1", readings: { a: 1 }, quality: { a: 0 } });
    const buf = get(recentSamples)["d1"];
    expect(buf.length).toBe(1);
    expect(buf[0].readings).toEqual({ a: 1 });
    expect(typeof buf[0].ts).toBe("number");
  });

  it("appends without mutating prior state object identity", () => {
    applyTelemetry({ device_id: "d1", readings: { a: 1 }, quality: {} });
    const before = get(recentSamples)["d1"];
    applyTelemetry({ device_id: "d1", readings: { a: 2 }, quality: {} });
    const after = get(recentSamples)["d1"];
    expect(before).not.toBe(after);
    expect(after.length).toBe(2);
  });

  it("isolates buffers per device", () => {
    applyTelemetry({ device_id: "d1", readings: { a: 1 }, quality: {} });
    applyTelemetry({ device_id: "d2", readings: { b: 2 }, quality: {} });
    const all = get(recentSamples);
    expect(all["d1"].length).toBe(1);
    expect(all["d2"].length).toBe(1);
  });

  it("resetSamples(id) clears one device only", () => {
    applyTelemetry({ device_id: "d1", readings: { a: 1 }, quality: {} });
    applyTelemetry({ device_id: "d2", readings: { b: 2 }, quality: {} });
    resetSamples("d1");
    const all = get(recentSamples);
    expect(all["d1"]).toBeUndefined();
    expect(all["d2"].length).toBe(1);
  });

  it("resetSamples() with no id clears everything", () => {
    applyTelemetry({ device_id: "d1", readings: { a: 1 }, quality: {} });
    applyTelemetry({ device_id: "d2", readings: { b: 2 }, quality: {} });
    resetSamples();
    expect(get(recentSamples)).toEqual({});
  });
});

describe("chartWindow store", () => {
  it("persists the chosen window to localStorage", () => {
    chartWindow.set("10m");
    expect(localStorage.getItem("bench.chartWindow")).toBe("10m");
    chartWindow.set("All");
    expect(localStorage.getItem("bench.chartWindow")).toBe("All");
  });
});
