from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pickle
import numpy as np
import pandas as pd

app = FastAPI(title="AI Cybersecurity Threat Detection API")
def calculate_severity(prediction: str, confidence: float) -> str:
    if prediction == "Normal":
        return "Informational"

    if confidence >= 85:
        return "High"
    elif confidence >= 60:
        return "Medium"
    else:
        return "Low"
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

with open("backend/models/model.pkl", "rb") as f:
    model = pickle.load(f)

with open("backend/models/scaler.pkl", "rb") as f:
    scaler = pickle.load(f)

with open("backend/models/encoders.pkl", "rb") as f:
    encoders = pickle.load(f)


categorical_cols = ["protocol_type", "service", "flag"]


class PredictionInput(BaseModel):
    features: list[float]


@app.get("/")
def root():
    return {"status": "running"}


@app.post("/predict")
def predict(data: PredictionInput):
    features = np.array(data.features).reshape(1, -1)
    scaled = scaler.transform(features)
    pred = model.predict(scaled)[0]
    probability = float(model.predict_proba(scaled)[0][1])

    prediction = "Attack" if pred == 1 else "Normal"
    confidence = round(probability * 100, 2)

    return {
        "prediction": prediction,
        "confidence": confidence,
        "severity": calculate_severity(prediction, confidence)
    }


@app.post("/predict-csv")
async def predict_csv(file: UploadFile = File(...)):
    df = pd.read_csv(file.file)

    for col in categorical_cols:
        df[col] = encoders[col].transform(df[col])

    scaled = scaler.transform(df)

    predictions = model.predict(scaled)
    probabilities = model.predict_proba(scaled)[:, 1]

    results = []
    for pred, prob in zip(predictions, probabilities):
        prediction = "Attack" if pred == 1 else "Normal"
        confidence = round(float(prob) * 100, 2)

        results.append({
            "prediction": prediction,
            "confidence": confidence,
            "severity": calculate_severity(prediction, confidence)
            })

    return {"results": results}