import os
import joblib
import pandas as pd

from backend.feature_engineering import create_recursive_forecast_features
from backend.model_service import model, MODEL_FEATURES


# ============================================================
# PATHS
# ============================================================

BASE_DIR = os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))
)

INTEGRATED_DATA_PATH = os.path.join(
    BASE_DIR,
    "data",
    "processed",
    "integrated_demand_weather_holidays.csv"
)

MODEL_METADATA_PATH = os.path.join(
    BASE_DIR,
    "models",
    "feature_metadata.pkl"
)

FORECAST_WEATHER_PATH = os.path.join(
    BASE_DIR,
    "data",
    "production",
    "dhanbad_forecast_weather_2017-12-31.csv"
)


# ============================================================
# LOAD DATA
# ============================================================

integrated_df = pd.read_csv(
    INTEGRATED_DATA_PATH,
    parse_dates=["Datetime", "Date"]
)

integrated_df = (
    integrated_df
    .sort_values("Datetime")
    .reset_index(drop=True)
)


# ============================================================
# LOAD PRODUCTION FORECAST WEATHER
# ============================================================

if not os.path.exists(FORECAST_WEATHER_PATH):
    raise FileNotFoundError(
        "Production forecast weather file not found: "
        f"{FORECAST_WEATHER_PATH}"
    )

forecast_weather_df = pd.read_csv(
    FORECAST_WEATHER_PATH,
    parse_dates=["Datetime"]
)

forecast_weather_df = (
    forecast_weather_df
    .sort_values("Datetime")
    .drop_duplicates(subset=["Datetime"])
    .reset_index(drop=True)
)


# ============================================================
# LOAD MODEL METADATA
# ============================================================

metadata = joblib.load(MODEL_METADATA_PATH)

FEATURE_COLUMNS = metadata["feature_columns"]


# ============================================================
# PREPARE HISTORICAL LOAD
# ============================================================

historical_load_df = integrated_df[
    ["Datetime", "Total_Load"]
].copy()

historical_load_df = (
    historical_load_df
    .sort_values("Datetime")
    .set_index("Datetime")
)


# ============================================================
# PREPARE HISTORICAL WEATHER DATA
# ============================================================

weather_columns = [
    "Datetime",
    "Dhanbad_Temperature",
    "Dhanbad_Humidity",
    "Dhanbad_CloudCover",
    "Dhanbad_WindSpeed"
]

weather_df = integrated_df[weather_columns].copy()

weather_df = (
    weather_df
    .sort_values("Datetime")
    .drop_duplicates(subset=["Datetime"])
    .set_index("Datetime")
)


# ============================================================
# HOLIDAY DATA
# ============================================================

holiday_columns = [
    "Datetime",
    "Holiday_Name",
    "Holiday_Type",
    "Scope",
    "Is_Public_Holiday"
]

holiday_df = integrated_df[holiday_columns].copy()

holiday_df["Date"] = holiday_df["Datetime"].dt.date

holiday_df = (
    holiday_df[
        [
            "Date",
            "Holiday_Name",
            "Holiday_Type",
            "Scope",
            "Is_Public_Holiday"
        ]
    ]
    .drop_duplicates(subset=["Date"])
)


# ============================================================
# HOLIDAY LOOKUP
# ============================================================

def get_holiday_for_date(selected_date):
    """
    Return holiday information for a requested date.
    """

    selected_date = pd.Timestamp(selected_date).date()

    matches = holiday_df[
        holiday_df["Date"] == selected_date
    ]

    if matches.empty:
        return {
            "is_public_holiday": False,
            "holiday_name": None,
            "holiday_type": None,
            "scope": None
        }

    row = matches.iloc[0]

    holiday_name = row["Holiday_Name"]
    if pd.isna(holiday_name):
        holiday_name = None

    holiday_type = row["Holiday_Type"]
    if pd.isna(holiday_type):
        holiday_type = None

    scope = row["Scope"]
    if pd.isna(scope):
        scope = None

    return {
        "is_public_holiday": bool(row["Is_Public_Holiday"]),
        "holiday_name": holiday_name,
        "holiday_type": holiday_type,
        "scope": scope
    }


# ============================================================
# WEATHER LOOKUP
# ============================================================

def get_weather_for_date(selected_date):
    """
    Return exactly 48 half-hour weather observations
    for the requested date.

    Production forecast weather is checked first.
    Historical integrated weather is used as fallback.
    """

    selected_date = pd.Timestamp(selected_date).date()

    # --------------------------------------------------------
    # 1. Check dedicated production forecast weather
    # --------------------------------------------------------

    forecast_result = forecast_weather_df[
        forecast_weather_df["Datetime"].dt.date == selected_date
    ].copy()

    if len(forecast_result) == 48:

        return forecast_result[
            [
                "Datetime",
                "Dhanbad_Temperature",
                "Dhanbad_Humidity",
                "Dhanbad_CloudCover",
                "Dhanbad_WindSpeed"
            ]
        ].reset_index(drop=True)

    # --------------------------------------------------------
    # 2. Otherwise use historical integrated weather
    # --------------------------------------------------------

    historical_result = weather_df[
        weather_df.index.date == selected_date
    ].copy()

    if len(historical_result) == 48:

        historical_result = historical_result.reset_index()

        return historical_result[
            [
                "Datetime",
                "Dhanbad_Temperature",
                "Dhanbad_Humidity",
                "Dhanbad_CloudCover",
                "Dhanbad_WindSpeed"
            ]
        ].reset_index(drop=True)

    # --------------------------------------------------------
    # 3. Neither source contains complete weather
    # --------------------------------------------------------

    raise ValueError(
        f"Weather data for {selected_date} contains "
        f"{len(forecast_result)} forecast observations and "
        f"{len(historical_result)} historical observations; "
        f"expected 48."
    )


