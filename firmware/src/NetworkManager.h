#pragma once

#include <Arduino.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiClient.h>

#include <functional>

class Provision;

class NetworkManager {
 public:
  using CommandHandler = std::function<void(const char* topic, const uint8_t* payload, size_t len)>;

  bool begin(const Provision& prov);
  void loop();
  bool connected() { return mqtt_.connected(); }
  bool online() { return WiFi.status() == WL_CONNECTED && mqtt_.connected(); }

  bool publishTelemetry(const char* json, size_t len);
  bool publishStatus(const char* json, size_t len, bool retained);
  bool publishMeta(const char* json, size_t len);
  bool publishAck(const char* json, size_t len);

  void onCommand(CommandHandler h) { handler_ = h; }
  const String& deviceId() const { return device_id_; }

 private:
  void buildTopics();
  bool ensureWifi();
  bool ensureMqtt();
  void publishOnlineStatus();
  void onConnectivityRestored();
  void maybeReboot();
  static uint32_t nextBackoff(uint32_t prev);
  static void staticOnMessage(char* topic, uint8_t* payload, unsigned int len);

  WiFiClient wifi_client_;
  PubSubClient mqtt_{wifi_client_};
  String device_id_;
  String mqtt_host_;
  uint16_t mqtt_port_ = 1883;
  String mqtt_user_;
  String mqtt_pass_;
  String wifi_ssid_;
  String wifi_pass_;
  String topic_telemetry_;
  String topic_status_;
  String topic_meta_;
  String topic_ack_;
  String topic_cmd_;
  String client_id_;

  // Independent backoff state for each layer (Wi-Fi vs MQTT). Sharing one
  // timer caused either layer to silently starve the other after an outage.
  uint32_t wifi_next_attempt_ms_ = 0;
  uint32_t wifi_backoff_ms_      = 0;
  uint32_t mqtt_next_attempt_ms_ = 0;
  uint32_t mqtt_backoff_ms_      = 0;

  // Watchdog: timestamp of last fully-online moment, used to reboot the
  // device when connectivity is dead for too long.
  uint32_t last_online_ms_ = 0;

  CommandHandler handler_;
};
