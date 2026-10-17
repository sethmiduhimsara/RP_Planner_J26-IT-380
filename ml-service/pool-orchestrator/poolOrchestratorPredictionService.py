"""
Pool Orchestrator Prediction Service.
Loads the trained scikit-learn pipeline once at startup and performs inference.
"""

from pathlib import Path
from typing import List, Optional
import joblib
import pandas as pd
from poolOrchestratorSchemas import (
    HourlyFeatureRow,
    PredictionItem,
    PredictionResponse,
)

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL_PATH = BASE_DIR / "models" / "pool_prediction_model.joblib"
MODEL_VERSION = "1.0.0"

EXPECTED_FEATURES = ["hour", "day", "weekend", "holiday", "rain", "weather"]
SUPPORTED_DAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]
SUPPORTED_WEATHER = ["Cloudy", "Rainy", "Sunny"]


class PoolOrchestratorPredictionService:
    def __init__(self, model_path: Optional[Path] = None):
        self.model_path = model_path or DEFAULT_MODEL_PATH
        self.model = None
        self.model_version = MODEL_VERSION
        self._load_model()

    def _load_model(self) -> None:
        if not self.model_path.exists():
            print(f"[PoolOrchestratorPredictionService] Model file not found at: {self.model_path}")
            return

        try:
            self.model = joblib.load(self.model_path)
            print(f"[PoolOrchestratorPredictionService] Successfully loaded trained model from {self.model_path}")
            # Verify feature names if present
            feat_in = getattr(self.model, "feature_names_in_", None)
            if feat_in is not None:
                print(f"[PoolOrchestratorPredictionService] Model feature names: {list(feat_in)}")
        except Exception as exc:
            print(f"[PoolOrchestratorPredictionService] Failed to load model: {exc}")
            self.model = None

    def is_ready(self) -> bool:
        return self.model is not None

    def predict(self, feature_rows: List[HourlyFeatureRow]) -> PredictionResponse:
        if not self.is_ready():
            raise RuntimeError(
                f"Model is not loaded. Ensure {self.model_path.name} is present."
            )

        # Build feature dictionaries matching exact trained column names
        records = []
        for row in feature_rows:
            records.append({
                "hour": int(row.hour),
                "day": str(row.day),
                "weekend": int(row.weekend),
                "holiday": int(row.holiday),
                "rain": int(row.rain),
                "weather": str(row.weather),
            })

        df = pd.DataFrame(records, columns=EXPECTED_FEATURES)

        # Pipeline handles ColumnTransformer (OneHotEncoder for day & weather) + RandomForestRegressor
        raw_predictions = self.model.predict(df)

        prediction_items = []
        for idx, val in enumerate(raw_predictions):
            pred_float = float(val)
            pred_count = max(0, int(round(pred_float)))

            # Demand classification consistent with operational metrics
            if pred_count < 15:
                demand = "Low"
            elif pred_count <= 30:
                demand = "Moderate"
            else:
                demand = "High"

            row = feature_rows[idx]
            prediction_items.append(
                PredictionItem(
                    hour=row.hour,
                    day=row.day,
                    target_time=row.target_time,
                    predicted_swimmers=round(pred_float, 2),
                    rounded_swimmers=pred_count,
                    demand_level=demand,
                    input_features=records[idx],
                )
            )

        return PredictionResponse(
            service="pool-orchestrator-ml",
            status="success",
            model_version=self.model_version,
            predictions=prediction_items,
        )

    def retrain(self, training_rows: List[dict]) -> dict:
        import pandas as pd
        from sklearn.pipeline import Pipeline
        from sklearn.compose import ColumnTransformer
        from sklearn.preprocessing import OneHotEncoder
        from sklearn.ensemble import RandomForestRegressor
        from sklearn.metrics import mean_absolute_error, r2_score

        if len(training_rows) < 10:
            raise ValueError(f"Insufficient training observations. At least 10 rows required, received {len(training_rows)}")

        df = pd.DataFrame(training_rows)
        for feat in EXPECTED_FEATURES:
            if feat not in df.columns:
                raise ValueError(f"Missing required feature '{feat}' in training data")

        if "occupancy_count" not in df.columns:
            raise ValueError("Missing target column 'occupancy_count' in training data")

        X = df[EXPECTED_FEATURES]
        y = df["occupancy_count"].astype(float)

        preprocessor = ColumnTransformer(
            transformers=[
                ("categorical", OneHotEncoder(handle_unknown="ignore"), ["day", "weather"])
            ],
            remainder="passthrough"
        )

        pipeline = Pipeline([
            ("preprocessor", preprocessor),
            ("model", RandomForestRegressor(n_estimators=200, min_samples_leaf=2, random_state=42))
        ])

        pipeline.fit(X, y)

        y_pred = pipeline.predict(X)
        mae = float(mean_absolute_error(y, y_pred))
        r2 = float(r2_score(y, y_pred))

        # Backup existing model
        if self.model_path.exists():
            backup_path = self.model_path.parent / f"{self.model_path.stem}_backup{self.model_path.suffix}"
            try:
                joblib.dump(self.model, backup_path)
            except Exception as bkp_err:
                print(f"[PoolOrchestratorPredictionService] Backup notice: {bkp_err}")

        # Save freshly retrained model
        joblib.dump(pipeline, self.model_path)
        self.model = pipeline
        self.model_version = f"retrained-{len(df)}-obs"

        print(f"[PoolOrchestratorPredictionService] Model successfully retrained on {len(df)} rows! MAE: {mae:.2f}, R2: {r2:.3f}")

        return {
            "success": True,
            "samples_trained": len(df),
            "mean_absolute_error": round(mae, 2),
            "r2_score": round(r2, 3),
            "model_version": self.model_version,
            "message": f"Successfully retrained Random Forest pipeline on {len(df)} real pool observations."
        }


# Global singleton instance loaded once at module level / startup
prediction_service = PoolOrchestratorPredictionService()
