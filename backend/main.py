import os
import pandas as pd

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from backend.schemas import (
    PredictionRequest,
    PredictionResponse
)

from backend.feature_engineering import (
    create_prediction_features
)

from backend.model_service import (
    predict_load,
    MODEL_FEATURES
)

from backend.forecast_service import (
    generate_24h_forecast
)

# ---------------------------------------------------------
# Application
# ---------------------------------------------------------

app = FastAPI(
    title="Intelligent Power Demand Forecasting API",
    description=(
        "API for 30-minute electricity demand forecasting "
        "using a trained XGBoost model."
    ),
    version="1.0.0"
)


# ---------------------------------------------------------
# CORS Configuration
# ---------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------
# Project Paths
# ---------------------------------------------------------

BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.abspath(__file__)
    )
)


# ---------------------------------------------------------
# Integrated Dataset Path
# ---------------------------------------------------------

DATA_PATH = os.path.join(
    BASE_DIR,
    "data",
    "processed",
    "integrated_demand_weather_holidays.csv"
)


# ---------------------------------------------------------
# Load Integrated Dataset
# ---------------------------------------------------------

integrated_df = pd.read_csv(
    DATA_PATH,
    parse_dates=[
        "Datetime",
        "Date"
    ]
)

integrated_df = (
    integrated_df
    .sort_values("Datetime")
    .reset_index(drop=True)
)


# ---------------------------------------------------------
# Root Endpoint
# ---------------------------------------------------------

@app.get("/")
def root():

    return {
        "message": (
            "Intelligent Power Demand "
            "Forecasting API"
        ),
        "status": "running"
    }


# ---------------------------------------------------------
# Health Endpoint
# ---------------------------------------------------------

@app.get("/health")
def health():

    return {
        "status": "healthy",
        "model_features": len(MODEL_FEATURES),
        "historical_records": len(integrated_df)
    }

# ---------------------------------------------------------
# Analytics Endpoint
# ---------------------------------------------------------

@app.get("/analytics")
def analytics():

    df = integrated_df.copy()

    # Hourly demand profile
    hourly = (
        df.assign(
            hour=df["Datetime"].dt.hour
        )
        .groupby("hour")["Total_Load"]
        .mean()
        .reset_index()
    )

    hourly_data = [
        {
            "hour": int(row["hour"]),
            "load": float(row["Total_Load"])
        }
        for _, row in hourly.iterrows()
    ]

    # Day-of-week demand profile
    day_order = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday"
    ]

    df["day_name"] = df["Datetime"].dt.day_name()

    daily = (
        df.groupby("day_name")["Total_Load"]
        .mean()
        .reindex(day_order)
        .reset_index()
    )

    daily_data = [
        {
            "day": row["day_name"],
            "load": float(row["Total_Load"])
        }
        for _, row in daily.iterrows()
    ]

    # Monthly demand profile
    df["month"] = df["Datetime"].dt.month

    monthly = (
        df.groupby("month")["Total_Load"]
        .mean()
        .reset_index()
    )

    month_names = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec"
    ]

    monthly_data = [
        {
            "month": month_names[int(row["month"]) - 1],
            "load": float(row["Total_Load"])
        }
        for _, row in monthly.iterrows()
    ]

    return {
        "hourly": hourly_data,
        "daily": daily_data,
        "monthly": monthly_data
    }


# ---------------------------------------------------------
# Prediction Context Endpoint
# ---------------------------------------------------------

@app.get("/prediction-context")
def prediction_context(datetime: str):

    try:

        prediction_datetime = pd.Timestamp(datetime)

        # Make sure the timestamp exists in our historical data
        matching_rows = integrated_df[
            integrated_df["Datetime"] == prediction_datetime
        ]

        if matching_rows.empty:
            raise HTTPException(
                status_code=404,
                detail=(
                    "No historical observation exists "
                    "for the requested timestamp."
                )
            )

        # Get a window around the selected timestamp.
        # 2 hours before + selected timestamp + 2 hours after
        start_time = prediction_datetime - pd.Timedelta(hours=2)
        end_time = prediction_datetime + pd.Timedelta(hours=2)

        context_df = integrated_df[
            (integrated_df["Datetime"] >= start_time)
            & (integrated_df["Datetime"] <= end_time)
        ][
            [
                "Datetime",
                "Total_Load"
            ]
        ].copy()

        context_data = [
            {
                "datetime": row["Datetime"].strftime(
                    "%Y-%m-%d %H:%M"
                ),
                "load": float(row["Total_Load"])
            }
            for _, row in context_df.iterrows()
        ]

        actual_load = float(
            matching_rows.iloc[0]["Total_Load"]
        )

        return {
            "datetime": prediction_datetime.strftime(
                "%Y-%m-%d %H:%M"
            ),
            "actual_load": actual_load,
            "context": context_data
        }

    except HTTPException:
        raise

    except Exception as e:

        raise HTTPException(
            status_code=400,
            detail=(
                "Unable to retrieve prediction context: "
                + str(e)
            )
        )

# ---------------------------------------------------------
# Prediction Endpoint
# ---------------------------------------------------------

@app.post(
    "/predict",
    response_model=PredictionResponse
)
def predict(
    request: PredictionRequest
):

    try:

        prediction_datetime = pd.Timestamp(
            request.datetime
        )

        features = create_prediction_features(
            prediction_datetime,
            integrated_df,
            MODEL_FEATURES
        )

        prediction = predict_load(
            features
        )

        return PredictionResponse(
            datetime=str(
                prediction_datetime
            ),
            predicted_load=prediction
        )

    except ValueError as e:

        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=(
                "Internal prediction error: "
                + str(e)
            )
        )

# ============================================================
# 24-HOUR FORECAST ENDPOINT
# ============================================================

@app.get("/forecast")
def forecast(
    datetime: str = None
):

    try:

        result = generate_24h_forecast(
            datetime
        )

        return result

    except ValueError as e:

        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to generate "
                "24-hour forecast: "
                + str(e)
            )
        )