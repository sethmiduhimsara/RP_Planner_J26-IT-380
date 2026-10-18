import csv
from datetime import datetime, timedelta

print("🤖 EcoPool-AI Dataset Multiplier Booting Up...")

# 1. Load your real hardware data into memory
real_data = []
with open('pool_training_data.csv', 'r') as infile:
    reader = csv.reader(infile)
    headers = next(reader)
    for row in reader:
        if len(row) >= 5:
            real_data.append(row)

print(f"📊 Loaded {len(real_data)} real hardware rows. Multiplying by 4...")

# 2. Setup our starting conditions
current_temp = 28.00
heater_status = '1'
# Grab the very first timestamp to start our chronological clock
current_time = datetime.strptime(real_data[0][0], '%Y-%m-%d %H:%M:%S')

# 3. Create the massive 18,000+ row dataset
with open('massive_training_dataset.csv', 'w', newline='') as outfile:
    writer = csv.writer(outfile)
    writer.writerow(headers)
    
    # Loop through your real weather data 4 times!
    for loop_count in range(4):
        for row in real_data:
            amb_temp = row[1]
            humidity = row[2]
            
            # THE FIX: Round to exactly 2 decimals so Python math doesn't glitch!
            current_temp = round(current_temp, 2)
            
            # The perfect 34C - 36C Thermostat
            if current_temp <= 34.00:
                heater_status = '1'
            elif current_temp >= 36.00:
                heater_status = '0'
                
            fixed_temp = f"{current_temp:.2f}"
            time_str = current_time.strftime('%Y-%m-%d %H:%M:%S')
            
            # Write the row
            writer.writerow([time_str, amb_temp, humidity, fixed_temp, heater_status])
            
            # Apply physics for the next row
            if heater_status == '1':
                current_temp += 0.03
            else:
                current_temp -= 0.02
                
            # Add 3 seconds to the clock for the next reading
            current_time += timedelta(seconds=3)

print("✅ BOOM! Over 18,000 rows generated in massive_training_dataset.csv!")