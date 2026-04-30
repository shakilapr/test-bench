import type { Telemetry } from "../protocol.js";

export interface IInfluxWriter {
  writeTelemetry(t: Telemetry, recordingId?: string | null): void;
  writeEvent(
    deviceId: string,
    type: string,
    fields?: Record<string, string | number>,
    recordingId?: string | null
  ): void;
  close(): Promise<void>;
}

// Used when INFLUX_DISABLED=true so the no-Docker dev path doesn't trigger
// background retry storms against an unreachable Influx URL.
export class NoopInfluxWriter implements IInfluxWriter {
  writeTelemetry(): void {}
  writeEvent(): void {}
  async close(): Promise<void> {}
}
