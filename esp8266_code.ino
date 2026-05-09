/*
  SISTec IoT Application 2026 - ESP8266 Code
  Hardware: 
  - ESP8266
  - DHT11 (Pin D5)
  - I2C LCD 16x2 (SDA -> D2, SCL -> D1) [0x27]
*/

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <DHT.h>
#include <LiquidCrystal_I2C.h>

// --- CONFIGURATION ---
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const String serverUrl = "https://your-app-name.onrender.com"; // Change to your Render URL

#define DHTPIN D5
#define DHTTYPE DHT11

DHT dht(DHTPIN, DHTTYPE);
LiquidCrystal_I2C lcd(0x27, 16, 2);

void setup() {
  Serial.begin(115200);
  
  // Initialize LCD
  lcd.init();
  lcd.backlight();
  
  // WiFi Connection
  lcd.setCursor(0, 0);
  lcd.print("CONNECTING TO");
  lcd.setCursor(0, 1);
  lcd.print("WiFi...");
  
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  lcd.clear();
  lcd.print("CONNECTED TO");
  lcd.setCursor(0, 1);
  lcd.print("WiFi :)");
  delay(2000);
  
  lcd.clear();
  lcd.print("-- WELCOME --");
  delay(2000);
  
  dht.begin();
}

void loop() {
  // 1. Read DHT11
  float h = dht.readHumidity();
  float t = dht.readTemperature();
  
  if (isnan(h) || isnan(t)) {
    Serial.println("Failed to read from DHT sensor!");
    return;
  }

  // 2. Display Temperature
  lcd.clear();
  lcd.print("TEMPERATURE");
  lcd.setCursor(0, 1);
  lcd.print(String(t) + " 'C");
  delay(2000);

  // 3. Display Humidity
  lcd.clear();
  lcd.print("HUMIDITY");
  lcd.setCursor(0, 1);
  lcd.print(String(h) + " %");
  delay(2000);

  // 4. Fetch LCD Text from Server
  fetchLCDText();
  delay(3000);

  // 5. Send Data to Server
  sendDataToServer(t, h);
  
  delay(5000); // Wait before next cycle
}

void fetchLCDText() {
  WiFiClientSecure client;
  client.setInsecure(); // Required to connect to HTTPS without checking certificate fingerprint
  
  HTTPClient http;
  String url = serverUrl + "/api/get-lcd";
  
  Serial.println("Fetching LCD text...");
  if (http.begin(client, url)) {
    int httpCode = http.GET();
    if (httpCode > 0) {
      String payload = http.getString();
      lcd.clear();
      lcd.print("SISTec DISPLAY");
      lcd.setCursor(0, 1);
      lcd.print(payload);
      Serial.println("Fetched: " + payload);
    }
    http.end();
  }
}

void sendDataToServer(float t, float h) {
  WiFiClientSecure client;
  client.setInsecure();
  
  HTTPClient http;
  // We use GET request with query params for simplicity on ESP8266
  String url = serverUrl + "/api/save-data?temp=" + String(t) + "&hum=" + String(h);
  
  lcd.clear();
  lcd.print("SENDING DATA TO");
  lcd.setCursor(0, 1);
  lcd.print("WEB SERVER....");
  
  if (http.begin(client, url)) {
    int httpCode = http.GET();
    if (httpCode > 0) {
      lcd.clear();
      lcd.print("DATA SENT...!!");
      Serial.println("Server Response: " + http.getString());
    } else {
      Serial.println("Error sending data");
    }
    http.end();
  }
  delay(1000);
}
