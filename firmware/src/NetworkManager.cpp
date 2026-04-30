#include "NetworkManager.h"

#include <Arduino.h>
#include <ESPmDNS.h>

#include "Config.h"
#include "Provision.h"

namespace {
NetworkManager* g_self = nullptr;

bool parseMqttUrl(const String& url, String& host_out, uint16_t& port_out) {
  String s = url;
  int scheme = s.indexOf("://");
  if (scheme >= 0) s = s.substring(scheme + 3);
  int colon = s.indexOf(':');
  if (colon < 0) {
    host_out = s; port_out = 1883; return host_out.length() > 0;
  }
  host_out = s.substring(0, colon);
  port_out = (uint16_t)s.substring(colon + 1).toInt();
  if (port_out == 0) port_out = 1883;
  return host_out.length() > 0;
}
}

bool NetworkManager::begin(const Provision& prov) {
  g_self = this;
  device_id_ = prov.deviceId();
  wifi_ssid_ = prov.wifiSsid();
  wifi_pass_ = prov.wifiPass();
  mqtt_user_ = prov.mqttUser();
  mqtt_pass_ = prov.mqttPass();
  if (!parseMqttUrl(prov.mqttUrl(), mqtt_host_, mqtt_port_)) return false;
  client_id_ = String("bench-") + device_id_;
  buildTopics();

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.setHostname(client_id_.c_str());
  WiFi.begin(wifi_ssid_.c_str(), wifi_pass_.c_str());

  mqtt_.setServer(mqtt_host_.c_str(), mqtt_port_);
  mqtt_.setBufferSize(1024);
  mqtt_.setKeepAlive(15);
  mqtt_.setSocketTimeout(5);
  mqtt_.setCallback(&NetworkManager::staticOnMessage);

  if (Config::kEnableMdns) MDNS.begin(Config::kMdnsHostname);

  last_online_ms_ = millis();
  return true;
}

void NetworkManager::buildTopics() {
  topic_telemetry_ = "bench/" + device_id_ + "/telemetry";
  topic_status_    = "bench/" + device_id_ + "/status";
  topic_meta_      = "bench/" + device_id_ + "/meta";
  topic_ack_       = "bench/" + device_id_ + "/ack";
  topic_cmd_       = "bench/" + device_id_ + "/cmd";
}

void NetworkManager::loop() {
  ensureWifi();
  ensureMqtt();
  if (mqtt_.connected()) mqtt_.loop();
  if (online()) {
    last_online_ms_ = millis();
  } else {
    maybeReboot();
  }
}

uint32_t NetworkManager::nextBackoff(uint32_t prev) {
  uint32_t base = prev == 0 ? Config::kReconnectInitialDelayMs : prev * 2;
  if (base > Config::kReconnectMaxDelayMs) base = Config::kReconnectMaxDelayMs;
  return base + (uint32_t)random(0, Config::kReconnectJitterMs + 1);
}

bool NetworkManager::ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    wifi_backoff_ms_ = 0;
    return true;
  }
  uint32_t now = millis();
  if (now < wifi_next_attempt_ms_) return false;
  wifi_backoff_ms_ = nextBackoff(wifi_backoff_ms_);
  wifi_next_attempt_ms_ = now + wifi_backoff_ms_;
  Serial.printf("[net] wifi reconnecting (next attempt in %ums)\n", wifi_backoff_ms_);
  WiFi.disconnect(true, false);
  WiFi.begin(wifi_ssid_.c_str(), wifi_pass_.c_str());
  return false;
}

bool NetworkManager::ensureMqtt() {
  if (mqtt_.connected()) {
    mqtt_backoff_ms_ = 0;
    return true;
  }
  if (WiFi.status() != WL_CONNECTED) return false;
  uint32_t now = millis();
  if (now < mqtt_next_attempt_ms_) return false;
  mqtt_backoff_ms_ = nextBackoff(mqtt_backoff_ms_);
  mqtt_next_attempt_ms_ = now + mqtt_backoff_ms_;

  String lwt = String("{\"v\":1,\"device_id\":\"") + device_id_ + "\",\"online\":false}";

  bool ok = mqtt_.connect(client_id_.c_str(),
                          mqtt_user_.length() ? mqtt_user_.c_str() : nullptr,
                          mqtt_pass_.length() ? mqtt_pass_.c_str() : nullptr,
                          topic_status_.c_str(), 1, true, lwt.c_str());
  if (!ok) {
    Serial.printf("[net] mqtt connect rc=%d (next attempt in %ums)\n",
                  mqtt_.state(), mqtt_backoff_ms_);
    return false;
  }

  onConnectivityRestored();
  return true;
}

void NetworkManager::onConnectivityRestored() {
  Serial.println("[net] mqtt connected");
  publishOnlineStatus();
  mqtt_.subscribe(topic_cmd_.c_str(), 1);
}

void NetworkManager::maybeReboot() {
  uint32_t now = millis();
  if (now - last_online_ms_ < Config::kConnectivityRebootMs) return;
  Serial.println("[net] connectivity dead for too long, rebooting");
  delay(50);
  ESP.restart();
}

void NetworkManager::publishOnlineStatus() {
  String s = String("{\"v\":1,\"device_id\":\"") + device_id_ + "\",\"online\":true}";
  mqtt_.publish(topic_status_.c_str(), (const uint8_t*)s.c_str(), s.length(), true);
}

bool NetworkManager::publishTelemetry(const char* json, size_t len) {
  if (!mqtt_.connected()) return false;
  return mqtt_.publish(topic_telemetry_.c_str(), (const uint8_t*)json, len, false);
}
bool NetworkManager::publishStatus(const char* json, size_t len, bool retained) {
  if (!mqtt_.connected()) return false;
  return mqtt_.publish(topic_status_.c_str(), (const uint8_t*)json, len, retained);
}
bool NetworkManager::publishMeta(const char* json, size_t len) {
  if (!mqtt_.connected()) return false;
  return mqtt_.publish(topic_meta_.c_str(), (const uint8_t*)json, len, true);
}
bool NetworkManager::publishAck(const char* json, size_t len) {
  if (!mqtt_.connected()) return false;
  return mqtt_.publish(topic_ack_.c_str(), (const uint8_t*)json, len, false);
}

void NetworkManager::staticOnMessage(char* topic, uint8_t* payload, unsigned int len) {
  if (!g_self || !g_self->handler_) return;
  g_self->handler_(topic, payload, len);
}
