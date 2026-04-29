import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import { loadConfig } from "./config.js";
import { EventBus } from "./bus.js";
import { openDb } from "./db/sqlite.js";
import { DeviceRepo } from "./db/devices.js";
import { RecordingRepo } from "./db/recordings.js";
import { CommandRepo } from "./db/commands.js";
import { InfluxWriter } from "./influx/writer.js";
import { MqttBroker } from "./mqtt/broker.js";
import { Dispatcher } from "./commands/dispatcher.js";
import { wirePipeline } from "./pipeline.js";
import { registerRoutes } from "./api/routes.js";
import { registerWebsocket } from "./ws/socket.js";

async function main() {
  const cfg = loadConfig();
  const bus = new EventBus();
  const db = openDb(cfg.SQLITE_PATH);
  const devices = new DeviceRepo(db);
  const recordings = new RecordingRepo(db);
  const commands = new CommandRepo(db);
  const influx = new InfluxWriter({
    url: cfg.INFLUX_URL, token: cfg.INFLUX_TOKEN, org: cfg.INFLUX_ORG, bucket: cfg.INFLUX_BUCKET,
  });
  const broker = new MqttBroker(
    { url: cfg.MQTT_URL, user: cfg.MQTT_USER, pass: cfg.MQTT_PASS },
    bus
  );
  const dispatcher = new Dispatcher(broker, commands, bus);
  wirePipeline({ bus, devices, recordings, influx });
  await broker.start();

  const app = Fastify({ logger: { level: cfg.NODE_ENV === "production" ? "info" : "debug" } });
  await app.register(fastifyWebsocket);
  await registerRoutes(app, { devices, recordings, commands, dispatcher, grafanaUrl: cfg.GRAFANA_URL });
  await registerWebsocket(app, bus);

  if (cfg.NODE_ENV === "production") {
    const distPath = resolve(cfg.UI_DIST);
    if (!existsSync(resolve(distPath, "index.html"))) {
      throw new Error(`UI dist not found at ${distPath}/index.html. Run 'npm run build' in ui/ first.`);
    }
    await app.register(fastifyStatic, { root: distPath });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api") || req.url.startsWith("/ws")) {
        return reply.code(404).send({ error: "not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  const close = async () => {
    console.log("[backend] shutting down");
    await app.close();
    await broker.stop();
    await influx.close();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);

  await app.listen({ host: "0.0.0.0", port: cfg.PORT });
  console.log(`[backend] listening on :${cfg.PORT} (${cfg.NODE_ENV})`);
}

main().catch((err) => {
  console.error("[backend] fatal:", err);
  process.exit(1);
});
