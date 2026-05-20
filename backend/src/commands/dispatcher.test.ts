import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Dispatcher } from "./dispatcher.js";
import type { MqttBroker } from "../mqtt/broker.js";
import type { CommandRepo } from "../db/commands.js";
import { EventBus } from "../bus.js";

function mockBroker(): MqttBroker {
  return { publishCommand: vi.fn().mockResolvedValue(undefined) } as unknown as MqttBroker;
}

function mockRepo(): CommandRepo {
  const store = new Map<string, any>();
  return {
    insert: vi.fn((cmdId: string, deviceId: string, type: string, params: Record<string, unknown>) => {
      const row = {
        cmd_id: cmdId, device_id: deviceId, type, params_json: JSON.stringify(params),
        status: "issued", message: null, issued_at: Date.now(), updated_at: Date.now(),
      };
      store.set(cmdId, row);
      return row;
    }),
    get: vi.fn((cmdId: string) => store.get(cmdId)),
    updateStatus: vi.fn((cmdId: string, status: string, message: string | null) => {
      const r = store.get(cmdId);
      if (r) { r.status = status; r.message = message; r.updated_at = Date.now(); }
    }),
  } as unknown as CommandRepo;
}

describe("Dispatcher", () => {
  let bus: EventBus;
  let broker: MqttBroker;
  let repo: CommandRepo;
  let dispatcher: Dispatcher;

  beforeEach(() => {
    vi.useFakeTimers();
    bus = new EventBus();
    broker = mockBroker();
    repo = mockRepo();
    dispatcher = new Dispatcher(broker, repo, bus);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("issue", () => {
    it("inserts a command row with status issued", async () => {
      const r = await dispatcher.issue({ deviceId: "d1", type: "set_sample_interval", params: { interval_ms: 500 } });
      expect(r.cmd_id).toMatch(/^cmd-/);
      const row = (repo as any).get(r.cmd_id);
      expect(row.status).toBe("issued");
      expect(row.type).toBe("set_sample_interval");
    });

    it("publishes the command via the broker", async () => {
      const r = await dispatcher.issue({ deviceId: "d1", type: "set_sample_interval", params: { interval_ms: 200 } });
      expect(broker.publishCommand).toHaveBeenCalledWith("d1", expect.objectContaining({
        v: 1, cmd_id: r.cmd_id, type: "set_sample_interval", params: { interval_ms: 200 },
      }));
    });

    it("uses default params {} when none provided", async () => {
      const r = await dispatcher.issue({ deviceId: "d1", type: "set_sample_interval" });
      expect(broker.publishCommand).toHaveBeenCalledWith("d1", expect.objectContaining({
        params: {},
      }));
    });

    it("times out after default 5000ms", async () => {
      const updated = vi.fn();
      bus.on("command.updated", updated);
      const r = await dispatcher.issue({ deviceId: "d1", type: "set_sample_interval" });
      vi.advanceTimersByTime(4999);
      expect(updated).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(repo.updateStatus).toHaveBeenCalledWith(r.cmd_id, "timed_out", expect.stringContaining("5000"));
      expect(updated).toHaveBeenCalledWith({ cmd_id: r.cmd_id, status: "timed_out" });
    });

    it("respects custom timeoutMs", async () => {
      const updated = vi.fn();
      bus.on("command.updated", updated);
      const r = await dispatcher.issue({ deviceId: "d1", type: "set_sample_interval", timeoutMs: 1000 });
      vi.advanceTimersByTime(999);
      expect(updated).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(repo.updateStatus).toHaveBeenCalledWith(r.cmd_id, "timed_out", expect.stringContaining("1000"));
    });

    it("does not time out a completed command", async () => {
      const r = await dispatcher.issue({ deviceId: "d1", type: "set_sample_interval" });
      (repo as any).get(r.cmd_id).status = "completed";
      vi.advanceTimersByTime(5000);
      expect(repo.updateStatus).not.toHaveBeenCalledWith(r.cmd_id, "timed_out", expect.anything());
    });

    it("does not time out a rejected command", async () => {
      const r = await dispatcher.issue({ deviceId: "d1", type: "set_sample_interval" });
      (repo as any).get(r.cmd_id).status = "rejected";
      vi.advanceTimersByTime(5000);
      expect(repo.updateStatus).not.toHaveBeenCalledWith(r.cmd_id, "timed_out", expect.anything());
    });

    it("does not time out a duplicate command", async () => {
      const r = await dispatcher.issue({ deviceId: "d1", type: "set_sample_interval" });
      (repo as any).get(r.cmd_id).status = "duplicate";
      vi.advanceTimersByTime(5000);
      expect(repo.updateStatus).not.toHaveBeenCalledWith(r.cmd_id, "timed_out", expect.anything());
    });

    it("does not time out a failed command", async () => {
      const r = await dispatcher.issue({ deviceId: "d1", type: "set_sample_interval" });
      (repo as any).get(r.cmd_id).status = "failed";
      vi.advanceTimersByTime(5000);
      expect(repo.updateStatus).not.toHaveBeenCalledWith(r.cmd_id, "timed_out", expect.anything());
    });
  });

  describe("onAck", () => {
    it("updates status and emits command.updated", () => {
      const updated = vi.fn();
      bus.on("command.updated", updated);
      const row = (repo as any).insert("cmd-123", "d1", "x", {});
      bus.emit("device.ack", { cmd_id: "cmd-123", status: "completed", message: "all good" });
      expect(row.status).toBe("completed");
      expect(row.message).toBe("all good");
      expect(updated).toHaveBeenCalledWith({ cmd_id: "cmd-123", status: "completed", message: "all good" });
    });

    it("ignores acks for unknown cmd_ids", () => {
      bus.emit("device.ack", { cmd_id: "nonexistent", status: "completed" });
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });

    it("handles ack with no message", () => {
      const updated = vi.fn();
      bus.on("command.updated", updated);
      (repo as any).insert("cmd-456", "d1", "x", {});
      bus.emit("device.ack", { cmd_id: "cmd-456", status: "rejected" });
      const row = (repo as any).get("cmd-456");
      expect(row.status).toBe("rejected");
      expect(row.message).toBeNull();
      expect(updated).toHaveBeenCalledWith({ cmd_id: "cmd-456", status: "rejected", message: undefined });
    });
  });
});
