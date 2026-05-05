from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np
import pandas as pd

try:
    from backend.utils import (
        calculate_severity,
        recommended_actions,
        FEATURE_COLUMNS,
        CATEGORICAL_COLS,
        build_explainer,
        explain_sample,
        explain_batch,
        load_inference_bundle,
    )
except ImportError:
    import os, sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from utils import (
        calculate_severity,
        recommended_actions,
        FEATURE_COLUMNS,
        CATEGORICAL_COLS,
        build_explainer,
        explain_sample,
        explain_batch,
        load_inference_bundle,
    )

app = FastAPI(title="AI Cybersecurity Threat Detection API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

bundle = load_inference_bundle()
explainer = build_explainer(bundle)


class PredictionInput(BaseModel):
    features: list[float]


def _decorate(prediction: str, confidence: float, explanation: dict) -> dict:
    severity = calculate_severity(prediction, confidence)
    return {
        "prediction": prediction,
        "confidence": confidence,
        "severity": severity,
        "recommended_action": recommended_actions(severity),
        "top_features": explanation.get("top_features", []),
        "feature_importance_values": explanation.get("feature_importance_values", []),
    }


@app.get("/")
def root():
    return {
        "status": "running",
        "model": bundle.model_kind,
        "explainer": explainer.kind if explainer else "unavailable",
    }


@app.post("/predict")
def predict(data: PredictionInput):
    if len(data.features) != len(FEATURE_COLUMNS):
        raise HTTPException(
            status_code=400,
            detail=f"Expected {len(FEATURE_COLUMNS)} features, received {len(data.features)}.",
        )

    features = np.array(data.features, dtype=float).reshape(1, -1)
    scaled = bundle.scaler.transform(features)

    proba = float(bundle.predict_proba(scaled)[0])
    pred = int(proba >= 0.5)
    prediction = "Attack" if pred == 1 else "Normal"
    confidence = round(proba * 100, 2)

    explanation = explain_sample(explainer, scaled, top_k=5)
    return _decorate(prediction, confidence, explanation)


@app.post("/predict-csv")
async def predict_csv(file: UploadFile = File(...)):
    df = pd.read_csv(file.file)

    missing = [c for c in FEATURE_COLUMNS if c not in df.columns]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"CSV is missing required columns: {missing[:5]}{'...' if len(missing) > 5 else ''}",
        )

    df = df[FEATURE_COLUMNS].copy()
    for col in CATEGORICAL_COLS:
        encoder = bundle.encoders[col]
        known = set(encoder.classes_)
        df[col] = df[col].astype(str).apply(lambda v: v if v in known else encoder.classes_[0])
        df[col] = encoder.transform(df[col])

    scaled = bundle.scaler.transform(df.astype(float))
    probabilities = bundle.predict_proba(scaled)
    explanations = explain_batch(explainer, scaled, top_k=5)

    results = []
    for prob, explanation in zip(probabilities, explanations):
        prob = float(prob)
        pred = int(prob >= 0.5)
        prediction = "Attack" if pred == 1 else "Normal"
        confidence = round(prob * 100, 2)
        results.append(_decorate(prediction, confidence, explanation))

    return {"results": results, "model": bundle.model_kind}
