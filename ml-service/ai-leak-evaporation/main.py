"""AquaEdge AI - Water Loss API for the PP1 prototype.

Runs a background reader for ESP32 serial telemetry, loads the saved LSTM model,
and exposes GET /api/water-loss/status for the React WaterLossAnalysis component.

Important: the LSTM was trained on synthetic weather/evaporation data. The alert is
an abnormal water-drop warning and does not confirm a physical leak.
"""
from __future__ import annotations

import os
import threading
import time
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import serial
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
    import tensorflow as tf
except Exception as exc:  # keep API health/error info available if TF fails
    tf = None
    _TF_IMPORT_ERROR = f"{type(exc).__name__}: {exc}"
else:
    _TF_IMPORT_ERROR = None

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
MODEL_DIR = ROOT / "models"
MODEL_PATH = MODEL_DIR / "lstm_evaporation_demo.keras"
X_SCALER_PATH = MODEL_DIR / "feature_scaler.joblib"
Y_SCALER_PATH = MODEL_DIR / "target_scaler.joblib"
TRAIN_PATH = DATA_DIR / "simulated_training_data.csv"
BASELINE_PATH = DATA_DIR / "baseline_10cm.csv"

COM_PORT = os.getenv("WATER_LOSS_COM_PORT", "COM7")
BAUD_RATE = int(os.getenv("WATER_LOSS_BAUD_RATE", "115200"))
INITIAL_WATER_LEVEL_CM = float(os.getenv("WATER_LOSS_INITIAL_LEVEL_CM", "10.0"))
CALIBRATION_SAMPLES = 10
DROP_THRESHOLD_CM = 0.75
REQUIRED_CONSECUTIVE_SAMPLES = 3
SEQUENCE_LENGTH = 24
FEATURES = ["temperature_c", "humidity_pct", "wind_speed_kmh", "solar_radiation_wm2"]
TARGET = "simulated_evaporation_cm_per_hour"
HISTORY_LIMIT = 60

