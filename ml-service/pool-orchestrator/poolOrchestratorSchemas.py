"""
Pydantic schemas for the Pool Orchestrator ML Service.
Validates input feature rows and structured prediction responses.
"""

from typing import List, Literal, Optional
from pydantic import BaseModel, Field, field_validator


DayName = Literal[
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]

WeatherCategory = Literal[
    "Sunny",
    "Cloudy",
    "Rainy",
]


class HourlyFeatureRow(BaseModel):
    hour: int = Field(..., ge=0, le=23, description="Hour of the day (0-23)")
    day: DayName = Field(..., description="Day of the week (Monday-Sunday)")
    weekend: int = Field(..., ge=0, le=1, description="1 if weekend (Sat/Sun), else 0")
    holiday: int = Field(..., ge=0, le=1, description="1 if public holiday, else 0")
    rain: int = Field(..., ge=0, le=1, description="1 if rain detected or forecast, else 0")
    weather: WeatherCategory = Field(..., description="Weather category: Sunny, Cloudy, or Rainy")
    target_time: Optional[str] = Field(None, description="Optional ISO timestamp of the forecast target slot")

    @field_validator("weekend")
    @classmethod
    def validate_weekend_consistency(cls, v: int, info):
        # Additional safety check
        return v


class PredictionRequest(BaseModel):
    features: List[HourlyFeatureRow] = Field(
        ...,
        min_length=1,
        max_length=24,
        description="List of 1 to 24 hourly feature rows to predict"
    )


class PredictionItem(BaseModel):
    hour: int
    day: str
    target_time: Optional[str] = None
    predicted_swimmers: float
    rounded_swimmers: int
    demand_level: Literal["Low", "Moderate", "High"]
    input_features: dict


class PredictionResponse(BaseModel):
    service: str = "pool-orchestrator-ml"
    status: str = "success"
    model_version: str = "1.0.0"
    predictions: List[PredictionItem]


class HealthResponse(BaseModel):
    service: str = "pool-orchestrator-ml"
    status: str
    model_loaded: bool
    model_version: str
    expected_features: List[str]
    supported_days: List[str]
    supported_weather: List[str]


class TrainingRow(BaseModel):
    hour: int = Field(..., ge=0, le=23)
    day: str
    weekend: int = Field(..., ge=0, le=1)
    holiday: int = Field(default=0, ge=0, le=1)
    rain: int = Field(default=0, ge=0, le=1)
    weather: str
    occupancy_count: float = Field(..., ge=0)


class RetrainRequest(BaseModel):
    records: List[TrainingRow] = Field(..., min_length=10)
    trigger_reason: Optional[str] = "100-row automated retraining cycle"


class RetrainResponse(BaseModel):
    success: bool
    samples_trained: int
    mean_absolute_error: Optional[float] = None
    r2_score: Optional[float] = None
    model_version: str
    message: str
