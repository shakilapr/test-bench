# Wiring

Board: ESP32-S3-DevKitC-1. Schematic: https://documentation.espressif.com/esp-dev-kits/en/latest/esp32s3/esp32-s3-devkitc-1/user_guide_v1.1.html

## Connections

| ESP32-S3 pin | ADS1115 pin | Notes |
| --- | --- | --- |
| `3V3` | `VDD` | 3.3 V power |
| `GND` | `GND` | Common ground; also connect shunt reference ground here |
| `GPIO8` | `SDA` | I2C data (`Config::kI2cSdaPin`) |
| `GPIO9` | `SCL` | I2C clock (`Config::kI2cSclPin`) |
| — | `A0` | Shunt high-side sense |
| — | `A1` | Shunt low-side sense |
| — | `ADDR` → `GND` | Sets I2C address to `0x48` |

Current conversion:

```
current_amps = (measured_mV / 75 mV) × 200 A
```

## Notes

- Add a 0.1 µF decoupling cap across ADS1115 `VDD`/`GND`.
- Keep shunt sense wires short and away from high-current paths.
- Do not connect shunt signals directly to ESP32 GPIO.
- Avoid `GPIO0`, `GPIO3`, `GPIO19`, `GPIO20`, `GPIO43`–`GPIO46` for expansion (boot-strapping and USB/UART).
- Update this file when adding a new peripheral.
