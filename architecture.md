# ESP32 Telemetry Architecture

## Purpose

This is the single source of truth for building the ESP32-S3 telemetry system. It replaces the overlapping plan and notes documents that previously lived in `lib/`.

The system uses:

- an `ESP32-S3` as the main controller,
- an `ADS1115` over I2C for current acquisition,
- a `200 A / 75 mV` shunt as the current sensor,
- the ESP32-S3 built-in temperature sensor for chip temperature telemetry,
- a PROGMEM-hosted HTML/JS UI,
- Server-Sent Events for server-to-browser telemetry using Arduino core `WiFiServer`.

The architecture is intentionally optimized for one-way telemetry. It does not assume browser-to-device commands.

## Scope

Included:

- ESP32-S3 firmware
- ADS1115 current sensing
- ESP32 built-in temperature telemetry
- SSE telemetry stream
- embedded browser UI
- deployment and validation requirements

Not included:

- bus-voltage sensing
- file-backed web assets
- OTA update flow
- browser-to-device control APIs
- persistent logging

Voltage is intentionally out of scope until there is a defined analog path, divider network, ADC channel, and scaling rule for it.

ESP built-in temperature is in scope, but only as chip temperature. It must not be described as ambient temperature.

## Architectural Decision

The browser only needs live telemetry pushed from the ESP32. Because the current scope is one-directional, the baseline transport is:

- `SSE` instead of `WebSocket`
- `PROGMEM` instead of `LittleFS`

Reasoning:

- SSE matches one-way telemetry directly.
- Browsers reconnect `EventSource` streams automatically.
- The server code is smaller than a WebSocket implementation.
- The build avoids external async web server packages.
- Serving the UI from firmware removes filesystem mount and deployment complexity.

This decision should be revisited only if the project later needs:

- browser-to-device control,
- binary transport,
- larger UI assets that no longer fit comfortably in firmware,
- much higher-rate interactive traffic.

## Hardware Architecture

### Core components

- MCU: `ESP32-S3`
- ADC: `ADS1115`
- current sensor: `200 A / 75 mV` shunt
- chip temperature source: ESP32-S3 built-in temperature sensor
- network transport: Wi-Fi + HTTP/SSE using Arduino core `WiFiServer`

### I2C wiring assumptions

Current working assumptions:

| ESP32-S3 | ADS1115 | Purpose |
| --- | --- | --- |
| `3.3V` | `VDD` | ADC power |
| `GND` | `GND` | common ground |
| `GPIO 8` | `SDA` | I2C data |
| `GPIO 9` | `SCL` | I2C clock |

These values must be confirmed on the actual hardware.

### Current measurement path

- the shunt produces a small differential voltage,
- the ADS1115 reads that voltage on `A0-A1`,
- the firmware converts the measured millivolts into current:

```text
current_amps = (measured_mV / 75 mV) * 200 A
```

### Chip temperature path

- the ESP32-S3 built-in temperature sensor provides internal chip temperature,
- it should be used as a board-health or thermal-trend signal,
- it should not be treated as an accurate ambient temperature reading.

### Analog filtering

Current notes indicate the analog front end includes:

- `2 x 100 ohm` series resistors,
- `0.1 uF` capacitor across `A0` and `A1`,
- `0.1 uF` decoupling capacitor across ADS1115 `VDD/GND`.

This means software filtering should start minimal and be justified by measurement.

## Required Inputs To Confirm

Before implementation is treated as final, confirm:

- I2C pins are `SDA = GPIO 8` and `SCL = GPIO 9`
- ADS1115 address is `0x48`
- shunt rating is `200 A / 75 mV`
- current is measured on differential input `A0-A1`
- the RC filter described above is actually present on the board
- whether bidirectional current measurement is required
- expected maximum transient shunt voltage under real operating conditions

## Software Architecture

### Module responsibilities

`main.cpp`

- boot sequence
- serial logging
- `Wire` initialization
- manager startup
- main service loop

`include/Config.h`

