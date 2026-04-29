import { describe, it, expect } from "vitest";
import { validateParams } from "./registry.js";

describe("validateParams", () => {
  it("rejects unknown command types", () => {
    const r = validateParams("unknown", {});
    expect(r.ok).toBe(false);
  });
  it("rejects non-numeric interval_ms", () => {
    const r = validateParams("set_sample_interval", { interval_ms: "200" });
    expect(r.ok).toBe(false);
  });
  it("rejects out-of-range interval_ms", () => {
    const a = validateParams("set_sample_interval", { interval_ms: 50 });
    const b = validateParams("set_sample_interval", { interval_ms: 20000 });
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
  });
  it("accepts valid interval_ms", () => {
    const r = validateParams("set_sample_interval", { interval_ms: 200 });
    expect(r.ok).toBe(true);
  });
});
