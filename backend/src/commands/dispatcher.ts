import { randomUUID } from "node:crypto";
import type { Command } from "../protocol.js";
import type { MqttBroker } from "../mqtt/broker.js";
import type { CommandRepo } from "../db/commands.js";
import type { EventBus } from "../bus.js";

export interface DispatchOptions {
  deviceId: string;
  type: string;
  params?: Record<string, unknown>;
  timeoutMs?: number;
}

export class Dispatcher {
  constructor(
    private readonly broker: MqttBroker,
    private readonly repo: CommandRepo,
    private readonly bus: EventBus
  ) {
    this.bus.on("device.ack", (raw) => this.onAck(raw as { cmd_id: string; status: string; message?: string }));
  }

  async issue(opts: DispatchOptions): Promise<{ cmd_id: string }> {
    const cmd: Command = {
      v: 1,
      cmd_id: `cmd-${randomUUID()}`,
      type: opts.type,
      params: opts.params ?? {},
    };
    this.repo.insert(cmd.cmd_id, opts.deviceId, cmd.type, cmd.params!);
    await this.broker.publishCommand(opts.deviceId, cmd);
    const timeout = opts.timeoutMs ?? 5000;
    setTimeout(() => {
      const row = this.repo.get(cmd.cmd_id);
      if (row && row.status !== "completed" && row.status !== "rejected" && row.status !== "failed" && row.status !== "duplicate") {
        this.repo.updateStatus(cmd.cmd_id, "timed_out", `no terminal ack within ${timeout}ms`);
        this.bus.emit("command.updated", { cmd_id: cmd.cmd_id, status: "timed_out" });
      }
    }, timeout);
    return { cmd_id: cmd.cmd_id };
  }

  private onAck(ack: { cmd_id: string; status: string; message?: string }) {
    const existing = this.repo.get(ack.cmd_id);
    if (!existing) return;
    this.repo.updateStatus(ack.cmd_id, ack.status, ack.message ?? null);
    this.bus.emit("command.updated", { cmd_id: ack.cmd_id, status: ack.status, message: ack.message });
  }
}
