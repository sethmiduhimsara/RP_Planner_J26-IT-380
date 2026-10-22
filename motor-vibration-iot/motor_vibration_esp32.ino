/*
 * =========================================================================================
 * Project: Intelligent Swimming Pool Management System (SLIIT Research Project J26-IT-380)
 * Module: Edge-AI Pump Predictive Maintenance & Motor Vibration Anomaly Detection
 * Hardware: ESP32 MCU, ADXL345 Accelerometer, I2C 16x2 LCD, LEDs (Pins 26/27), Buzzer (Pin 25)
 * Model: Edge Impulse TinyML Classifier (model_train_inferencing.h)
 * Protocol: Real-Time HTTP POST Telemetry Stream to Central Backend (Option A)
 * =========================================================================================
 */

#include <model_train_inferencing.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <math.h>
#include <WiFi.h>
#include <HTTPClient.h>

// -----------------------------------------------------------------------------
// 1. Hardware Pin & I2C Configuration
// -----------------------------------------------------------------------------
#define ADXL345   0x53
#define BLUE_LED  26
#define RED_LED   27
#define BUZZER    25

LiquidCrystal_I2C lcd(0x27, 16, 2);

// -----------------------------------------------------------------------------
// 2. Wi-Fi & Central Backend API Configuration
// -----------------------------------------------------------------------------
// Replace with your Wi-Fi credentials (e.g., Mobile Hotspot or Lab Wi-Fi)
const char* WIFI_SSID     = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Central Backend Server URL (Make sure your PC and ESP32 are on the same Wi-Fi)
// Your PC's Wi-Fi IP address shown in backend console:
const char* SERVER_URL = "http://192.168.92.110:5000/api/motor-vibration/telemetry";

// -----------------------------------------------------------------------------
// 3. Accelerometer & Inference Variables
// -----------------------------------------------------------------------------
int16_t X_out, Y_out, Z_out;
float X_g = 0, Y_g = 0, Z_g = 0;
float total_accel = 1.0;
float true_vibration = 0;
float smoothed_vibration = 0;

float buffer[EI_CLASSIFIER_DSP_INPUT_FRAME_SIZE] = { 0 };
const float OFF_THRESHOLD = 0.03;

int fault_counter = 0;
const int FAULT_LIMIT = 15;

// Timing variables for non-blocking execution
unsigned long previousDisplay = 0;
unsigned long previousTelemetry = 0;
const unsigned long TELEMETRY_INTERVAL_MS = 500; // Stream telemetry to dashboard every 500ms
bool screenToggle = false;

// -----------------------------------------------------------------------------
// 4. Function to Stream JSON Telemetry to Backend
// -----------------------------------------------------------------------------
void sendTelemetryToServer(float vib, float smoothedVib, float x, float y, float z, 
                           String status, float conf, int faults, bool alarm) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(SERVER_URL);
    http.setTimeout(1500); // 1.5s timeout for mobile hotspot latency
    http.addHeader("Content-Type", "application/json");

    // Construct lightweight JSON payload matching backend schema
    String payload = "{";
    payload += "\"deviceId\":\"ESP32_MOTOR_01\",";
    payload += "\"vibration\":" + String(vib, 4) + ",";
    payload += "\"smoothedVibration\":" + String(smoothedVib, 4) + ",";
    payload += "\"axes\":{\"x\":" + String(x, 3) + ",\"y\":" + String(y, 3) + ",\"z\":" + String(z, 3) + "},";
    payload += "\"status\":\"" + status + "\",";
    payload += "\"confidence\":" + String(conf, 1) + ",";
    payload += "\"faultCounter\":" + String(faults) + ",";
    payload += "\"isAlarm\":" + String(alarm ? "true" : "false");
    payload += "}";

    int httpCode = http.POST(payload);
    if (httpCode == HTTP_CODE_OK || httpCode == 200) {
      Serial.println(" -> [HTTP 200] Telemetry sent to Dashboard!");
    } else {
      Serial.printf(" -> [HTTP Error %d] %s (URL: %s)\n", 
                    httpCode, http.errorToString(httpCode).c_str(), SERVER_URL);
    }
    http.end();
  } else {
    Serial.println(" -> [Wi-Fi Offline] Please check Hotspot connection");
  }
}

