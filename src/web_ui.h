#pragma once

#include <pgmspace.h>

const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ESP32 Telemetry</title>
  <style>
    :root {
      --bg: #f4efe6;
      --panel: #fffaf0;
      --text: #1d1b19;
      --accent: #c4512d;
      --ok: #2a7f3f;
      --warn: #9a2f2f;
      --border: #d8c7aa;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      background: radial-gradient(circle at top, #fffaf2 0%, var(--bg) 60%);
      color: var(--text);
      min-height: 100vh;
      padding: 24px;
    }
    .shell {
      max-width: 760px;
      margin: 0 auto;
      background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(255,248,235,0.96));
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 24px;
      box-shadow: 0 18px 60px rgba(70, 47, 22, 0.15);
    }
    h1 {
      margin: 0 0 8px;
      font-size: clamp(2rem, 4vw, 3rem);
      letter-spacing: 0.03em;
    }
    p {
      margin: 0;
      color: #5b5146;
    }
    .status {
      margin-top: 18px;
      font-weight: 700;
      color: var(--warn);
    }
    .status.ok { color: var(--ok); }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-top: 24px;
    }
    .card {
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 18px;
      background: rgba(255,255,255,0.7);
    }
    .label {
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #7e6f5c;
    }
    .value {
      margin-top: 10px;
      font-size: clamp(2rem, 6vw, 3rem);
      font-weight: 700;
      color: var(--accent);
    }
    .meta {
      margin-top: 24px;
      font-size: 0.95rem;
      color: #5b5146;
    }
  </style>
</head>
<body>
  <main class="shell">
    <h1>ESP32 Telemetry Bench</h1>
    <p>Live current telemetry and on-chip temperature from the ESP32-S3.</p>
    <div id="status" class="status">Connecting...</div>
    <section class="grid">
      <article class="card">
        <div class="label">Current</div>
        <div id="current" class="value">--</div>
      </article>
      <article class="card">
        <div class="label">Chip Temperature</div>
        <div id="temp" class="value">--</div>
      </article>
    </section>
    <div id="meta" class="meta">Waiting for telemetry...</div>
  </main>
  <script>
    const statusEl = document.getElementById('status');
    const currentEl = document.getElementById('current');
    const tempEl = document.getElementById('temp');
    const metaEl = document.getElementById('meta');

    function setStatus(text, ok) {
      statusEl.textContent = text;
      statusEl.className = ok ? 'status ok' : 'status';
    }

    const events = new EventSource('/events');

    events.addEventListener('open', () => {
      setStatus('Connected', true);
    });

    events.addEventListener('status', () => {
      setStatus('Connected', true);
    });

    events.addEventListener('telemetry', (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (_) {
        return;
      }

      currentEl.textContent = typeof data.c === 'number' ? `${data.c.toFixed(2)} A` : '--';
      tempEl.textContent = typeof data.t === 'number' ? `${data.t.toFixed(1)} °C` : '--';
      metaEl.textContent = data.sat ? 'ADC saturation detected' : 'Telemetry streaming normally';
    });

    events.onerror = () => {
      setStatus('Reconnecting...', false);
    };
  </script>
</body>
</html>
)rawliteral";
