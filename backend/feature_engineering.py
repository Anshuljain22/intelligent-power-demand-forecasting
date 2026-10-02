import numpy as np
import pandas as pd

def create_prediction_features(
    prediction_datetime,
    integrated_df,
    model_features
):
    """
    Create the 34 features required by the trained XGBoost model.
    """

    prediction_datetime = pd.Timestamp(
        prediction_datetime
    )

    # Validate timestamp
    if prediction_datetime.minute not in [0, 30]:
        raise ValueError(
            "Prediction time must be aligned to a 30-minute interval."
        )

    if prediction_datetime.second != 0:
        raise ValueError(
            "Prediction timestamp must have zero seconds."
        )

    # Historical load
    load_series = (
        integrated_df
        .set_index("Datetime")["Total_Load"]
        .sort_index()
    )

    # Required 7-day history
    lag_336_time = (
        prediction_datetime -
        pd.Timedelta(days=7)
    )

    if lag_336_time not in load_series.index:
        raise ValueError(
            f"Insufficient historical data for "
            f"{prediction_datetime}. "
            "At least 7 days of prior demand history "
            "are required."
        )

    # Calendar
    hour = prediction_datetime.hour
    minute = prediction_datetime.minute
    day_of_week = prediction_datetime.dayofweek
    day_of_month = prediction_datetime.day
    month = prediction_datetime.month
    day_of_year = prediction_datetime.dayofyear

    week_of_year = int(
        prediction_datetime.isocalendar().week
    )

    is_weekend = int(day_of_week >= 5)

    time_slot = (
        hour * 2 + minute // 30
    )

    # Cyclical features
    time_slot_sin = np.sin(
        2 * np.pi * time_slot / 48
    )

    time_slot_cos = np.cos(
        2 * np.pi * time_slot / 48
    )

    day_of_week_sin = np.sin(
        2 * np.pi * day_of_week / 7
    )

    day_of_week_cos = np.cos(
        2 * np.pi * day_of_week / 7
    )

    day_of_year_sin = np.sin(
        2 * np.pi * day_of_year / 365
    )

    day_of_year_cos = np.cos(
        2 * np.pi * day_of_year / 365
    )

    # Lags
    lag_1 = load_series.get(
        prediction_datetime -
        pd.Timedelta(minutes=30),
        np.nan
    )

    lag_2 = load_series.get(
        prediction_datetime -
        pd.Timedelta(hours=1),
        np.nan
    )

    lag_4 = load_series.get(
        prediction_datetime -
        pd.Timedelta(hours=2),
        np.nan
    )

    lag_48 = load_series.get(
        prediction_datetime -
        pd.Timedelta(hours=24),
        np.nan
    )

    lag_96 = load_series.get(
        prediction_datetime -
        pd.Timedelta(hours=48),
        np.nan
    )

    lag_336 = load_series.get(
        prediction_datetime -
        pd.Timedelta(days=7),
        np.nan
    )

    lag_values = {
        "lag_1": lag_1,
        "lag_2": lag_2,
        "lag_4": lag_4,
        "lag_48": lag_48,
        "lag_96": lag_96,
        "lag_336": lag_336
    }

    missing_lags = [
        name
        for name, value in lag_values.items()
        if pd.isna(value)
    ]

    if missing_lags:
        raise ValueError(
            "Missing historical demand features: "
            + ", ".join(missing_lags)
        )

    # Rolling features
    historical_window = load_series[
        load_series.index < prediction_datetime
    ]

    if len(historical_window) < 48:
        raise ValueError(
            "Insufficient historical observations for "
            "24-hour rolling features."
        )

    rolling_mean_1h = (
        historical_window.tail(2).mean()
    )

    rolling_mean_2h = (
        historical_window.tail(4).mean()
    )

    rolling_mean_6h = (
        historical_window.tail(12).mean()
    )

    rolling_mean_24h = (
        historical_window.tail(48).mean()
    )

    rolling_std_2h = (
        historical_window.tail(4).std()
    )

    rolling_std_24h = (
        historical_window.tail(48).std()
    )

    historical_change_30min = (
        lag_1 - lag_2
    )

    # Holiday
    prediction_date = (
        prediction_datetime.normalize()
    )

    holiday_rows = integrated_df[
        integrated_df["Date"] == prediction_date
    ]

    if len(holiday_rows) > 0:
        is_holiday = int(
            holiday_rows["Is_Public_Holiday"].max()
        )
    else:
        is_holiday = 0

    # Weather
    weather_rows = integrated_df[
        integrated_df["Datetime"] ==
        prediction_datetime
    ]

    if len(weather_rows) == 0:
        raise ValueError(
            f"No Dhanbad weather data available for "
            f"{prediction_datetime}."
        )

    weather_row = weather_rows.iloc[0]

    dhanbad_temperature = weather_row[
        "Dhanbad_Temperature"
    ]

    dhanbad_humidity = weather_row[
        "Dhanbad_Humidity"
    ]

    dhanbad_cloud_cover = weather_row[
        "Dhanbad_CloudCover"
    ]

    dhanbad_wind_speed = weather_row[
        "Dhanbad_WindSpeed"
    ]

    temperature_humidity = (
        dhanbad_temperature *
        dhanbad_humidity
    )

    # Feature dictionary
    features = {
        "hour": hour,
        "minute": minute,
        "day_of_week": day_of_week,
        "day_of_month": day_of_month,
        "month": month,
        "day_of_year": day_of_year,
        "week_of_year": week_of_year,
        "is_weekend": is_weekend,
        "time_slot": time_slot,

        "time_slot_sin": time_slot_sin,
        "time_slot_cos": time_slot_cos,

        "day_of_week_sin": day_of_week_sin,
        "day_of_week_cos": day_of_week_cos,

        "day_of_year_sin": day_of_year_sin,
        "day_of_year_cos": day_of_year_cos,

        "is_holiday": is_holiday,

        "Dhanbad_Temperature": dhanbad_temperature,
        "Dhanbad_Humidity": dhanbad_humidity,
        "Dhanbad_CloudCover": dhanbad_cloud_cover,
        "Dhanbad_WindSpeed": dhanbad_wind_speed,

        "Temperature_Humidity": temperature_humidity,

        "lag_1": lag_1,
        "lag_2": lag_2,
        "lag_4": lag_4,
        "lag_48": lag_48,
        "lag_96": lag_96,
        "lag_336": lag_336,

        "rolling_mean_1h": rolling_mean_1h,
        "rolling_mean_2h": rolling_mean_2h,
        "rolling_mean_6h": rolling_mean_6h,
        "rolling_mean_24h": rolling_mean_24h,

        "rolling_std_2h": rolling_std_2h,
        "rolling_std_24h": rolling_std_24h,

        "historical_change_30min":
            historical_change_30min
    }

    feature_df = pd.DataFrame([features])

    # Exact training order
    feature_df = feature_df[
        model_features
    ]

    # Final validation
    if feature_df.shape[1] != 34:
        raise ValueError(
            f"Expected 34 features, got "
            f"{feature_df.shape[1]}."
        )

    if feature_df.isna().any().any():
        raise ValueError(
            "Generated feature vector contains "
            "missing values."
        )

    return feature_df