// -----------------------------------------------------------------------------
// 5. Setup Function
// -----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);

  pinMode(BLUE_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  digitalWrite(BLUE_LED, LOW);
  digitalWrite(RED_LED, LOW);
  digitalWrite(BUZZER, LOW);

  // Initialize ADXL345 in Measurement Mode
  Wire.beginTransmission(ADXL345);
  Wire.write(0x2D); 
  Wire.write(0x08); 
  Wire.endTransmission();

  // Initialize LCD
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Edge-AI PdM");
  lcd.setCursor(0, 1);
  lcd.print("Connecting WiFi");

  // Scan for visible 2.4 GHz Wi-Fi networks
  Serial.println("\n[Wi-Fi] Scanning visible 2.4 GHz networks around ESP32...");
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);
  int n = WiFi.scanNetworks();
  if (n == 0) {
    Serial.println("  -> No Wi-Fi networks found!");
  } else {
    Serial.printf("  -> Found %d networks:\n", n);
    for (int i = 0; i < n; ++i) {
      Serial.printf("     [%d] \"%s\" (Signal: %d dBm, Channel: %d)\n", 
                    i + 1, WiFi.SSID(i).c_str(), WiFi.RSSI(i), WiFi.channel(i));
    }
  }

  // Connect to Local Wi-Fi Network
  Serial.print("\nConnecting to Target Wi-Fi: \"");
  Serial.print(WIFI_SSID);
  Serial.println("\"");
  
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  // Allow up to 20 seconds (40 x 500ms) for mobile hotspot DHCP negotiation
  int wifiAttempts = 0;
  while (WiFi.status() != WL_CONNECTED && wifiAttempts < 40) {
    delay(500);
    Serial.print(".");
    wifiAttempts++;
  }

  lcd.clear();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[Wi-Fi] Connected successfully!");
    Serial.print("[Wi-Fi] ESP32 IP Address: ");
    Serial.println(WiFi.localIP());
    lcd.setCursor(0, 0);
    lcd.print("WiFi Connected!");
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP().toString().substring(0, 16));
  } else {
    Serial.println("\n[Wi-Fi] Connection Failed!");
    Serial.printf("[Wi-Fi] Status Code: %d (1=No SSID, 4=Connect Failed, 6=Disconnected)\n", WiFi.status());
    Serial.println("[Tip] Ensure your mobile hotspot is set to 2.4 GHz Band (ESP32 does NOT support 5 GHz) and WPA2-Personal security.");
    lcd.setCursor(0, 0);
    lcd.print("WiFi: Offline");
    lcd.setCursor(0, 1);
    lcd.print("Local Eval Only");
  }

  delay(1500);
  lcd.clear();
}