app = FastAPI(title="AquaEdge AI Water Loss API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

_lock = threading.RLock()
_state: dict[str, Any] = {
    "model_loaded": False,
    "model_error": None,
    "sensor_connected": False,
    "serial_error": None,
    "distance_cm": None,
    "water_level_cm": None,
    "observed_drop_cm": None,
    "expected_loss_cm": None,
    "excess_loss_cm": None,
    "status": "WAITING_FOR_SENSOR",
    "timestamp": None,
    "calibration_complete": False,
    "baseline_distance_cm": None,
    "predicted_rate": None,
    "target_min": None,
    "target_max": None,
    "start_monotonic": None,
    "last_read_monotonic": None,
    "consecutive_anomalies": 0,
}
_history: deque[dict[str, Any]] = deque(maxlen=HISTORY_LIMIT)
_worker_started = False
_worker_lock = threading.Lock()


def load_lstm_prediction() -> tuple[float, float, float]:
    required_paths = [MODEL_PATH, X_SCALER_PATH, Y_SCALER_PATH, TRAIN_PATH]
    missing = [str(path.relative_to(ROOT)) for path in required_paths if not path.exists()]
    if missing:
        raise FileNotFoundError(
            "Missing LSTM assets: " + ", ".join(missing)
            + ". Copy the trained model/scalers to models/ and simulated_training_data.csv to data/."
        )
    if tf is None:
        raise RuntimeError(f"TensorFlow import failed: {_TF_IMPORT_ERROR}")

    df = pd.read_csv(TRAIN_PATH)
    needed = [*FEATURES, TARGET]
    missing_columns = [column for column in needed if column not in df.columns]
    if missing_columns:
        raise ValueError(f"Training CSV missing columns: {missing_columns}")
    clean = df[needed].replace([np.inf, -np.inf], np.nan).dropna().reset_index(drop=True)
    if len(clean) < SEQUENCE_LENGTH:
        raise ValueError(f"Need at least {SEQUENCE_LENGTH} complete rows in synthetic training CSV.")

    x_scaler = joblib.load(X_SCALER_PATH)
    y_scaler = joblib.load(Y_SCALER_PATH)
    model = tf.keras.models.load_model(MODEL_PATH)
    x_scaled = x_scaler.transform(clean[FEATURES].tail(SEQUENCE_LENGTH)).astype(np.float32)
    x = x_scaled.reshape(1, SEQUENCE_LENGTH, len(FEATURES))
    pred_scaled = model.predict(x, verbose=0)
    pred_rate = float(y_scaler.inverse_transform(np.asarray(pred_scaled).reshape(-1, 1))[0, 0])
    target_min = float(clean[TARGET].min())
    target_max = float(clean[TARGET].max())
    return max(0.0, pred_rate), target_min, target_max


def _load_baseline_noise_threshold() -> float:
    """Use a conservative, bounded threshold based on historical baseline noise."""
    try:
        df = pd.read_csv(BASELINE_PATH)
        if "average_distance_cm" not in df.columns:
            return DROP_THRESHOLD_CM
        values = pd.to_numeric(df["average_distance_cm"], errors="coerce").dropna()
        if len(values) < 2:
            return DROP_THRESHOLD_CM
        std = float(values.std(ddof=1))
        return max(DROP_THRESHOLD_CM, min(3.0 * std, 1.5))
    except Exception:
        return DROP_THRESHOLD_CM


def _parse_distance(line: str) -> tuple[int, float] | None:
    parts = [part.strip() for part in line.strip().split(",")]
    if len(parts) < 3:
        return None
    try:
        elapsed_ms = int(float(parts[0]))
    except (ValueError, TypeError):
        return None

    # Extended format: elapsed_ms,distance_cm,baseline_cm,drop_cm,status
    if len(parts) >= 5:
        try:
            distance = float(parts[1])
            if 2 <= distance <= 400:
                return elapsed_ms, distance
        except (ValueError, TypeError):
            return None

    # Current firmware format: elapsed_ms,valid_readings,average_distance_cm
    try:
        valid_count = int(float(parts[1]))
        distance = float(parts[2])
        if valid_count >= 5 and 2 <= distance <= 400:
            return elapsed_ms, distance
    except (ValueError, TypeError):
        return None
    return None


def _update_reading(distance_cm: float) -> None:
    now = datetime.now().astimezone().isoformat(timespec="seconds")
    monotonic_now = time.monotonic()
    with _lock:
        _state["sensor_connected"] = True
        _state["serial_error"] = None
        _state["last_read_monotonic"] = monotonic_now
        _state["timestamp"] = now

        if not _state["calibration_complete"]:
            samples = _state.setdefault("calibration_samples", [])
            samples.append(distance_cm)
            if len(samples) >= CALIBRATION_SAMPLES:
                baseline = float(np.mean(samples[:CALIBRATION_SAMPLES]))
                _state["baseline_distance_cm"] = baseline
                _state["calibration_complete"] = True
                _state["start_monotonic"] = monotonic_now
                _state["status"] = "NO_ABNORMAL_DROP_DETECTED"
            else:
                _state["status"] = "CALIBRATING"
            _state["distance_cm"] = float(distance_cm)
            return

        baseline = float(_state["baseline_distance_cm"])
        predicted_rate = _state.get("predicted_rate")
        elapsed_hours = max(0.0, (monotonic_now - float(_state["start_monotonic"])) / 3600.0)
        observed_drop = float(distance_cm - baseline)
        expected_loss = float(predicted_rate or 0.0) * elapsed_hours
        excess_loss = observed_drop - expected_loss

        # Consecutive samples reduce one-off noise; this is a heuristic alert, not a leak classifier.
        if excess_loss >= _load_baseline_noise_threshold():
            _state["consecutive_anomalies"] = int(_state["consecutive_anomalies"]) + 1
        else:
            _state["consecutive_anomalies"] = 0

        if int(_state["consecutive_anomalies"]) >= REQUIRED_CONSECUTIVE_SAMPLES:
            status = "POSSIBLE_LEAK_OR_ABNORMAL_DROP"
        elif excess_loss >= _load_baseline_noise_threshold():
            status = "DROP_CHECKING"
        else:
            status = "NO_ABNORMAL_DROP_DETECTED"

        level = INITIAL_WATER_LEVEL_CM - observed_drop
        _state.update(
            {
                "distance_cm": float(distance_cm),
                "water_level_cm": float(level),
                "observed_drop_cm": observed_drop,
                "expected_loss_cm": expected_loss,
                "excess_loss_cm": excess_loss,
                "status": status,
            }
        )
        _history.append(
            {
                "timestamp": now,
                "water_level_cm": round(level, 3),
                "distance_cm": round(float(distance_cm), 3),
                "observed_drop_cm": round(observed_drop, 3),
                "status": status,
            }
        )


def _serial_reader() -> None:
    while True:
        try:
            with serial.Serial(COM_PORT, BAUD_RATE, timeout=1) as ser:
                # ESP32 may reboot when the serial port opens.
                time.sleep(2.0)
                ser.reset_input_buffer()
                with _lock:
                    _state["sensor_connected"] = True
                    _state["serial_error"] = None
                while True:
                    raw = ser.readline().decode("utf-8", errors="ignore").strip()
                    if not raw:
                        with _lock:
                            last = _state.get("last_read_monotonic")
                            if last is None or time.monotonic() - last > 8:
                                _state["sensor_connected"] = False
                        continue
                    parsed = _parse_distance(raw)
                    if parsed is not None:
                        _update_reading(parsed[1])
        except Exception as exc:
            with _lock:
                _state["sensor_connected"] = False
                _state["serial_error"] = f"{type(exc).__name__}: {exc}"
                _state["status"] = "SENSOR_DISCONNECTED"
            time.sleep(3.0)


def _start_background_services() -> None:
    global _worker_started
    with _worker_lock:
        if _worker_started:
            return
        try:
            rate, target_min, target_max = load_lstm_prediction()
            with _lock:
                _state["model_loaded"] = True
                _state["model_error"] = None
                _state["predicted_rate"] = rate
                _state["target_min"] = target_min
                _state["target_max"] = target_max
        except Exception as exc:
            with _lock:
                _state["model_loaded"] = False
                _state["model_error"] = f"{type(exc).__name__}: {exc}"
                _state["predicted_rate"] = None

        thread = threading.Thread(target=_serial_reader, name="water-loss-serial-reader", daemon=True)
        thread.start()
        _worker_started = True


@app.on_event("startup")
def startup_event() -> None:
    _start_background_services()


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "water-loss-api"}


