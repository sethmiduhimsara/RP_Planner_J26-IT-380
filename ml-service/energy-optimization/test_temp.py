import joblib
import pandas as pd

print("🧠 Pinging Umi's Thermodynamics AI...")

# 1. Load YOUR 99.99% accurate model
model = joblib.load('ecopool_model.pkl')

# 2. Feed it dummy sensor data 
# (30.5°C Ambient Temp, 80% Humidity, Heater ON (1), and 34.0°C Previous Temp)
test_data = pd.DataFrame([[30.5, 80.0, 1, 34.0]], columns=['Ambient_Temp_C', 'Ambient_Humidity_Pct', 'Heater_Status', 'Previous_Pool_Temp'])

# 3. Calculate the new exact pool temperature
predicted_temp = model.predict(test_data)
print(f"🔥 EcoPool Predicted Temperature: {predicted_temp[0]:.2f}°C")