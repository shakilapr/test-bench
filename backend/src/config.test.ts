import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("returns defaults when env is empty", () => {
    const cfg = loadConfig({} as NodeJS.ProcessEnv);
    expect(cfg.PORT).toBe(3000);
    expect(cfg.MQTT_URL).toBe("mqtt://localhost:1883");
    expect(cfg.EMBED_BROKER).toBe(true);
    expect(cfg.EMBED_BROKER_PORT).toBe(1883);
  });
  it("coerces PORT from string", () => {
    const cfg = loadConfig({ PORT: "8080" } as unknown as NodeJS.ProcessEnv);
    expect(cfg.PORT).toBe(8080);
  });
  it("EMBED_BROKER=false disables the embedded broker", () => {
    const cfg = loadConfig({ EMBED_BROKER: "false" } as unknown as NodeJS.ProcessEnv);
    expect(cfg.EMBED_BROKER).toBe(false);
  });
  it("rejects invalid NODE_ENV", () => {
    expect(() => loadConfig({ NODE_ENV: "staging" } as unknown as NodeJS.ProcessEnv)).toThrow();
  });
});
