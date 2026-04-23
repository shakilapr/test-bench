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
    body { margin: 0; font-family: sans-serif; background: #f0f0f0; padding: 16px; }
    .shell { max-width: 700px; margin: 0 auto; background: #fff; border: 1px solid #ccc; border-radius: 8px; padding: 16px; }
    h1 { margin: 0 0 4px; font-size: 1.5rem; }
    p { margin: 0; color: #555; font-size: 0.9rem; }
    .status { margin-top: 12px; font-weight: 700; color: #900; }
    .status.ok { color: #270; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
    .card { border: 1px solid #ccc; border-radius: 6px; padding: 12px; }
    .label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: #666; }
    .value { font-size: 2rem; font-weight: 700; color: #c00; margin-top: 6px; }
    .meta { margin-top: 14px; font-size: 0.85rem; color: #555; }
  </style>
</head>
<body>
  <main class="shell">
    <h1>ESP32 Telemetry</h1>
    <p>Live current and chip temperature from the ESP32-S3.</p>
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

    events.addEventListener('open', () => setStatus('Connected', true));
    events.addEventListener('status', () => setStatus('Connected', true));

    events.addEventListener('telemetry', (e) => {
      let d;
      try { d = JSON.parse(e.data); } catch (_) { return; }
      currentEl.textContent = typeof d.c === 'number' ? d.c.toFixed(2) + ' A' : '--';
      tempEl.textContent = typeof d.t === 'number' ? d.t.toFixed(1) + ' \xb0C' : '--';
      metaEl.textContent = d.sat ? 'ADC saturation detected' : 'Streaming normally';
    });

    events.onerror = () => setStatus('Reconnecting...', false);
  </script>
</body>
</html>
)rawliteral";
