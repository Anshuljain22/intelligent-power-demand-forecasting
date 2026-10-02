from pydantic import BaseModel, Field


class PredictionRequest(BaseModel):

    datetime: str = Field(
        ...,
        description=(
            "Prediction timestamp in "
            "YYYY-MM-DD HH:MM:SS format"
        )
    )


class PredictionResponse(BaseModel):

    datetime: str

    predicted_load: float

    unit: str = "load units"