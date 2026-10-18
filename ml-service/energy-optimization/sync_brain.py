import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
import joblib

print("🔄 Re-syncing Umi's AI to Team Version 1.6.1...")

# Load your dataset
df = pd.read_csv('massive_training_dataset.csv')
df['Previous_Pool_Temp'] = df['Pool_Temp_C'].shift(1)
df = df.dropna()

X = df[['Ambient_Temp_C', 'Ambient_Humidity_Pct', 'Heater_Status', 'Previous_Pool_Temp']]
y = df['Pool_Temp_C']

# Train it locally
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
model = RandomForestRegressor(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

# Overwrite the old brain with the version-synced brain
joblib.dump(model, 'ecopool_model.pkl')
print("✅ Done! Brain is fully synced with the team architecture!")