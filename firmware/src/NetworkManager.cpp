#include "NetworkManager.h"

#include <Arduino.h>
#include <ESPmDNS.h>

#include "Config.h"
#include "Provision.h"
#include "bench/Protocol.h"

namespace {
NetworkManager* g_self = nullptr;

String fallbackDeviceId() {
  uint64_t mac = ESP.getEfuseMac();
  uint8_t bytes[6];
  for (int i = 0; i < 6; ++i) {
    bytes[5 - i] = (uint8_t)((mac >> (8 * i)) & 0xff);
  }
  char suffix[7];
  snprintf(suffix, sizeof(suffix), "%02X%02X%02X", bytes[3], bytes[4], bytes[5]);
  return String("setup-") + suffix;
}

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

bool NetworkManager::beginProvisioningAp() {
  g_self = this;
  mqtt_enabled_ = false;
  device_id_ = fallbackDeviceId();
  client_id_ = String("bench-") + device_id_;
  ap_ssid_ = client_id_;
  ap_pass_ = String(Config::kSoftApPasswordDefault);

  WiFi.mode(WIFI_AP);
  WiFi.persistent(false);
  WiFi.setHostname(client_id_.c_str());
  bool ok = startSoftAp();
  if (ok) {
    Serial.printf("[net] setup AP password=%s\n", ap_pass_.c_str());
  }
  return ok;
}

bool NetworkManager::begin(const Provision& prov, const String& boot_id) {
  g_self = this;
  mqtt_enabled_ = true;
  device_id_ = prov.deviceId();
  boot_id_   = boot_id;
  wifi_ssid_ = prov.wifiSsid();
  wifi_pass_ = prov.wifiPass();
  mqtt_user_ = prov.mqttUser();
  mqtt_pass_ = prov.mqttPass();
  if (!parseMqttUrl(prov.mqttUrl(), mqtt_host_, mqtt_port_)) return false;
  client_id_ = String("bench-") + device_id_;
  ap_ssid_   = client_id_;
  ap_pass_   = prov.apPass().length() ? prov.apPass()
                                      : String(Config::kSoftApPasswordDefault);
  buildTopics();

  // Always run AP+STA: AP gives the operator a router-less fallback path,
  // STA is what we use whenever provisioned creds work. Either path can
  // reach the broker as long as the broker host is routable from the
  // interface that owns the matching subnet.
  WiFi.mode(WIFI_AP_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.setHostname(client_id_.c_str());

  startSoftAp();

  if (wifi_ssid_.length()) {
    WiFi.begin(wifi_ssid_.c_str(), wifi_pass_.c_str());
  } else {
    Serial.println("[net] no STA credentials provisioned, AP-only mode");
  }

  mqtt_.setServer(mqtt_host_.c_str(), mqtt_port_);
  mqtt_.setBufferSize(1024);
  mqtt_.setKeepAlive(15);
  mqtt_.setSocketTimeout(5);
  mqtt_.setCallback(&NetworkManager::staticOnMessage);

  if (Config::kEnableMdns) MDNS.begin(Config::kMdnsHostname);

  last_online_ms_ = millis();
  return true;
}

bool NetworkManager::startSoftAp() {
  bool ap_ok = WiFi.softAP(ap_ssid_.c_str(), ap_pass_.c_str(),
                           Config::kSoftApChannel, /*ssid_hidden=*/0,
                           Config::kSoftApMaxClients);
  if (ap_ok) {
    Serial.printf("[net] softAP up: ssid=%s ip=%s\n",
                  ap_ssid_.c_str(), WiFi.softAPIP().toString().c_str());
  } else {
    Serial.println("[net] softAP failed to start");
  }
  return ap_ok;
}

void NetworkManager::buildTopics() {
  topic_telemetry_ = "bench/" + device_id_ + "/telemetry";
  topic_status_    = "bench/" + device_id_ + "/status";
  topic_meta_      = "bench/" + device_id_ + "/meta";
  topic_ack_       = "bench/" + device_id_ + "/ack";
  topic_cmd_       = "bench/" + device_id_ + "/cmd";
}

void NetworkManager::loop() {
  if (!mqtt_enabled_) {
    delay(50);
    return;
  }
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
  // Without STA creds we run AP-only; reconnect logic is a no-op.
  if (wifi_ssid_.length() == 0) {
    wifi_backoff_ms_ = 0;
    return false;
  }
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
  // MQTT can ride on STA, on a client attached to our SoftAP, or both.
  // Skip connect attempts only when neither path could possibly work.
  bool sta_up = (WiFi.status() == WL_CONNECTED);
  bool ap_has_client = (WiFi.softAPgetStationNum() > 0);
  if (!sta_up && !ap_has_client) return false;
  uint32_t now = millis();
  if (now < mqtt_next_attempt_ms_) return false;
  mqtt_backoff_ms_ = nextBackoff(mqtt_backoff_ms_);
  mqtt_next_attempt_ms_ = now + mqtt_backoff_ms_;

  String lwt;
  {
    char buf[256];
    size_t n = bench::buildStatusJson(buf, sizeof(buf),
                                      device_id_.c_str(),
                                      boot_id_.c_str(),
                                      /*online=*/false,
                                      /*fw_version=*/nullptr,
                                      /*sample_interval_ms=*/0);
    if (n == 0) return false;
    lwt = String(buf);
  }

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
  char buf[256];
  size_t n = bench::buildStatusJson(buf, sizeof(buf),
                                    device_id_.c_str(),
                                    boot_id_.c_str(),
                                    /*online=*/true,
                                    Config::kFirmwareVersion,
                                    /*sample_interval_ms=*/0);
  if (n == 0) return;
  mqtt_.publish(topic_status_.c_str(), (const uint8_t*)buf, n, true);
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
