
from pathlib import Path
import joblib
import pandas as pd

MODEL_PATH = (
    Path(__file__).resolve().parent
    / "models"
    / "pool_prediction_model.joblib"
)

model = joblib.load(MODEL_PATH)

sample = pd.DataFrame([{
    "hour": 14,
    "day": "Wednesday",
    "weekend": 0,
    "holiday": 0,
    "rain": 0,
    "weather": "Sunny",
}])

prediction = model.predict(sample)

print("Test input:")
print(sample.to_string(index=False))
print("\nPredicted swimmers:", float(prediction[0]))
