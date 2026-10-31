#include <WiFi.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include "secrets.h"   // WIFI_SSID, WIFI_PASSWORD, OTA_PASSWORD: only on the server (secrets.example.h)
#include "version.h"   // FW_VERSION: written by scripts/esp-ota.sh before every build

const char* ssid = WIFI_SSID;
const char* password = WIFI_PASSWORD;
// The laser service of the stock frontend (core/ in Stock-management-frontend)
// receives the packets directly, no PC in between. Every packet goes to all of
// these, so the tempserver and htl-server can both listen during the move.
const char* serverIPs[] = { "10.72.3.68", "10.72.1.246" };  // tempserver, htl-server
const int serverCount = sizeof(serverIPs) / sizeof(serverIPs[0]);
const int serverPort = 5005;
const char* otaPassword = OTA_PASSWORD;

const int sensorPin = 34;
bool lastLaserState = false;
bool lastStableState = false;
WiFiUDP udp;

const unsigned long offDelay = 1000;    // ON→OFF: low for 1 s first (short travel gaps stay one block)
const unsigned long debounceDelay = 3;  // OFF→ON: high for 3 ms

// The ESP is the clock: laser-on ms since boot, sent every second and on every
// change. The server adds the difference, so a lost packet costs nothing.
uint32_t bootId;
uint64_t onMsTotal = 0;      // finished blocks
unsigned long onStart = 0;   // start of the running block
unsigned long lastStatusTime = 0;
const unsigned long statusInterval = 1000;

// Heartbeat tracking
unsigned long lastHeartbeatTime = 0;
unsigned long lastAckTime = 0;
unsigned long lastDebounceTime = 0;
const unsigned long heartbeatInterval = 10000; // 10 sec
const unsigned long ackTimeout = 30000; // 30 sec
int missedAcks = 0;
const int maxMissedAcks = 3; // Reboot Wi-Fi after 3 missed ACKs

void setup() {
  Serial.begin(115200);
  pinMode(sensorPin, INPUT);
  bootId = esp_random();  // tells the server the counter restarted at 0
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(500);

  ArduinoOTA.setPassword(otaPassword); // Set the OTA password
  // Initialize OTA
  ArduinoOTA
    .onStart([]() {
      String type;
      if (ArduinoOTA.getCommand() == U_FLASH)
        type = "sketch";
      else // U_SPIFFS
        type = "filesystem";

      // NOTE: if updating SPIFFS this would be the place to unmount SPIFFS using SPIFFS.end()
      Serial.println("Start updating " + type);
    })
    .onEnd([]() {
      Serial.println("\nEnd");
    })
    .onProgress([](unsigned int progress, unsigned int total) {
      Serial.printf("Progress: %u%%\r", (progress / (total / 100)));
    })
    .onError([](ota_error_t error) {
      Serial.printf("Error[%u]: ", error);
      if (error == OTA_AUTH_ERROR) Serial.println("Auth Failed");
      else if (error == OTA_BEGIN_ERROR) Serial.println("Begin Failed");
      else if (error == OTA_CONNECT_ERROR) Serial.println("Connect Failed");
      else if (error == OTA_RECEIVE_ERROR) Serial.println("Receive Failed");
      else if (error == OTA_END_ERROR) Serial.println("End Failed");
    });

  ArduinoOTA.begin();

  // Listen on the port we send from, so the server's ACK comes back to us.
  // Without this parsePacket() never sees the ACK and the Wi-Fi reconnects
  // every 3 missed heartbeats.
  udp.begin(serverPort);

  Serial.println("Ready");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());

  lastAckTime = millis(); // Initialize ACK timer
}

void loop() {
  ArduinoOTA.handle(); // Handle OTA updates

  bool currentReading = digitalRead(sensorPin);
  unsigned long currentTime = millis();

  // Handle debounce and state transition
  if (currentReading != lastLaserState) {
    lastDebounceTime = currentTime;
  }

  if (currentReading != lastStableState) {
    unsigned long delayTime = currentReading ? debounceDelay : offDelay;
    if ((currentTime - lastDebounceTime) > delayTime) {
      if (currentReading != lastStableState) {
        // State actually changed
        if (currentReading) { // OFF → ON transition
          onStart = lastDebounceTime;  // when the pin went high
        } else { // ON → OFF transition: the block ended when the pin went low
          onMsTotal += lastDebounceTime - onStart;
        }
        lastStableState = currentReading;
        lastLaserState = currentReading;
        sendStatus();
      }
    }
  }

  lastLaserState = currentReading;

  if (currentTime - lastStatusTime >= statusInterval) sendStatus();

  // Handle heartbeat and ACK
  if (currentTime - lastHeartbeatTime > heartbeatInterval) {
    sendHeartbeat();
    lastHeartbeatTime = currentTime;
  }

  checkForAck();
}

void sendToServers(const String& jsonStr) {
  for (int i = 0; i < serverCount; i++) {
    udp.beginPacket(serverIPs[i], serverPort);
    udp.print(jsonStr);
    udp.endPacket();
  }
}

void sendHeartbeat() {
  DynamicJsonDocument doc(96);
  doc["type"] = "heartbeat";
  doc["rssi"] = WiFi.RSSI();
  doc["fw"] = FW_VERSION;   // scripts/esp-ota.sh flashes again when this is not the current code

  String jsonStr;
  serializeJson(doc, jsonStr);

  sendToServers(jsonStr);

  Serial.println("Sent heartbeat");
}

void checkForAck() {
  unsigned long currentTime = millis();

  // --- ACK Timeout Check ---
  if (currentTime - lastAckTime > ackTimeout) {
    missedAcks++;
    Serial.println("Missed ACK #" + String(missedAcks));
    lastAckTime = currentTime; // Reset timer

    if (missedAcks >= maxMissedAcks) {
      Serial.println("No ACK for 3 heartbeats. Reconnecting Wi-Fi...");
      WiFi.disconnect();
      WiFi.begin(ssid, password);
      missedAcks = 0;
    }
  }

  while(udp.parsePacket() > 0) {  // Process all waiting packets
    char packetBuffer[128];
    int len = udp.read(packetBuffer, sizeof(packetBuffer)-1);
    packetBuffer[len] = '\0';

    Serial.print("Raw UDP received: ");
    Serial.println(packetBuffer);  // Debug what's actually received

    DynamicJsonDocument doc(64);
    DeserializationError error = deserializeJson(doc, packetBuffer);

    if (!error && doc["type"] == "ack") {
      lastAckTime = currentTime;
      missedAcks = 0;
      Serial.println("Valid ACK received");
    } else {
      Serial.print("Invalid packet or deserialization error: ");
      Serial.println(error.c_str());
    }
  }
}

// Laser-on ms since boot. In the 1 s off-grace the pin is already low, so the
// running block stops at lastDebounceTime: never counts the grace, never goes down.
uint64_t onMs() {
  if (!lastStableState) return onMsTotal;
  unsigned long end = lastLaserState ? millis() : lastDebounceTime;
  return onMsTotal + (end - onStart);
}

void sendStatus() {
  DynamicJsonDocument doc(128);
  doc["state"] = lastStableState ? "ON" : "OFF";
  doc["on_ms"] = onMs();
  doc["boot"] = bootId;

  String jsonStr;
  serializeJson(doc, jsonStr);
  sendToServers(jsonStr);
  lastStatusTime = millis();
}
