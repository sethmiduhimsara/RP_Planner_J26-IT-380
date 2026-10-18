
import joblib
from pathlib import Path

model_path = Path("models/pool_prediction_model.joblib")

if not model_path.exists():
    raise FileNotFoundError(
        f"Copy your trained model to: {model_path.resolve()}"
    )

model = joblib.load(model_path)

print("Model type:", type(model).__name__)
print("Expected feature names:",
      getattr(model, "feature_names_in_", "Not stored in model"))
print("Expected feature count:",
      getattr(model, "n_features_in_", "Not available"))
print("Pipeline steps:",
      getattr(model, "named_steps", "Not a pipeline"))
