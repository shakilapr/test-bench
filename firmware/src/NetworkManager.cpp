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
  WiFi.setHostname(client_id_.c_str());
  WiFi.begin(wifi_ssid_.c_str(), wifi_pass_.c_str());

  mqtt_.setServer(mqtt_host_.c_str(), mqtt_port_);
  mqtt_.setBufferSize(1024);
  mqtt_.setKeepAlive(15);
  mqtt_.setSocketTimeout(5);
  mqtt_.setCallback(&NetworkManager::staticOnMessage);

  if (Config::kEnableMdns) MDNS.begin(Config::kMdnsHostname);
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
}

bool NetworkManager::ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  unsigned long now = millis();
  if (now < next_reconnect_ms_) return false;
  next_reconnect_ms_ = now + 2000;
  WiFi.reconnect();
  return false;
}

bool NetworkManager::ensureMqtt() {
  if (mqtt_.connected()) return true;
  if (WiFi.status() != WL_CONNECTED) return false;
  unsigned long now = millis();
  if (now < next_reconnect_ms_) return false;
  next_reconnect_ms_ = now + 2000;

  String lwt = String("{\"v\":1,\"device_id\":\"") + device_id_ + "\",\"online\":false}";

  bool ok = mqtt_.connect(client_id_.c_str(),
                          mqtt_user_.length() ? mqtt_user_.c_str() : nullptr,
                          mqtt_pass_.length() ? mqtt_pass_.c_str() : nullptr,
                          topic_status_.c_str(), 1, true, lwt.c_str());
  if (!ok) return false;

  publishOnlineStatus();
  mqtt_.subscribe(topic_cmd_.c_str(), 1);
  return true;
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
