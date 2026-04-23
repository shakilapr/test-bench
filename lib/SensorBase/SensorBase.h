#pragma once

class SensorBase {
 public:
  virtual ~SensorBase() = default;
  virtual bool begin() = 0;
  virtual bool update() = 0;
};
