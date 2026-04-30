// Optional in-process MQTT broker for the no-Docker dev path.
// Used when EMBED_BROKER=true so a single `npm run dev` (or production
// binary) can run without Mosquitto.

import { createServer, type Server } from "node:net";
import Aedes from "aedes";

export interface EmbeddedBroker {
  stop(): Promise<void>;
}

export async function startEmbeddedBroker(port: number): Promise<EmbeddedBroker> {
  const aedes = new Aedes();
  const server: Server = createServer(
    aedes.handle as unknown as (s: import("node:net").Socket) => void
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve();
    });
  });
  console.log(`[mqtt] embedded broker listening on :${port}`);
  return {
    stop: () =>
      new Promise<void>((res) => {
        server.close(() => aedes.close(() => res()));
      }),
  };
}