@app.get("/api/water-loss/status")
def water_loss_status() -> dict[str, Any]:
    with _lock:
        result = dict(_state)
        history = list(_history)
    result.pop("calibration_samples", None)
    start = result.pop("start_monotonic", None)
    last_read = result.pop("last_read_monotonic", None)
    result.pop("consecutive_anomalies", None)
    if last_read is not None and time.monotonic() - float(last_read) > 8:
        result["sensor_connected"] = False
        if result.get("status") not in {"POSSIBLE_LEAK_OR_ABNORMAL_DROP", "DROP_CHECKING"}:
            result["status"] = "SENSOR_DISCONNECTED"
    result.update(
        {
            "water_level_cm": None if result.get("water_level_cm") is None else round(float(result["water_level_cm"]), 3),
            "distance_cm": None if result.get("distance_cm") is None else round(float(result["distance_cm"]), 3),
            "observed_drop_cm": None if result.get("observed_drop_cm") is None else round(float(result["observed_drop_cm"]), 3),
            "predicted_evaporation_cm_per_hour": None if result.get("predicted_rate") is None else round(float(result["predicted_rate"]), 6),
            "expected_loss_cm": None if result.get("expected_loss_cm") is None else round(float(result["expected_loss_cm"]), 6),
            "excess_loss_cm": None if result.get("excess_loss_cm") is None else round(float(result["excess_loss_cm"]), 3),
            "history": history,
            "initial_water_level_cm": INITIAL_WATER_LEVEL_CM,
            "threshold_cm": _load_baseline_noise_threshold(),
            "training_data_source": "simulated_training_data.csv",
            "prediction_input_source": "last 24 rows of synthetic training weather data",
            "prediction_is_synthetic_reference": True,
            "model_error": result.get("model_error"),
            "serial_error": result.get("serial_error"),
        }
    )
    return result


@app.post("/api/water-loss/recalibrate")
def recalibrate() -> dict[str, Any]:
    """Relearn the current sensor distance as the initial 10 cm reference."""
    with _lock:
        _state["calibration_complete"] = False
        _state["baseline_distance_cm"] = None
        _state["calibration_samples"] = []
        _state["water_level_cm"] = None
        _state["observed_drop_cm"] = None
        _state["expected_loss_cm"] = None
        _state["excess_loss_cm"] = None
        _state["start_monotonic"] = None
        _state["consecutive_anomalies"] = 0
        _state["status"] = "CALIBRATING"
        _history.clear()
    return {"ok": True, "message": "Calibration restarted. Set water to the configured initial level and keep sensor fixed."}