// -----------------------------------------------------------------------------
// 6. Main Loop
// -----------------------------------------------------------------------------
void loop() {
  unsigned long now = millis();

  // Shift buffer window
  for (int i = 0; i < EI_CLASSIFIER_DSP_INPUT_FRAME_SIZE - 1; i++) {
    buffer[i] = buffer[i + 1];
  }

  unsigned long start_time = millis();

  // Read ADXL345 Accelerometer Raw Values
  Wire.beginTransmission(ADXL345);
  Wire.write(0x32);
  Wire.endTransmission(false);
  
  if (Wire.requestFrom(ADXL345, 6, true) == 6) {
    X_out = (int16_t)(Wire.read() | (Wire.read() << 8));
    Y_out = (int16_t)(Wire.read() | (Wire.read() << 8));
    Z_out = (int16_t)(Wire.read() | (Wire.read() << 8));

    X_g = X_out / 256.0;
    Y_g = Y_out / 256.0;
    Z_g = Z_out / 256.0;

    total_accel = sqrt(X_g * X_g + Y_g * Y_g + Z_g * Z_g);
    true_vibration = fabs(total_accel - 1.0);
    smoothed_vibration = (smoothed_vibration * 0.7) + (true_vibration * 0.3);
  }

  buffer[EI_CLASSIFIER_DSP_INPUT_FRAME_SIZE - 1] = true_vibration;

  // Maintain inference sampling rate timing
  unsigned long elapsed = millis() - start_time;
  if (elapsed < EI_CLASSIFIER_INTERVAL_MS) {
    delay(EI_CLASSIFIER_INTERVAL_MS - elapsed);
  }

  String final_status = "";
  float ai_confidence = 0.0;

  // Check if motor is completely powered OFF
  if (smoothed_vibration < OFF_THRESHOLD) {
    final_status = "OFF";
    ai_confidence = 100.0; 
  } 
  else {
    // Run Edge Impulse TinyML Classifier Inference
    signal_t signal;
    int err = numpy::signal_from_buffer(buffer, EI_CLASSIFIER_DSP_INPUT_FRAME_SIZE, &signal);
    if (err == 0) {
      ei_impulse_result_t result = { 0 };
      err = run_classifier(&signal, &result, false);
      if (err == EI_IMPULSE_OK) {
        int max_idx = 0;
        float max_val = result.classification[0].value;
        for (uint16_t i = 1; i < EI_CLASSIFIER_LABEL_COUNT; i++) {
          if (result.classification[i].value > max_val) {
            max_val = result.classification[i].value;
            max_idx = i;
          }
        }
        final_status = String(result.classification[max_idx].label);
        ai_confidence = max_val * 100;
      }
    }
  }

  // Serial Monitor Output
  Serial.print("Vib (Raw): ");
  Serial.print(true_vibration, 4);
  Serial.print("\t| Status: ");
  Serial.print(final_status);
  Serial.print("\t| Conf: ");
  Serial.print(ai_confidence, 1);
  Serial.println("%");

  // Fault Counter & Alarm Escalation Logic
  bool is_fault = (final_status == "Abnormal" || final_status == "ABNORMAL" || 
                   final_status == "Angle_Changed" || final_status == "ANGLE_CHANGED");

  if (is_fault && ai_confidence > 75.0) {
    if (fault_counter < FAULT_LIMIT) fault_counter++;
  } else if (final_status == "Normal" || final_status == "NORMAL") {
    fault_counter = 0;
  } else if (final_status == "OFF") {
    fault_counter = 0;
  }

  bool is_alarm_active = (fault_counter >= FAULT_LIMIT);

  // Hardware Actuation: LEDs & Audible Buzzer
  if (is_alarm_active) {
    digitalWrite(RED_LED, HIGH);
    digitalWrite(BLUE_LED, LOW);
    tone(BUZZER, 2000); 
  } 
  else if (final_status == "Normal" || final_status == "NORMAL") {
    digitalWrite(RED_LED, LOW);
    digitalWrite(BLUE_LED, HIGH);
    noTone(BUZZER);
  } 
  else { 
    digitalWrite(RED_LED, LOW);
    digitalWrite(BLUE_LED, LOW);
    noTone(BUZZER);
  }

  // ---------------------------------------------------------------------------
  // Non-Blocking Real-Time Telemetry Stream to Central Dashboard (Every 500ms)
  // ---------------------------------------------------------------------------
  if (now - previousTelemetry >= TELEMETRY_INTERVAL_MS) {
    previousTelemetry = now;
    sendTelemetryToServer(true_vibration, smoothed_vibration, X_g, Y_g, Z_g, 
                          final_status, ai_confidence, fault_counter, is_alarm_active);
  }

  // ---------------------------------------------------------------------------
  // I2C 16x2 LCD Display Refresh (Every 600ms)
  // ---------------------------------------------------------------------------
  if (now - previousDisplay >= 600) {
    previousDisplay = now;
    lcd.clear();
    if (screenToggle) {
      lcd.setCursor(0, 0);
      lcd.print("Vib: ");
      lcd.print(true_vibration, 3);
      lcd.print("g");
      lcd.setCursor(0, 1);
      lcd.print("Sts:");
      
      if (is_alarm_active) {
        if (final_status == "Abnormal" || final_status == "ABNORMAL") lcd.print("FAULT");
        else if (final_status == "Angle_Changed" || final_status == "ANGLE_CHANGED") lcd.print("TILTED");
      }
      else if (final_status == "OFF") lcd.print("STOPPED");
      else lcd.print("OK");
      
    } else {
      lcd.setCursor(0, 0);
      lcd.print("AI: ");
      if (final_status.length() > 12) lcd.print(final_status.substring(0, 12));
      else lcd.print(final_status);
      lcd.setCursor(0, 1);
      lcd.print("Conf: ");
      lcd.print(ai_confidence, 1);
      lcd.print("%");
    }
    screenToggle = !screenToggle; 
  }
}
