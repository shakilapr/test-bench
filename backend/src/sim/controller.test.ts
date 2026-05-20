import { describe, it, expect } from "vitest";
import { SimController } from "../sim/controller.js";

describe("SimController", () => {
  describe("status", () => {
    it("returns not-running for a fresh controller", () => {
      const ctrl = new SimController({ mqttUrl: "mqtt://localhost:1883" });
      const s = ctrl.status();
      expect(s.running).toBe(false);
      expect(s.pid).toBeNull();
      expect(s.started_at).toBeNull();
      expect(s.last_error).toBeNull();
    });
  });

  describe("start", () => {
    it("rejects when simulator workspace is missing", () => {
      const ctrl = new SimController({ cwd: "/nonexistent/path", mqttUrl: "mqtt://localhost:1883" });
      const r = ctrl.start();
      expect(r.ok).toBe(false);
      expect(r.error).toContain("not found");
      expect(ctrl.status().last_error).toContain("not found");
    });

    it("uses the default cwd when not provided", () => {
      const ctrl = new SimController({ mqttUrl: "mqtt://localhost:1883" });
      const s = ctrl.status();
      expect(s.running).toBe(false);
    });
  });

  describe("stop", () => {
    it("returns ok when nothing is running", () => {
      const ctrl = new SimController({ mqttUrl: "mqtt://localhost:1883" });
      const r = ctrl.stop();
      expect(r.ok).toBe(true);
    });
  });

  describe("stopAndWait", () => {
    it("resolves immediately when nothing is running", async () => {
      const ctrl = new SimController({ mqttUrl: "mqtt://localhost:1883" });
      await expect(ctrl.stopAndWait(100)).resolves.toBeUndefined();
    });
  });
});
