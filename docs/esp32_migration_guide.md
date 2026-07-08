# Migration Guide: ESP32-S3 to Standard ESP32

This document outlines the necessary changes to migrate the Test Bench telemetry firmware from an **ESP32-S3** board to a classic **ESP32** board (e.g., ESP32 DevKit V1). 

Because the firmware is written defensively and leverages hardware-agnostic ESP-IDF drivers where possible, the codebase requires very few modifications. In total, **only 5 lines of code** need to be changed.

## Required Changes

### 1. PlatformIO Environment (3 lines)
You need to update the build environment target in `platformio.ini` so the compiler knows it is targeting the older Xtensa LX6 architecture of the classic ESP32 instead of the LX7 on the ESP32-S3.

Open [platformio.ini](file:///c:/projects/test-bench/firmware/platformio.ini) and make the following replacements:

```diff
-default_envs = esp32-s3-devkitc-1
+default_envs = esp32dev

-[env:esp32-s3-devkitc-1]
+[env:esp32dev]
 platform = espressif32 @ 6.7.0
-board = esp32-s3-devkitc-1
+board = esp32dev
```

### 2. I2C Pin Reassignment (2 lines)
The ESP32-S3 currently uses `GPIO12` for I2C SDA. 

> [!CAUTION]
> On the classic ESP32, **`GPIO12` is a strapping pin (MTDI)** used during the boot process to determine the internal flash voltage (1.8V vs 3.3V). Since I2C lines require pull-up resistors, connecting the ADS1115 to `GPIO12` will pull it high at boot. This will force the ESP32 into 1.8V flash mode, causing it to crash and fail to boot.

You must move the I2C bus to the standard safe ESP32 pins: `GPIO21` and `GPIO22`.

Open [Config.h](file:///c:/projects/test-bench/firmware/include/Config.h) and update the pin definitions:

```diff
-constexpr uint8_t kI2cSdaPin = 12;
-constexpr uint8_t kI2cSclPin = 17;
+constexpr uint8_t kI2cSdaPin = 21;
+constexpr uint8_t kI2cSclPin = 22;
```

---

## What Does NOT Need to Change (0 lines)

### Pulse Counter (PCNT) / Encoder Pin
The motor encoder uses `GPIO33`. This pin is an excellent choice for both ESP32-S3 and classic ESP32. It supports internal pull-ups and is not a strapping pin. The ESP-IDF PCNT driver used in [PulseCounter.cpp](file:///c:/projects/test-bench/firmware/src/PulseCounter.cpp) is compatible across both chips.

### Chip Temperature Sensor
The ESP32-S3 has an internal temperature sensor, whereas the classic ESP32's temperature sensor is notoriously inaccurate and deprecated in some ESP-IDF versions. 

No code changes are needed in [SensorManager.cpp](file:///c:/projects/test-bench/firmware/src/SensorManager.cpp) because the codebase uses dynamic preprocessor checks (`#if __has_include(<driver/temperature_sensor.h>)`). If the classic ESP32 environment does not provide the temperature API, the firmware gracefully falls back, disables the temperature reading, and publishes `NaN` without breaking the build or the telemetry pipeline.

## Summary

* **Total Files Modified:** 2
* **Total Lines Changed:** 5 lines
* **Physical Hardware Changes:** You must move the ADS1115 `SDA` wire to `GPIO21` and the `SCL` wire to `GPIO22`.
