#include "NetworkManager.h"

#include <ESPmDNS.h>
#include <WiFi.h>

#include "Config.h"
#include "web_ui.h"

NetworkManager::NetworkManager() : server_(80), events_("/events") {}

bool NetworkManager::begin() {
  if (!WiFi.softAP(Config::kApSsid, Config::kApPassword)) {
    Serial.println("Failed to start Wi-Fi access point");
    return false;
  }

  Serial.print("AP IP address: ");
  Serial.println(WiFi.softAPIP());

  if (Config::kEnableMdns) {
    if (MDNS.begin(Config::kMdnsHostname)) {
      Serial.print("mDNS ready: http://");
      Serial.print(Config::kMdnsHostname);
      Serial.println(".local");
    } else {
      Serial.println("mDNS start failed; use the AP IP address instead");
    }
  }

  server_.on("/", HTTP_GET, [](AsyncWebServerRequest* request) {
    request->send_P(200, "text/html", INDEX_HTML);
  });

  events_.onConnect([](AsyncEventSourceClient* client) {
    client->send("connected", "status", millis(), 1000);
  });

  server_.addHandler(&events_);
  server_.begin();
  return true;
}

void NetworkManager::publishTelemetry(const TelemetrySample& sample) {
  char payload[128];
  const int written = snprintf(payload, sizeof(payload),
                               "{\"c\":%.2f,\"t\":%.2f,\"sat\":%s}",
                               sample.current_amps, sample.chip_temp_c,
                               sample.ads_saturated ? "true" : "false");
  if (written > 0) {
    events_.send(payload, "telemetry", millis());
  }
}
