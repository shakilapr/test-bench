import { describe, it, expect, vi } from "vitest";
import { EventBus } from "./bus.js";

describe("EventBus", () => {
  it("delivers payloads to subscribers", () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.on("x", fn);
    bus.emit("x", 42);
    expect(fn).toHaveBeenCalledWith(42);
  });
  it("unsubscribes via the returned disposer", () => {
    const bus = new EventBus();
    const fn = vi.fn();
    const off = bus.on("x", fn);
    off();
    bus.emit("x", 1);
    expect(fn).not.toHaveBeenCalled();
  });
  it("isolates errors thrown by listeners", () => {
    const bus = new EventBus();
    const ok = vi.fn();
    bus.on("x", () => { throw new Error("boom"); });
    bus.on("x", ok);
    bus.emit("x", 1);
    expect(ok).toHaveBeenCalled();
  });
});
