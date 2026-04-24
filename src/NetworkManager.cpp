#include "NetworkManager.h"

#include <ESPmDNS.h>

#include "Config.h"
#include "web_ui.h"

NetworkManager::NetworkManager()
    : server_(80), event_client_(), event_client_connected_(false) {}

bool NetworkManager::begin() {
  if (!WiFi.softAP(Config::kApSsid, Config::kApPassword)) {
    Serial.println("Failed to start Wi-Fi access point");
    return false;
  }

  const IPAddress ap_ip = WiFi.softAPIP();
  Serial.print("AP IP address: ");
  Serial.println(ap_ip);
  Serial.print("Open UI at: http://");
  Serial.println(ap_ip);

  if (Config::kEnableMdns) {
    if (MDNS.begin(Config::kMdnsHostname)) {
      Serial.print("mDNS ready: http://");
      Serial.print(Config::kMdnsHostname);
      Serial.println(".local");
      Serial.println("Windows may require Bonjour for .local resolution");
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

  char payload[64];
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

  char req[64] = {};
  const int reqlen = client.readBytesUntil('\n', req, sizeof(req) - 1);
  if (reqlen > 0 && req[reqlen - 1] == '\r') {
    req[reqlen - 1] = '\0';
  }
  discardHeaders(client);

  if (strncmp(req, "GET /events ", 12) == 0) {
    handleEvents(client);
    return;
  }

  if (strncmp(req, "GET / ", 6) == 0 ||
      strncmp(req, "GET /index.html ", 16) == 0) {
    handleRoot(client);
    return;
  }

  handleNotFound(client);
}

void NetworkManager::handleRoot(WiFiClient& client) {
  constexpr size_t kLen = sizeof(INDEX_HTML) - 1;
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: text/html");
  client.println("Cache-Control: no-cache");
  client.println("Connection: close");
  client.print("Content-Length: ");
  client.println(kLen);
  client.println();
  client.write(reinterpret_cast<const uint8_t*>(INDEX_HTML), kLen);
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
  // Scan byte-by-byte for \r\n\r\n (end of HTTP request headers).
  // A fixed-size buffer approach breaks when a header line length is a
  // multiple of the buffer size; byte-by-byte is safer and still fast enough.
  uint8_t prev = 0;
  uint8_t crlf = 0;
  while (client.connected()) {
    const int ch = client.read();
    if (ch < 0) break;
    if (ch == '\n' && prev == '\r') {
      if (++crlf == 2) break;  // found \r\n\r\n
    } else if (ch != '\r') {
      crlf = 0;  // non-blank content resets the counter
    }
    prev = static_cast<uint8_t>(ch);
  }
}
