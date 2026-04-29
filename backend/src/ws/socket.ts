import type { FastifyInstance } from "fastify";
import type { EventBus } from "../bus.js";

// Broadcasts pipeline events to every connected client. Clients can ignore
// topics they don't care about. Server pushes; client never sends commands here.
export async function registerWebsocket(app: FastifyInstance, bus: EventBus) {
  app.get("/ws", { websocket: true }, (socket) => {
    const send = (topic: string, payload: unknown) => {
      try {
        socket.send(JSON.stringify({ topic, payload }));
      } catch {
        /* socket closed */
      }
    };
    const offs = [
      bus.on("telemetry.broadcast", (p) => send("telemetry", p)),
      bus.on("device.updated", (p) => send("device.updated", p)),
      bus.on("command.updated", (p) => send("command.updated", p)),
    ];
    socket.on("close", () => offs.forEach((o) => o()));
    send("hello", { ts: Date.now() });
  });
}
