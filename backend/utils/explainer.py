"""SHAP explainability helpers.

Provides a uniform interface over a TreeExplainer (Random Forest) and a
DeepExplainer / KernelExplainer (Keras DNN). The explainer is built once at
startup, then queried for top contributing features per prediction.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from .feature_columns import FEATURE_COLUMNS


@dataclass
class ExplainerBundle:
    explainer: Any
    kind: str  # "tree" | "deep" | "kernel"


def build_explainer(bundle) -> ExplainerBundle | None:
    """Build a SHAP explainer matching the loaded model.

    Returns ``None`` if SHAP cannot be initialised — explainability degrades
    gracefully so prediction endpoints keep working.
    """
    try:
        import shap  # type: ignore
    except Exception:
        return None

    try:
        if bundle.model_kind == "rf":
            explainer = shap.TreeExplainer(bundle.model)
            return ExplainerBundle(explainer=explainer, kind="tree")

        # DNN — needs a background sample.
        background = bundle.background
        if background is None or len(background) == 0:
            return None

        try:
            explainer = shap.DeepExplainer(bundle.model, background)
            return ExplainerBundle(explainer=explainer, kind="deep")
        except Exception:
            # DeepExplainer can be picky across TF versions; fall back.
            predict_fn = lambda x: bundle.model.predict(x, verbose=0)
            explainer = shap.KernelExplainer(predict_fn, background)
            return ExplainerBundle(explainer=explainer, kind="kernel")
    except Exception:
        return None


def _shap_values_for_attack(raw_values, kind: str) -> np.ndarray:
    """Normalise SHAP output to a (n_samples, n_features) array for the
    positive (Attack) class.
    """
    arr = raw_values
    if isinstance(arr, list):
        # Multi-output: list per class. Use the Attack class (index 1).
        arr = arr[1] if len(arr) > 1 else arr[0]
    arr = np.asarray(arr)
    if arr.ndim == 3:
        # (n_samples, n_features, n_outputs) — pick last column (Attack).
        arr = arr[:, :, -1]
    return arr


def _format_top(values_row: np.ndarray, top_k: int) -> dict:
    abs_vals = np.abs(values_row)
    top_idx = np.argsort(abs_vals)[::-1][:top_k]
    top_features = [
        {"feature": FEATURE_COLUMNS[i], "impact": float(values_row[i])}
        for i in top_idx
    ]
    return {
        "top_features": top_features,
        "feature_importance_values": [float(values_row[i]) for i in top_idx],
    }


def explain_sample(explainer: ExplainerBundle | None, x_scaled: np.ndarray, top_k: int = 5) -> dict:
    if explainer is None:
        return {"top_features": [], "feature_importance_values": []}
    try:
        raw = explainer.explainer.shap_values(x_scaled)
        values = _shap_values_for_attack(raw, explainer.kind)
        return _format_top(values[0], top_k)
    except Exception:
        return {"top_features": [], "feature_importance_values": []}


def explain_batch(
    explainer: ExplainerBundle | None,
    X_scaled: np.ndarray,
    top_k: int = 5,
) -> list[dict]:
    if explainer is None or len(X_scaled) == 0:
        return [{"top_features": [], "feature_importance_values": []} for _ in range(len(X_scaled))]
    try:
        raw = explainer.explainer.shap_values(X_scaled)
        values = _shap_values_for_attack(raw, explainer.kind)
        return [_format_top(values[i], top_k) for i in range(values.shape[0])]
    except Exception:
        return [{"top_features": [], "feature_importance_values": []} for _ in range(len(X_scaled))]
