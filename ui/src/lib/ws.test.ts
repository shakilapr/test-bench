import { describe, it, expect } from "vitest";
import { nextDelay } from "./ws.js";

describe("nextDelay", () => {
  it("uses exponential backoff capped at 10s + jitter", () => {
    expect(nextDelay(0, () => 0)).toBe(500);
    expect(nextDelay(1, () => 0)).toBe(1000);
    expect(nextDelay(5, () => 0)).toBe(10_000);
    expect(nextDelay(20, () => 0)).toBe(10_000);
  });
  it("adds up to 1000ms of jitter", () => {
    expect(nextDelay(0, () => 0.999)).toBeGreaterThan(1000 - 1);
    expect(nextDelay(0, () => 0.999)).toBeLessThan(1500 + 1);
  });
});
