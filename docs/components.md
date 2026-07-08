# Test Bench Hardware Components

This document lists the hardware components required to build and deploy the ESP32-S3 Test Bench telemetry system, defined from the perspective of the ESP controller. 

For the complete pin mapping, see [Config.h](file:///c:/projects/test-bench/firmware/include/Config.h) and [wiring.md](file:///c:/projects/test-bench/docs/wiring.md).

---

## 1. Core Controller & Processor
* **ESP32-S3 Development Board** (e.g., `ESP32-S3-DevKitC-1`)
  * **Role:** The main edge processor. Collects readings from sensors, calculates motor RPM via hardware pulse counting, and publishes telemetry over Wi-Fi via MQTT.
  * **Power:** 3.3V/5V DC input.
  * **Pin Reference:**
    * `GPIO12` (SDA) & `GPIO17` (SCL) for I2C bus communications.
    * `GPIO33` for motor speed pulse input (PCNT peripheral).

## 2. Analog-to-Digital Conversion (ADC)
* **ADS1115 ADC Module** (16-bit resolution)
  * **Role:** Measures the microvolt/millivolt differential voltage across the shunt current sensor. Standard ADCs on the ESP32 lack the precision and low noise required for shunt measurements.
  * **Communication:** Connected to the I2C bus (`GPIO12`/`GPIO17`). Default address: `0x48`.
  * **Hardware Tweak:** Configure PGA gain to `GAIN_SIXTEEN` ($\pm 0.256\text{ V}$) to match the $\pm 75\text{ mV}$ full-scale range of the shunt.

## 3. High-Current Shunt Sensor
* **200A, 75mV Shunt Current Sensor**
  * **Role:** Placed in-line with the high-current path (e.g., motor or battery loop). Converts high current into a proportional millivolt drop ($1\text{ A} = 0.375\text{ mV}$).
  * **Connection:**
    * High-side sense line goes to ADS1115 `A0`.
    * Low-side sense line goes to ADS1115 `A1`.
  * **Scale:** $\text{Current (Amps)} = \frac{\text{Measured Voltage (mV)}}{75\text{ mV}} \times 200\text{ A}$.

## 4. Speed & Rotation Sensor
* **Hall-effect Sensor / Encoder** (5V Signal)
  * **Role:** Detects motor rotor speed. The 5V encoder signal operates in one of two distinct formats depending on the sensor setup:
    1. **Pulse Count (Incremental/Frequency-based):** 
       * **Behavior:** The frequency/count of pulses represents speed.
       * **ESP32 Handling:** Uses the **PCNT (Pulse Counter)** hardware peripheral on `GPIO33` to count edges asynchronously.
       * **Math:** $\text{RPM} = \frac{\text{Count}}{\text{dt} \times \text{Pulses Per Rev}} \times 60$.
    2. **Pulse ON/OFF Time (Duty Cycle/Period-based):** 
       * **Behavior:** The duration of the ON (High) and OFF (Low) times of the pulses determines the speed (pulse-width modulation or period/duty cycle measurement).
       * **ESP32 Handling:** Typically processed using the **MCPWM (Motor Control PWM)** Capture peripheral, the **RMT (Remote Control)** hardware receiver, or pin interrupts to measure exact high/low pulse widths.
  * **Connection & Safety:** 
    > [!WARNING]
    > **Do not connect the 5V encoder signal wire directly to any ESP32-S3 GPIO pin.** The ESP32-S3 operates on 3.3V logic and is **not 5V tolerant**; direct exposure to 5V will permanently destroy the GPIO pin or the entire microcontroller.
    > 
    > The 5V signal **must** be scaled down to 3.3V using a logic level shifter or a resistive voltage divider before it reaches the input pin (e.g., `GPIO33`).

## 5. Throttle Control & Interface (0 to 5V Analog)
* **Throttle Input (Reading Demand):**
  * **Role:** Reads the user's manual throttle input (an analog voltage changing from 0 to 5V).
  * **ESP32 Handling:** Because the ESP32-S3 internal ADC is limited to 3.3V, a **resistive voltage divider** (e.g., 10kΩ / 20kΩ) must scale the 0-5V signal down to 0-3.3V before reading it. Alternatively, a spare channel on the **ADS1115** can measure the voltage with proper attenuation.
* **Throttle Output (Controlling / Actuation):**
  * **Role:** Generates a 0 to 5V analog signal to command the motor controller's speed.
  * **ESP32 Handling:** The ESP32-S3 does not have a built-in DAC. To output a true 0 to 5V analog voltage:
    * Use an **external I2C DAC** (such as the `MCP4725`) powered at 5V, or
    * Generate a **3.3V PWM output** from the ESP32, feed it through a low-pass RC filter, and amplify the result using an **Operational Amplifier (Op-Amp)** with a gain of ~1.5x.

## 6. Auxiliary & Power Isolation Hardware
* **Logic Level Shifter / Voltage Divider (5V to 3.3V)**
  * **Role:** Safely interfaces the 5V encoder/Hall-effect sensor signals to the 3.3V-compliant ESP32-S3 pins.
  * **Implementation Options:**
    * **Resistive Voltage Divider (Sufficient for most encoder applications):** Yes, a simple two-resistor divider is completely sufficient, provided the resistor values are low enough to keep signal rise/fall times fast (minimizing the RC delay caused by parasitic capacitance on the ESP32 input pin).
      * **Recommended for High Bandwidth/High RPM ($1.8\text{ k}\Omega$ and $3.3\text{ k}\Omega$):**
        * **$R_1$** (between 5V signal and ESP32 GPIO) = **$1.8\text{ k}\Omega$**
        * **$R_2$** (between ESP32 GPIO and GND) = **$3.3\text{ k}\Omega$**
        * **Output voltage:** $5\text{V} \times \frac{3.3\text{ k}\Omega}{1.8\text{ k}\Omega + 3.3\text{ k}\Omega} \approx 3.24\text{ V}$
        * **Why:** Lower resistance values keep the pulse edges sharp and clean, preventing missed counts at higher speeds.
      * **Standard / Low-Power Option ($10\text{ k}\Omega$ and $20\text{ k}\Omega$):**
        * **$R_1$** (between 5V signal and ESP32 GPIO) = **$10\text{ k}\Omega$**
        * **$R_2$** (between ESP32 GPIO and GND) = **$20\text{ k}\Omega$**
        * **Output voltage:** $5\text{V} \times \frac{20\text{ k}\Omega}{10\text{ k}\Omega + 20\text{ k}\Omega} \approx 3.33\text{ V}$
        * **Why:** Uses highly common resistor values and reduces current draw to $0.16\text{ mA}$, suitable for lower frequency/RPM setups.
    * **Active Logic Level Shifter:** A breakout board (e.g., using `BSS138` transistors or `TXS0108E`/`TXB0104` ICs) powered by both 3.3V and 5V rails. This is highly recommended for high-frequency pulse counting or precise pulse width/timing measurements where signal rise/fall times are critical.
* **Decoupling Capacitor (0.1 µF)**
  * **Role:** Filter out high-frequency noise. Connect directly across the VDD and GND pins of the ADS1115 module.
* **Galvanic Isolation / Wi-Fi Setup**
  * **Role:** Bench testing uses high currents/voltages (e.g., 48V e-Trike battery loop). To protect developers' computers from back-EMF or high-voltage spikes, **do not connect USB while the motor is powered**. Utilize Wi-Fi connection for safety.
* **Common Ground Reference Wire**
  * **Role:** Connect the ESP32 GND, ADS1115 GND, and the motor controller / shunt ground reference together. An accurate voltage reading requires a shared reference point.