# ============================================================
# GENERATE 24-HOUR FORECAST
# ============================================================

def generate_24h_forecast(start_datetime=None):

    # --------------------------------------------------------
    # Default date
    # --------------------------------------------------------

    if start_datetime is None:

        start_datetime = pd.Timestamp(
            "2017-12-31 00:00:00"
        )

    else:

        start_datetime = pd.Timestamp(start_datetime)

        # If only a date is supplied, start at midnight.
        if (
            start_datetime.hour == 0
            and start_datetime.minute == 0
        ):
            pass

    # --------------------------------------------------------
    # Validate timestamp
    # --------------------------------------------------------

    if start_datetime.second != 0:

        raise ValueError(
            "Forecast timestamp must have seconds equal to 00."
        )

    if start_datetime.minute not in [0, 30]:

        raise ValueError(
            "Forecast timestamp must be on a 30-minute boundary."
        )

    # Current frontend use case is date-based.
    # Therefore a 24-hour forecast should begin at midnight.

    if (
        start_datetime.hour != 0
        or start_datetime.minute != 0
    ):

        raise ValueError(
            "For the date-based forecast dashboard, "
            "the forecast must start at 00:00."
        )

    # --------------------------------------------------------
    # Forecast timestamps
    # --------------------------------------------------------

    forecast_times = pd.date_range(
        start=start_datetime,
        periods=48,
        freq="30min"
    )

    forecast_end = forecast_times[-1]

    # --------------------------------------------------------
    # Weather
    # --------------------------------------------------------

    weather_for_date = get_weather_for_date(
        start_datetime.date()
    )

    weather_for_date = weather_for_date.set_index(
        "Datetime"
    )

    # Make sure timestamps exactly match.

    weather_for_date = weather_for_date.reindex(
        forecast_times
    )

    if weather_for_date.isna().any().any():

        raise ValueError(
            "Weather data does not cover the complete "
            "24-hour forecast period."
        )

    # --------------------------------------------------------
    # Holiday
    # --------------------------------------------------------

    holiday_info = get_holiday_for_date(
        start_datetime.date()
    )

    # --------------------------------------------------------
    # IMPORTANT:
    # ONLY USE LOAD HISTORY BEFORE FORECAST START
    #
    # This prevents future leakage when forecasting
    # historical dates.
    # --------------------------------------------------------

    load_history = historical_load_df[
        historical_load_df.index < start_datetime
    ].copy()

    if load_history.empty:

        raise ValueError(
            "No historical load data is available before "
            f"{start_datetime}."
        )

    # 7 days of half-hour history are required because
    # lag_336 is used by the model.

    minimum_history = 336

    if len(load_history) < minimum_history:

        raise ValueError(
            "Insufficient historical load data before "
            f"{start_datetime}. At least {minimum_history} "
            "half-hour observations are required."
        )

    # --------------------------------------------------------
    # Recursive forecasting
    # --------------------------------------------------------

    predictions = []

    # Historical actual load + predictions generated
    # during this forecast.

    recursive_load_history = load_history[
        "Total_Load"
    ].copy()

    for prediction_datetime in forecast_times:

        # ----------------------------------------------------
        # Weather for this timestamp
        # ----------------------------------------------------

        weather_row = weather_for_date.loc[
            prediction_datetime
        ]

        # ----------------------------------------------------
        # Create exactly the same 34 features used
        # during model training.
        # ----------------------------------------------------

        feature_df = create_recursive_forecast_features(
            prediction_datetime=prediction_datetime,
            historical_df=integrated_df,
            load_history=recursive_load_history,
            weather_row=weather_row,
            feature_columns=FEATURE_COLUMNS
        )

        # ----------------------------------------------------
        # Ensure exact feature order
        # ----------------------------------------------------

        feature_df = feature_df[
            FEATURE_COLUMNS
        ]

        # ----------------------------------------------------
        # Model prediction
        # ----------------------------------------------------

        prediction = model.predict(
            feature_df
        )[0]

        prediction = float(prediction)

        # ----------------------------------------------------
        # Store prediction in recursive history.
        #
        # The next 30-minute prediction can now use this
        # predicted value as lag_1.
        # ----------------------------------------------------

        recursive_load_history.loc[
            prediction_datetime
        ] = prediction

        predictions.append(
            {
                "datetime": prediction_datetime.strftime(
                    "%Y-%m-%d %H:%M:%S"
                ),

                "predicted_load": prediction,

                "temperature": float(
                    weather_row["Dhanbad_Temperature"]
                ),

                "humidity": float(
                    weather_row["Dhanbad_Humidity"]
                ),

                "cloud_cover": float(
                    weather_row["Dhanbad_CloudCover"]
                ),

                "wind_speed": float(
                    weather_row["Dhanbad_WindSpeed"]
                ),

                "is_public_holiday": int(
                    holiday_info["is_public_holiday"]
                ),

                "holiday_name":
                    holiday_info["holiday_name"],

                "holiday_type":
                    holiday_info["holiday_type"],

                "scope":
                    holiday_info["scope"]
            }
        )

    # --------------------------------------------------------
    # Final response
    # --------------------------------------------------------

    return {

        "forecast_date": start_datetime.strftime(
            "%Y-%m-%d"
        ),

        "forecast_start": start_datetime.strftime(
            "%Y-%m-%d %H:%M:%S"
        ),

        "forecast_end": forecast_end.strftime(
            "%Y-%m-%d %H:%M:%S"
        ),

        "interval_minutes": 30,

        "forecast_points": len(predictions),

        "holiday": holiday_info,

        "forecast": predictions
    }