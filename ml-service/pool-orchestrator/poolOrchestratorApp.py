"""
FastAPI application for the Pool Orchestrator Machine Learning Service.
Provides /health and /predict endpoints for swimmer occupancy forecasting.
"""

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from poolOrchestratorSchemas import (
    HealthResponse,
    PredictionRequest,
    PredictionResponse,
    RetrainRequest,
    RetrainResponse,
)
from poolOrchestratorPredictionService import (
    EXPECTED_FEATURES,
    MODEL_VERSION,
    SUPPORTED_DAYS,
    SUPPORTED_WEATHER,
    prediction_service,
)

app = FastAPI(
    title="Pool Orchestrator ML Service",
    description="Swimmer occupancy prediction service using trained scikit-learn pipeline",
    version=MODEL_VERSION,
)

# Enable CORS for local backend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health():
    is_ready = prediction_service.is_ready()
    return HealthResponse(
        service="pool-orchestrator-ml",
        status="ready" if is_ready else "degraded",
        model_loaded=is_ready,
        model_version=prediction_service.model_version,
        expected_features=EXPECTED_FEATURES,
        supported_days=SUPPORTED_DAYS,
        supported_weather=SUPPORTED_WEATHER,
    )


@app.post("/retrain", response_model=RetrainResponse)
def retrain(request: RetrainRequest):
    try:
        rows = [r.dict() for r in request.records]
        result = prediction_service.retrain(rows)
        return RetrainResponse(**result)
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        ) from ve
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Retraining failed: {exc}",
        ) from exc


@app.post("/predict", response_model=PredictionResponse)
def predict(request: PredictionRequest):
    if not prediction_service.is_ready():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Trained prediction model is not loaded. Verify pool_prediction_model.joblib exists.",
        )

    try:
        response = prediction_service.predict(request.features)
        return response
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid feature inputs: {ve}",
        ) from ve
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Model inference failed: {exc}",
        ) from exc


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("poolOrchestratorApp:app", host="0.0.0.0", port=8000, reload=False)

