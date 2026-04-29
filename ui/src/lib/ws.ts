import { wsConnected, refreshDevices, applyTelemetry } from "./stores.js";

// Reconnects with exponential backoff capped at 10s plus up to 1s of jitter.
export class WsClient {
  private socket: WebSocket | null = null;
  private attempt = 0;
  private timer: number | null = null;
  private closed = false;

  start() {
    this.closed = false;
    this.connect();
  }

  stop() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.socket?.close();
    this.socket = null;
  }

  private connect() {
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
    this.socket = new WebSocket(url);
    this.socket.onopen = () => {
      this.attempt = 0;
      wsConnected.set(true);
      refreshDevices();
    };
    this.socket.onclose = () => {
      wsConnected.set(false);
      if (this.closed) return;
      const delay = Math.min(500 * Math.pow(2, this.attempt), 10_000) + Math.random() * 1000;
      this.attempt += 1;
      this.timer = window.setTimeout(() => this.connect(), delay);
    };
    this.socket.onmessage = (ev) => this.dispatch(ev.data);
    this.socket.onerror = () => this.socket?.close();
  }

  private dispatch(raw: string) {
    let msg: { topic: string; payload: any };
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.topic === "telemetry") applyTelemetry(msg.payload);
    else if (msg.topic === "device.updated") refreshDevices();
    else if (msg.topic === "command.updated") {
      // Re-fetch could refresh command list. Keep small for MVP.
    }
  }
}

// Pure helper exported for unit tests.
export function nextDelay(attempt: number, rand = Math.random): number {
  return Math.min(500 * Math.pow(2, attempt), 10_000) + rand() * 1000;
}
