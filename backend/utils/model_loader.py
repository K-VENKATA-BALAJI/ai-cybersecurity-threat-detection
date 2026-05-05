"""Loads the inference bundle (model + scaler + encoders).

A Keras Deep Neural Network is preferred when present at
``backend/models/dnn_model.keras``. Otherwise, the bundled Random Forest
``backend/models/model.pkl`` is used as a fallback. Both consume the same
``scaler.pkl`` and ``encoders.pkl`` produced by the training pipeline.
"""
from __future__ import annotations

import os
import pickle
from dataclasses import dataclass
from typing import Any

import numpy as np

MODELS_DIR = os.path.join("backend", "models")
RF_PATH = os.path.join(MODELS_DIR, "model.pkl")
DNN_PATH = os.path.join(MODELS_DIR, "dnn_model.keras")
SCALER_PATH = os.path.join(MODELS_DIR, "scaler.pkl")
ENCODERS_PATH = os.path.join(MODELS_DIR, "encoders.pkl")
BACKGROUND_PATH = os.path.join(MODELS_DIR, "shap_background.npy")


@dataclass
class InferenceBundle:
    model: Any
    model_kind: str  # "dnn" or "rf"
    scaler: Any
    encoders: dict
    background: np.ndarray | None

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Return probability of the positive (Attack) class for each row."""
        if self.model_kind == "dnn":
            preds = self.model.predict(X, verbose=0).reshape(-1)
            return preds.astype(float)
        proba = self.model.predict_proba(X)[:, 1]
        return proba.astype(float)

    def predict(self, X: np.ndarray) -> np.ndarray:
        proba = self.predict_proba(X)
        return (proba >= 0.5).astype(int)


def _load_pickle(path: str):
    with open(path, "rb") as f:
        return pickle.load(f)


def load_inference_bundle() -> InferenceBundle:
    scaler = _load_pickle(SCALER_PATH)
    encoders = _load_pickle(ENCODERS_PATH)

    background = None
    if os.path.exists(BACKGROUND_PATH):
        background = np.load(BACKGROUND_PATH)

    if os.path.exists(DNN_PATH):
        # Lazy import — TensorFlow is heavy.
        from tensorflow import keras  # type: ignore

        model = keras.models.load_model(DNN_PATH)
        return InferenceBundle(
            model=model,
            model_kind="dnn",
            scaler=scaler,
            encoders=encoders,
            background=background,
        )

    model = _load_pickle(RF_PATH)
    return InferenceBundle(
        model=model,
        model_kind="rf",
        scaler=scaler,
        encoders=encoders,
        background=background,
    )
