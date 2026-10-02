import os
import joblib


BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.abspath(__file__)
    )
)

MODEL_PATH = os.path.join(
    BASE_DIR,
    "models",
    "final_xgboost_model.pkl"
)

METADATA_PATH = os.path.join(
    BASE_DIR,
    "models",
    "feature_metadata.pkl"
)


model = joblib.load(MODEL_PATH)

metadata = joblib.load(
    METADATA_PATH
)

MODEL_FEATURES = metadata[
    "feature_columns"
]


def predict_load(feature_df):
    """
    Generate a Total_Load prediction.
    """

    prediction = model.predict(
        feature_df
    )[0]

    return float(prediction)