import { describe, it, expect, vi, afterEach } from "vitest";

const mockChild = {
  stdout: { on: vi.fn() },
  stderr: { on: vi.fn() },
  on: vi.fn(),
  once: vi.fn(),
  exitCode: null as number | null,
  pid: 12345,
  kill: vi.fn(),
};
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => mockChild),
}));

import { SimController } from "../sim/controller.js";

describe("SimController", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

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

    it("finds the workspace with the default cwd and spawns the sim", () => {
      const ctrl = new SimController({ mqttUrl: "mqtt://localhost:1883" });
      const r = ctrl.start();
      expect(r.ok).toBe(true);
      const s = ctrl.status();
      expect(s.running).toBe(true);
      expect(s.pid).toBe(12345);
      expect(s.started_at).not.toBeNull();
      expect(s.last_error).toBeNull();
    });
  });

  describe("stop", () => {
    it("returns ok when nothing is running", () => {
      const ctrl = new SimController({ mqttUrl: "mqtt://localhost:1883" });
      const r = ctrl.stop();
      expect(r.ok).toBe(true);
    });

    it("sends SIGTERM to a running child", () => {
      const ctrl = new SimController({ mqttUrl: "mqtt://localhost:1883" });
      ctrl.start();
      const r = ctrl.stop();
      expect(r.ok).toBe(true);
      expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");
    });
  });

  describe("stopAndWait", () => {
    it("resolves immediately when nothing is running", async () => {
      const ctrl = new SimController({ mqttUrl: "mqtt://localhost:1883" });
      await expect(ctrl.stopAndWait(100)).resolves.toBeUndefined();
    });
  });
});
