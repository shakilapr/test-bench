#include "NetworkManager.h"

#include <ESPmDNS.h>
#include <pgmspace.h>

#include "Config.h"
#include "web_ui.h"

NetworkManager::NetworkManager()
    : server_(80), event_client_(), event_client_connected_(false) {}

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

  server_.begin();
  return true;
}

void NetworkManager::loop() {
  WiFiClient client = server_.available();
  if (client) {
    handleClient(client);
  }

  if (event_client_connected_ && !event_client_.connected()) {
    event_client_.stop();
    event_client_connected_ = false;
  }
}

void NetworkManager::publishTelemetry(const TelemetrySample& sample) {
  if (!event_client_connected_ || !event_client_.connected()) {
    return;
  }

  char payload[128];
  const int written = snprintf(payload, sizeof(payload),
                               "{\"c\":%.2f,\"t\":%.2f,\"sat\":%s}",
                               sample.current_amps, sample.chip_temp_c,
                               sample.ads_saturated ? "true" : "false");
  if (written > 0) {
    event_client_.print("event: telemetry\n");
    event_client_.print("data: ");
    event_client_.print(payload);
    event_client_.print("\n\n");
    event_client_.flush();
  }
}

void NetworkManager::handleClient(WiFiClient client) {
  client.setTimeout(1000);

  const String request_line = client.readStringUntil('\r');
  client.read();
  discardHeaders(client);

  if (request_line.startsWith("GET /events ")) {
    handleEvents(client);
    return;
  }

  if (request_line.startsWith("GET / ") ||
      request_line.startsWith("GET /index.html ")) {
    handleRoot(client);
    return;
  }

  handleNotFound(client);
}

void NetworkManager::handleRoot(WiFiClient& client) {
  const size_t content_length = strlen_P(INDEX_HTML);
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: text/html; charset=utf-8");
  client.println("Cache-Control: no-cache");
  client.println("Connection: close");
  client.print("Content-Length: ");
  client.println(content_length);
  client.println();
  client.write(reinterpret_cast<const uint8_t*>(INDEX_HTML), content_length);
  client.flush();
  client.stop();
}

void NetworkManager::handleEvents(WiFiClient& client) {
  if (event_client_connected_) {
    event_client_.stop();
    event_client_connected_ = false;
  }

  // HTTP headers use CRLF (println); SSE event lines use LF only.
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: text/event-stream");
  client.println("Cache-Control: no-cache");
  client.println("Connection: keep-alive");
  client.println("Access-Control-Allow-Origin: *");
  client.println();
  client.print("event: status\ndata: connected\n\n");
  client.flush();

  event_client_ = client;
  event_client_connected_ = true;
}

void NetworkManager::handleNotFound(WiFiClient& client) {
  client.println("HTTP/1.1 404 Not Found");
  client.println("Content-Type: text/plain");
  client.println("Connection: close");
  client.println();
  client.println("Not found");
  client.flush();
  client.stop();
}

void NetworkManager::discardHeaders(WiFiClient& client) {
  while (client.connected()) {
    const String line = client.readStringUntil('\n');
    if (line == "\r" || line.length() == 0) {
      break;
    }
  }
}