- pin assignments
- ADS1115 address
- shunt constants
- selected gain and calibration values when finalized

`lib/Current_ADS1115/`

- ADS1115 init using a supplied `TwoWire` instance
- differential reads on `A0-A1`
- raw-to-current conversion
- optional calibration support

`src/SensorManager.cpp`

- own sensor lifecycle
- schedule periodic reads
- read both current and chip temperature
- provide normalized telemetry values to the network layer

`src/NetworkManager.cpp`

- start Wi-Fi
- register HTTP route for `/`
- register SSE endpoint `/events`
- publish telemetry events
- optionally register an mDNS hostname
- use built-in Arduino `WiFiServer` and `WiFiClient`, not `ESPAsyncWebServer`

`src/web_ui.h`

- embedded HTML and JavaScript
- browser `EventSource` logic
- current display
- chip temperature display
- connection state

## Build Layout

The target layout for implementation is:

```text
.
├── include/
│   └── Config.h
├── lib/
│   ├── SensorBase/
│   └── Current_ADS1115/
├── src/
│   ├── main.cpp
│   ├── NetworkManager.cpp
│   ├── SensorManager.cpp
│   └── web_ui.h
└── platformio.ini
```

Notes:

- `web_ui.h` contains the HTML and JavaScript in PROGMEM
- `data/` and LittleFS are intentionally not part of the default build

## Data Flow

```text
Shunt -> ADS1115 -> Current_ADS1115 -> SensorManager -> WiFiServer SSE stream -> Browser UI
```

Detailed flow:

1. `main.cpp` initializes `Wire` with the configured SDA/SCL pins.
2. `Current_ADS1115` initializes the ADS1115 using the shared I2C bus.
3. The sensor layer reads differential input `A0-A1`.
4. Raw ADC counts are converted into millivolts.
5. Millivolts are scaled to current in amps.
6. `SensorManager` reads the ESP32 built-in temperature sensor.
7. `NetworkManager` emits a telemetry event through `/events`.
8. The browser receives the event and updates the current and chip-temperature display.

## Startup Sequence

Recommended startup order:

1. initialize serial logging
2. initialize `Wire` with the configured SDA/SCL pins
3. initialize the ADS1115 sensor path
4. start Wi-Fi
5. optionally start mDNS
6. register `/` and `/events`
7. start the HTTP server

This ordering avoids common integration mistakes such as I2C ownership confusion and starting mDNS before the network interface exists.

## Transport Architecture

### Server-Sent Events

The transport endpoint is:

- `/events`

Recommended event names:

- `telemetry`
- `status`

Initial telemetry payload:

```json
{"c":12.34,"t":41.8}
```

Transport rules:

- text payloads only,
- include current as `c` and chip temperature as `t`,
- do not include voltage until a voltage path exists,
- malformed payloads must be ignored safely by the browser,
- reconnect handling should rely on `EventSource` behavior,
- support one connected browser stream for the first build.

Implementation rule:

- use Arduino core `WiFiServer` and `WiFiClient` for SSE,
- do not add `ESPAsyncWebServer` unless later requirements justify the extra package.

### Browser behavior

The browser client must:

- create `new EventSource("/events")`,
- listen for `telemetry`,
- parse JSON inside `try/catch`,
- validate the expected fields before DOM updates,
- show reconnecting state when the stream errors,
- render current and chip temperature separately,
- avoid assuming undefined fields such as voltage exist.

### Optional mDNS alias

The system may expose a convenience hostname such as:

- `http://bench.local`

Rules:

- start mDNS only after the Wi-Fi interface is up,
- log success or failure at boot,
- keep the numeric IP address as the primary fallback path.

Compatibility note:

- Apple platforms generally support `.local` discovery out of the box,
- Windows support is not universal and may depend on Bonjour or another mDNS resolver being installed.

## I2C Ownership Rule

`Wire.begin()` must be called once in application startup code.

Do not call it inside the ADS1115 driver. The sensor component should receive a shared `TwoWire` instance.

## ADS1115 Configuration

### Address

- expected address: `0x48`

