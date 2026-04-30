# Wiring

Board: ESP32-S3-DevKitC-1. Schematic: https://documentation.espressif.com/esp-dev-kits/en/latest/esp32s3/esp32-s3-devkitc-1/user_guide_v1.1.html

## Connections

| ESP32-S3 pin | ADS1115 pin | Notes |
| --- | --- | --- |
| `3V3` | `VDD` | 3.3 V power |
| `GND` | `GND` | Common ground; also connect shunt reference ground here |
| `GPIO12` | `SDA` | I2C data (`Config::kI2cSdaPin`) |
| `GPIO17` | `SCL` | I2C clock (`Config::kI2cSclPin`) |
| — | `A0` | Shunt high-side sense |
| — | `A1` | Shunt low-side sense |
| — | `ADDR` (floating or → `GND`) | Both yield `0x48`. ADDR has an internal pull-down on the ADS1115 module, so a floating pin is fine. |

### Hall sensor (motor speed)

| ESP32-S3 pin | Hall sensor pin | Notes |
| --- | --- | --- |
| `GND` | Sensor / motor controller `GND` | **Mandatory common ground** — the 3.3 V pulse is meaningless without a shared reference. |
| `GPIO33` | Pulse output (level-shifted to 3.3 V) | `Config::kHallPulsePin`. Routed to the PCNT peripheral, counts rising edges only with a 1 µs hardware glitch filter. |

`GPIO33` is chosen because it is a normal IO pin (no boot-strap role like `GPIO0/2/5/12/15`), it has internal pull-up/pull-down available (unlike the input-only `GPIO34`–`GPIO39`), and it is routable to PCNT. Feed the sensor output through a level shifter or divider — the ESP32 is **not** 5 V tolerant.

Current conversion:

```
current_amps = (measured_mV / 75 mV) × 200 A
```

## Notes

- Add a 0.1 µF decoupling cap across ADS1115 `VDD`/`GND`.
- Keep shunt sense wires short and away from high-current paths.
- Do not connect shunt signals directly to ESP32 GPIO.
- Avoid `GPIO0`, `GPIO3`, `GPIO19`, `GPIO20`, `GPIO43`–`GPIO46` for expansion (boot-strapping and USB/UART).
- At boot the firmware scans the I2C bus and logs every responding address as `[i2c] device at 0xNN`. If you don't see `0x48`, recheck SDA/SCL/VDD/GND before suspecting code.
- Update this file when adding a new peripheral.
