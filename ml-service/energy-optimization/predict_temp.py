import sys
import os
import joblib
import pandas as pd
import warnings

# Hide random warnings so Node.js only gets the clean temperature number
warnings.filterwarnings("ignore")

try:
    # 1. Grab the live sensor data sent by your Node.js server
    ambient_temp = float(sys.argv[1])
    humidity = float(sys.argv[2])
    heater_status = int(sys.argv[3])
    current_pool_temp = float(sys.argv[4])
    
    # 2. Load your 99.99% accurate AI Brain
    script_dir = os.path.dirname(os.path.abspath(__file__))
    model = joblib.load(os.path.join(script_dir, 'ecopool_model.pkl'))
    
    # 3. Format the data for the AI
    live_data = pd.DataFrame([[ambient_temp, humidity, heater_status, current_pool_temp]], 
                             columns=['Ambient_Temp_C', 'Ambient_Humidity_Pct', 'Heater_Status', 'Previous_Pool_Temp'])
    
    # 4. Predict and print ONLY the number back to Node.js
    predicted_temp = model.predict(live_data)[0]
    print(f"{predicted_temp:.2f}")

except Exception as e:
    print(f"Error: {e}")