### Gain

Recommended starting point:

- `GAIN_SIXTEEN`

Rationale:

- the shunt nominal full-scale signal is `75 mV`,
- `GAIN_SIXTEEN` gives about `±0.256 V` input range,
- that improves resolution over a much wider range.

### Gain limit

This is a hard measurement limit:

- if the differential input exceeds about `±256 mV`, the ADC saturates,
- if real operating or fault conditions can exceed that, the design must define how saturation is handled.

### Sampling

Start with a moderate sample rate such as `128 SPS` unless testing proves a different requirement.

### Conversion rule

The nominal current conversion is:

```text
current_amps = (measured_mV / 75 mV) * 200 A
```

Implementation must preserve sign if bidirectional current is required.

## ESP32 Built-In Temperature Sensor

Use the ESP32-S3 built-in temperature sensor as an additional telemetry signal for the web UI.

Rules:

- label it as chip or MCU temperature, not ambient temperature,
- sample it in the same manager path that prepares outgoing telemetry,
- keep it as a simple numeric field in degrees Celsius.

Integration requirement:

- the implementation must use the temperature-sensor API supported by the pinned ESP32 platform version,
- because Espressif has changed the temperature-sensor driver API across IDF generations, the exact API should be chosen only after the platform version is pinned.

## Build Architecture

`platformio.ini` should pin:

- the `espressif32` platform version,
- `Adafruit_ADS1X15`.

Reason:

- platform changes can alter Arduino core behavior and temperature sensor APIs.

Recommended shape:

```ini
[env:esp32-s3-devkitc-1]
platform = espressif32 @ <tested-version>
board = esp32-s3-devkitc-1
framework = arduino
monitor_speed = 115200

lib_deps =
    adafruit/Adafruit_ADS1X15 @ ^2.4.0
```

If extra libraries are introduced later, they must also be pinned.

Expected config constants:

```cpp
#pragma once

#define I2C_SDA_PIN 8
#define I2C_SCL_PIN 9

#define ADS1115_ADDRESS 0x48

#define SHUNT_MAX_AMPS 200.0f
#define SHUNT_MAX_MV 75.0f

#define TELEMETRY_INTERVAL_MS 500
```

## Deployment Model

Default deployment sequence:

1. Build firmware.
2. Upload firmware.
3. Verify boot logs.
4. Open `/` in a browser.
5. Confirm the SSE stream updates the UI.

Effects of the PROGMEM decision:

- no filesystem image build,
- no filesystem upload step,
- no LittleFS mount dependency.

Tradeoff:

- UI edits require a firmware rebuild and upload.

## Validation Requirements

### Boot

- firmware boots cleanly
- Wi-Fi starts successfully
- the UI is served from `/`
- if enabled, mDNS starts successfully and is logged

### SSE

- browser connects to `/events`
- reconnect occurs automatically after disconnect
- malformed payloads do not break future updates
- UI shows reconnecting state if the stream drops
- chip temperature field appears in the UI and updates over time

### Sensor behavior

- ADS1115 initializes on the configured pins and address
- no-load readings are plausible
- current changes correctly under load
- readings remain inside the selected ADC range
- the ESP32 built-in temperature sensor returns a live reading
- chip temperature changes plausibly as device load changes

### Accuracy

- validate against a trusted reference meter at at least three load points
- define a numeric pass threshold before sign-off, for example `±3%`
- if bidirectional current is required, verify both directions

### Optional mDNS

- if enabled, mDNS starts only after Wi-Fi is up
- boot logs clearly report whether `bench.local` registration succeeded
- IP access remains documented as fallback

## Definition of Done

The architecture is correctly implemented when:

- the ESP32 serves the UI from PROGMEM,
- the browser receives live current and chip-temperature telemetry through SSE,
- the browser recovers automatically from dropped connections,
- ADS1115 readings track real load changes,
- the ESP32 built-in temperature reading is visible in the UI as chip temperature,
- current accuracy meets the agreed numeric threshold,
- deployment is repeatable with one firmware flash.