# ============================================
# Recursive 24-Hour Forecast Feature Generation
# ============================================

def create_recursive_forecast_features(
    prediction_datetime,
    historical_df,
    load_history,
    weather_row,
    feature_columns
):
    """
    Create model features for one future forecast timestamp.

    Parameters
    ----------
    prediction_datetime : pd.Timestamp
        Future timestamp to predict.

    historical_df : pd.DataFrame
        Integrated historical dataset containing calendar,
        weather and holiday information.

    load_history : pd.Series
        Historical + previously predicted Total_Load values.
        This is used to construct lag and rolling demand features.

    weather_row : pd.Series
        Weather information for the forecast timestamp.

    feature_columns : list
        Exact feature order expected by the trained model.

    Returns
    -------
    pd.DataFrame
        One-row feature dataframe in the exact model feature order.
    """

    prediction_datetime = pd.Timestamp(prediction_datetime)

    # ----------------------------------------
    # Validate timestamp
    # ----------------------------------------

    if prediction_datetime.minute not in [0, 30]:
        raise ValueError(
            "Forecast timestamp must be aligned to a 30-minute interval."
        )

    if prediction_datetime.second != 0:
        raise ValueError(
            "Forecast timestamp must have zero seconds."
        )

    # ----------------------------------------
    # Ensure load history is datetime indexed
    # ----------------------------------------

    load_history = load_history.copy()

    load_history.index = pd.to_datetime(
        load_history.index
    )

    load_history = load_history.sort_index()

    # ----------------------------------------
    # Required historical horizon
    # ----------------------------------------

    required_history_start = (
        prediction_datetime - pd.Timedelta(days=7)
    )

    available_history = load_history[
        load_history.index <= prediction_datetime
    ]

    available_history = available_history[
        available_history.index >= required_history_start
    ]

    if len(available_history) < 336:
        raise ValueError(
            "At least 7 days of historical load data "
            "are required for recursive forecasting."
        )

    # ----------------------------------------
    # Calendar features
    # ----------------------------------------

    hour = prediction_datetime.hour
    minute = prediction_datetime.minute

    day_of_week = prediction_datetime.dayofweek
    day_of_month = prediction_datetime.day
    month = prediction_datetime.month
    day_of_year = prediction_datetime.dayofyear

    week_of_year = (
        prediction_datetime.isocalendar().week
    )

    week_of_year = int(week_of_year)

    is_weekend = int(
        day_of_week >= 5
    )

    time_slot = (
        hour * 2 + minute // 30
    )

    # ----------------------------------------
    # Cyclical time features
    # ----------------------------------------

    time_slot_sin = np.sin(
        2 * np.pi * time_slot / 48
    )

    time_slot_cos = np.cos(
        2 * np.pi * time_slot / 48
    )

    day_of_week_sin = np.sin(
        2 * np.pi * day_of_week / 7
    )

    day_of_week_cos = np.cos(
        2 * np.pi * day_of_week / 7
    )

    day_of_year_sin = np.sin(
        2 * np.pi * day_of_year / 365
    )

    day_of_year_cos = np.cos(
        2 * np.pi * day_of_year / 365
    )

    # ----------------------------------------
    # Holiday information
    # ----------------------------------------

    matching_holiday = historical_df[
        historical_df["Date"]
        == prediction_datetime.normalize()
    ]

    if not matching_holiday.empty:

        holiday_row = matching_holiday.iloc[0]

        is_holiday = int(
            holiday_row["Is_Public_Holiday"]
        )

    else:

        is_holiday = 0

    # ----------------------------------------
    # Weather
    # ----------------------------------------

    temperature = float(
        weather_row["Dhanbad_Temperature"]
    )

    humidity = float(
        weather_row["Dhanbad_Humidity"]
    )

    cloud_cover = float(
        weather_row["Dhanbad_CloudCover"]
    )

    wind_speed = float(
        weather_row["Dhanbad_WindSpeed"]
    )

    temperature_humidity = (
        temperature * humidity
    )

    # ----------------------------------------
    # Demand lag features
    # ----------------------------------------

    def get_lag(steps):

        lag_timestamp = (
            prediction_datetime
            - pd.Timedelta(minutes=30 * steps)
        )

        if lag_timestamp not in load_history.index:

            raise ValueError(
                f"Missing historical load required for lag_{steps}: "
                f"{lag_timestamp}"
            )

        return float(
            load_history.loc[lag_timestamp]
        )

    lag_1 = get_lag(1)
    lag_2 = get_lag(2)
    lag_4 = get_lag(4)
    lag_48 = get_lag(48)
    lag_96 = get_lag(96)
    lag_336 = get_lag(336)

    # ----------------------------------------
    # Historical rolling features
    # ----------------------------------------

    rolling_mean_1h = (
        load_history
        .loc[
            prediction_datetime
            - pd.Timedelta(hours=1):
            prediction_datetime
            - pd.Timedelta(minutes=30)
        ]
        .mean()
    )

    rolling_mean_2h = (
        load_history
        .loc[
            prediction_datetime
            - pd.Timedelta(hours=2):
            prediction_datetime
            - pd.Timedelta(minutes=30)
        ]
        .mean()
    )

    rolling_mean_6h = (
        load_history
        .loc[
            prediction_datetime
            - pd.Timedelta(hours=6):
            prediction_datetime
            - pd.Timedelta(minutes=30)
        ]
        .mean()
    )

    rolling_mean_24h = (
        load_history
        .loc[
            prediction_datetime
            - pd.Timedelta(hours=24):
            prediction_datetime
            - pd.Timedelta(minutes=30)
        ]
        .mean()
    )

    rolling_std_2h = (
        load_history
        .loc[
            prediction_datetime
            - pd.Timedelta(hours=2):
            prediction_datetime
            - pd.Timedelta(minutes=30)
        ]
        .std()
    )

    rolling_std_24h = (
        load_history
        .loc[
            prediction_datetime
            - pd.Timedelta(hours=24):
            prediction_datetime
            - pd.Timedelta(minutes=30)
        ]
        .std()
    )

    # ----------------------------------------
    # Historical demand change
    # ----------------------------------------

    historical_change_30min = (
        lag_1 - lag_2
    )

    # ----------------------------------------
    # Construct feature dictionary
    # ----------------------------------------

    features = {

        "hour": hour,
        "minute": minute,
        "day_of_week": day_of_week,
        "day_of_month": day_of_month,
        "month": month,
        "day_of_year": day_of_year,
        "week_of_year": week_of_year,

        "is_weekend": is_weekend,
        "time_slot": time_slot,

        "time_slot_sin": time_slot_sin,
        "time_slot_cos": time_slot_cos,

        "day_of_week_sin": day_of_week_sin,
        "day_of_week_cos": day_of_week_cos,

        "day_of_year_sin": day_of_year_sin,
        "day_of_year_cos": day_of_year_cos,

        "is_holiday": is_holiday,

        "Dhanbad_Temperature": temperature,
        "Dhanbad_Humidity": humidity,
        "Dhanbad_CloudCover": cloud_cover,
        "Dhanbad_WindSpeed": wind_speed,

        "Temperature_Humidity": temperature_humidity,

        "lag_1": lag_1,
        "lag_2": lag_2,
        "lag_4": lag_4,
        "lag_48": lag_48,
        "lag_96": lag_96,
        "lag_336": lag_336,

        "rolling_mean_1h": rolling_mean_1h,
        "rolling_mean_2h": rolling_mean_2h,
        "rolling_mean_6h": rolling_mean_6h,
        "rolling_mean_24h": rolling_mean_24h,

        "rolling_std_2h": rolling_std_2h,
        "rolling_std_24h": rolling_std_24h,

        "historical_change_30min":
            historical_change_30min
    }

    # ----------------------------------------
    # Convert to DataFrame
    # ----------------------------------------

    feature_df = pd.DataFrame(
        [features],
        index=[prediction_datetime]
    )

    # ----------------------------------------
    # Validate feature order
    # ----------------------------------------

    missing_features = [
        feature
        for feature in feature_columns
        if feature not in feature_df.columns
    ]

    if missing_features:
        raise ValueError(
            f"Missing required features: {missing_features}"
        )

    feature_df = feature_df[
        feature_columns
    ]

    # ----------------------------------------
    # Validate values
    # ----------------------------------------

    if feature_df.isna().any().any():

        missing = feature_df.columns[
            feature_df.isna().any()
        ].tolist()

        raise ValueError(
            f"Missing values detected in features: {missing}"
        )

    return feature_df