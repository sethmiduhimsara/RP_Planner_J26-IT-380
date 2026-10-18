import serial
import csv
import time
from datetime import datetime

ESP32_PORT = 'COM13' 
BAUD_RATE = 115200

try:
    # Adding DTR/RTS false prevents the ESP32 from freezing when Python connects!
    ser = serial.Serial(ESP32_PORT, BAUD_RATE)
    ser.setDTR(False)
    ser.setRTS(False)
    print(f"🎧 Listening to EcoPool-AI on {ESP32_PORT}...")
except Exception as e:
    print(f"❌ Could not connect. Is Arduino Serial Monitor closed? Error: {e}")
    exit()

with open('pool_training_data.csv', 'a', newline='') as file:
    writer = csv.writer(file)
    
    # Write the column headers
    writer.writerow(["Timestamp", "Ambient_Temp_C", "Ambient_Humidity_Pct", "Pool_Temp_C", "Heater_Status"])
    file.flush() # Force save to disk immediately!
    print("📝 CSV Headers written. Logging live data...\n")
    
    while True:
        try:
            # errors='ignore' prevents emojis from crashing the python script!
            line = ser.readline().decode('utf-8', errors='ignore').strip()
            
            if line.startswith("DATA,"):
                parts = line.split(',') 
                
                # Double check we got exactly 5 pieces of data before saving
                if len(parts) == 5:
                    current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    
                    writer.writerow([current_time, parts[1], parts[2], parts[3], parts[4]])
                    file.flush() # Forces VS Code to update the CSV file live!
                    
                    print(f"✅ Logged [{current_time}] -> Air: {parts[1]}°C | Hum: {parts[2]}% | Pool: {parts[3]}°C | Heater: {parts[4]}")
                
        except KeyboardInterrupt:
            print("\n🛑 Logging stopped by Umi. Dataset saved!")
            break
        except Exception as e:
            print(f"⚠️ Minor serial glitch, skipping line: {e}")