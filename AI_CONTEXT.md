# AI_CONTEXT.md — Project Brief for AI Assistants

> Read this file end-to-end before reasoning about, modifying, or extending the
> project. It captures architecture, data flow, dependencies, and conventions
> that are not obvious from any single source file.

---

## 1. One-line summary

A full-stack web application that detects network intrusions in real time:
a FastAPI backend serves predictions from an ML model trained on the
**NSL-KDD** dataset, and a React/Vite dashboard lets users either submit a
single packet (41 numeric features) or upload a CSV for bulk analysis. Each
prediction comes with a confidence score, a severity rating, recommended
mitigation actions, and a **SHAP explanation** of which features pushed the
classifier towards Attack vs. Normal.

The project is inspired by the bundled paper
*AI for Cybersecurity Threat Detection: A Machine-Enabled Computing Perspective*
(`AI_for_Cybersecurity_Threat_Detection_A_Machine_Enabled_Computing_Perspective.pdf`).

---

## 2. High-level architecture

```
┌────────────────────┐     HTTP (JSON / multipart)     ┌─────────────────────────┐
│  React + Vite UI   │  ───────────────────────────►  │  FastAPI (uvicorn)       │
│  frontend/         │                                 │  backend/main.py         │
│  - Manual tab      │  ◄───────────────────────────  │   ├─ /predict            │
│  - Bulk CSV tab    │     prediction + SHAP top-5    │   ├─ /predict-csv        │
└────────────────────┘                                 │   └─ /                  │
                                                       └────────────┬────────────┘
                                                                    │
                                          load at startup           ▼
                                              ┌──────────────────────────────────┐
                                              │ backend/models/                   │
                                              │   model.pkl       (RandomForest)  │
                                              │   dnn_model.keras (Keras DNN)     │
                                              │   scaler.pkl      (StandardScaler)│
                                              │   encoders.pkl    (LabelEncoders) │
                                              │   shap_background.npy             │
                                              └──────────────────────────────────┘
                                                                    ▲
                                                       trained by   │
                                                                    │
                                              ┌──────────────────────────────────┐
                                              │ backend/data/                     │
                                              │   KDDTrain+.txt                   │
                                              │   KDDTest+.txt                    │
                                              │   sample_test.csv                 │
                                              └──────────────────────────────────┘
```

* **Process model**: backend and frontend run as **two independent processes**.
  No build step couples them; the React app calls the API at
  `http://127.0.0.1:8000` (hard-coded as `API_BASE` in `frontend/src/App.jsx`).
* **State**: stateless API. Models and the SHAP explainer are loaded **once**
  at startup (`load_inference_bundle()` + `build_explainer()` in `main.py`).
* **CORS**: `allow_origins=["*"]` for development convenience.

---

## 3. Dataset and features

### NSL-KDD

* Files: `backend/data/KDDTrain+.txt`, `backend/data/KDDTest+.txt`.
* CSV-style, comma-separated, **no header**. Column order is the canonical
  NSL-KDD layout (43 columns — 41 features + `label` + `difficulty`).
* `label` is a multi-class string (`normal`, `neptune`, `smurf`, …). The
  pipeline collapses it to **binary**: `0 = normal`, `1 = anything else`.
* `difficulty` is dropped during training.

### The 41 input features

Defined once in `backend/utils/feature_columns.py` and reused by
`main.py` and `train_model.py`. The same list, in the same order, is what the
frontend expects users to paste in the Manual tab.

* **38 numeric** features (counts, rates, byte sizes…).
* **3 categorical** features — `protocol_type`, `service`, `flag` — encoded
  via `sklearn.preprocessing.LabelEncoder` fit on the **union** of train+test
  values (so test labels never produce unseen-class errors).

### Preprocessing contract

Anything that hits the model must be transformed in this order:
1. Categorical columns → integer codes via the saved `LabelEncoder`s.
   Unknown values fall back to `encoder.classes_[0]` (first known class).
2. All 41 columns cast to `float`.
3. `StandardScaler.transform` from the saved `scaler.pkl`.

The `/predict` endpoint accepts already-numeric features (no encoding step),
because users paste numbers directly. `/predict-csv` performs the full
encode-then-scale pipeline.

---

## 4. Models

The pipeline trains and persists **two** models. The API prefers the DNN if
its file exists, otherwise falls back to the Random Forest.

### Random Forest (`backend/models/model.pkl`)
* `RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)`.
* Fast, robust baseline. SHAP via `TreeExplainer` (cheap, exact).

### Keras Deep Neural Network (`backend/models/dnn_model.keras`)
* Sequential dense network: `Input(41) → Dense 128 ReLU → Dropout 0.3 →
  Dense 64 ReLU → Dropout 0.2 → Dense 32 ReLU → Dense 1 Sigmoid`.
* Adam optimizer (lr 1e-3), `binary_crossentropy`, 15 epochs, batch 512,
  10% validation split, `EarlyStopping(patience=3, restore_best_weights=True)`.
* SHAP via `DeepExplainer` with a **100-row background sample**
  (`shap_background.npy`). If `DeepExplainer` fails (TF version mismatch),
  the code degrades to `KernelExplainer` (slower but version-agnostic).

### Inference bundle (`backend/utils/model_loader.py`)
A small dataclass `InferenceBundle` wraps `model`, `model_kind` (`"dnn"` or
`"rf"`), `scaler`, `encoders`, and the SHAP `background` array. It exposes
`predict_proba` and `predict` so the rest of the code is model-agnostic.

---

## 5. SHAP explainability (`backend/utils/explainer.py`)

* Built once at startup (`build_explainer(bundle)`).
* `_shap_values_for_attack` normalises the various SHAP output shapes
  (list-per-class, 3-D arrays, 2-D arrays) to a single
  `(n_samples, n_features)` matrix for the **Attack** class. This is the
  trickiest part of the explainability layer — handle with care when
  upgrading SHAP.
* `explain_sample` / `explain_batch` return the **top-K** features by
  absolute SHAP value, each as `{"feature": str, "impact": float}`.
  Positive `impact` ⇒ pushes towards **Attack**; negative ⇒ towards Normal.
* Failure mode: every layer (`build_explainer`, `explain_sample`,
  `explain_batch`) wraps SHAP calls in `try/except` and returns empty lists
  on failure — the API never breaks because of an explainer error.

---

## 6. Severity & automated response

* `backend/utils/severity.py` → `calculate_severity(prediction, confidence)`:
  - `Normal` → `Informational`
  - `Attack` & `confidence ≥ 85` → `High`
  - `Attack` & `confidence ≥ 60` → `Medium`
  - `Attack` & `confidence <  60` → `Low`
* `backend/utils/response.py` maps severity → list of recommended actions
  (e.g. *Isolate host*, *Block source IP*, *Escalate to SOC*).

These two helpers are pure functions — easy to unit-test, easy to extend
(e.g. plug in IP-reputation lookups in `recommended_actions`).

---

## 7. API contract (`backend/main.py`)

### `GET /`
Returns `{ "status": "running", "model": "dnn"|"rf", "explainer": "tree"|"deep"|"kernel"|"unavailable" }`.
Useful for the frontend status indicator and as a health probe.

### `POST /predict`
Body: `{"features": [<exactly 41 floats>]}`.
Validates length, scales, predicts, builds a SHAP explanation, returns:

```json
{
  "prediction": "Attack" | "Normal",
  "confidence": 92.41,                  // % chance of Attack
  "severity":   "High" | "Medium" | "Low" | "Informational",
  "recommended_action": ["...", "..."],
  "top_features": [
    {"feature": "src_bytes", "impact":  0.18},
    {"feature": "count",     "impact": -0.07}
  ],
  "feature_importance_values": [0.18, -0.07, ...]
}
```

### `POST /predict-csv`
Multipart upload, field name `file`. CSV must contain all 41 NSL-KDD feature
columns (header required). Extra columns are ignored. Returns:

```json
{
  "results": [ /* same shape as /predict, one entry per row */ ],
  "model":   "dnn" | "rf"
}
```

Errors are surfaced as `HTTPException(400)` with a human-readable `detail`.

### Import shim
`main.py` tries `from backend.utils import …` first (works when uvicorn is
launched from the **project root**, e.g. `uvicorn backend.main:app`), and
falls back to `from utils import …` after adjusting `sys.path` (works when
launched from inside `backend/`). Don’t remove this — both run modes are in use.

---

## 8. Frontend (`frontend/`)

* **Stack**: Vite 8, React 19, Axios, Recharts. ESLint with React Hooks +
  React Refresh plugins.
* **Single-page**: `frontend/src/App.jsx` is the entire UI (~680 lines).
  No routing.
* **Two tabs**, both rendered inside `App`:
  - `ManualPredictionTab` — textarea for 41 comma-separated values →
    `POST /predict` → renders `ResultBadge`, `ResponsePanel`,
    `ExplainabilityPanel`.
  - `CsvPredictionTab` — drag-and-drop file picker → `POST /predict-csv` →
    renders aggregated stats (`StatCard`s), four Recharts charts (traffic
    pie, severity pie, confidence histogram, severity bar), and a results
    table with expandable rows that reveal per-row SHAP charts.
* **Visual identity**: dark "CyberShield AI" theme. All colours/animations
  in `App.css`. Severity colour map is mirrored on both client and server
  (`SEVERITY_COLORS` in `App.jsx`).
* **API base URL**: `const API_BASE = 'http://127.0.0.1:8000'` near the top
  of `App.jsx`. Single source of truth — change it for non-default deployments.

---

## 9. Conventions and gotchas

* **Working directory matters.** `train_model.py` and `model_loader.py` use
  paths like `os.path.join("backend", "models")`. Always run scripts and the
  uvicorn server from the **project root**.
* **Feature order is sacred.** The 41 features are passed positionally
  through scaling and the model. Any change to `FEATURE_COLUMNS` requires
  retraining and re-saving every artifact in `backend/models/`.
* **Two model files, one scaler.** RF and DNN share the same `scaler.pkl`
  and `encoders.pkl` because `train_model.py` produces both in one run.
  Don’t retrain only one — keep them in sync.
* **SHAP is optional at runtime.** Missing/broken SHAP returns
  `top_features: []`. Don’t treat empty top-features as an error in the UI.
* **Categorical fallback.** Unknown categorical values are silently mapped
  to the first known class. This is the right behaviour for a demo, but a
  production deployment should log and surface unseen categories.
* **`venv/` is checked in by mistake-proneness.** It’s in `.gitignore`,
  so a fresh clone won’t have it — anyone setting up must create their own.
* **No tests yet.** No `pytest` suite, no frontend tests. The pure helpers
  (`severity.py`, `response.py`, `_shap_values_for_attack`) are good
  starting points if tests are added.
* **CORS is wide open.** Acceptable for a local demo; tighten
  `allow_origins` before any non-localhost deployment.

---

## 10. File-by-file map

| Path                                           | Role                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `backend/main.py`                              | FastAPI app, endpoints, response shaping                              |
| `backend/train_model.py`                       | Trains RF + DNN; persists model/scaler/encoders/SHAP background      |
| `backend/create_sample_csv.py`                 | Generates `data/sample_test.csv` (10 rows from KDDTest+) for demos    |
| `backend/requirements.txt`                     | fastapi, uvicorn, pydantic, pandas, numpy, scikit-learn, tensorflow, shap |
| `backend/data/KDDTrain+.txt`                   | NSL-KDD training set                                                  |
| `backend/data/KDDTest+.txt`                    | NSL-KDD test set                                                      |
| `backend/data/sample_test.csv`                 | Tiny demo CSV for the Bulk tab                                        |
| `backend/models/model.pkl`                     | Random Forest classifier                                              |
| `backend/models/dnn_model.keras`               | Keras DNN (preferred at inference; absent → fall back to RF)         |
| `backend/models/scaler.pkl`                    | StandardScaler shared by both models                                  |
| `backend/models/encoders.pkl`                  | LabelEncoders for `protocol_type`, `service`, `flag`                  |
| `backend/models/shap_background.npy`           | 100-row background sample for SHAP DeepExplainer                      |
| `backend/utils/__init__.py`                    | Re-exports the public helpers                                         |
| `backend/utils/feature_columns.py`             | The 41 features + categorical column names                            |
| `backend/utils/model_loader.py`                | `InferenceBundle` + `load_inference_bundle()` (DNN-preferred)         |
| `backend/utils/explainer.py`                   | `build_explainer`, `explain_sample`, `explain_batch`                  |
| `backend/utils/severity.py`                    | Confidence → severity mapping                                         |
| `backend/utils/response.py`                    | Severity → recommended actions                                        |
| `frontend/src/App.jsx`                         | Whole UI (Manual + Bulk tabs, charts, SHAP panel)                     |
| `frontend/src/App.css`                         | Dark cyber-themed styling                                             |
| `frontend/package.json`                        | React 19 + Vite + Axios + Recharts                                    |
| `frontend/vite.config.js`                      | Default Vite config with `@vitejs/plugin-react`                       |
| `AI_for_Cybersecurity_..._Perspective.pdf`     | Reference paper that inspired the project                             |
| `README.md`                                    | Human-facing setup & run instructions                                 |
| `AI_CONTEXT.md`                                | This file — context for AI assistants                                 |

---

## 11. Likely extension paths (for future work / AI suggestions)

* **Multi-class output**: drop the binary collapse in `train_model.py` and
  expose attack categories (DoS, Probe, R2L, U2R). Severity logic and the UI
  badges would need to handle the new label space.
* **Streaming / real-time mode**: a WebSocket endpoint that ingests packet
  features on a tick and pushes predictions to the dashboard.
* **Model registry**: replace the on-disk `model.pkl` / `dnn_model.keras`
  with a versioned store (MLflow, simple S3 bucket) and a `/models` admin
  endpoint to swap them at runtime.
* **Input validation**: stronger Pydantic types for `/predict` (e.g. enforce
  ranges on rate features in `[0, 1]`).
* **Auth & rate limiting**: needed before any non-local deployment.
* **Tests**: unit-test `severity.py` and `response.py`; integration-test
  `/predict` with a tiny fixture model.

---

## 12. Quick reference — running everything

```bash
# Terminal 1 — backend (project root)
python -m venv venv && source venv/bin/activate     # Windows: venv\Scripts\activate
pip install -r backend/requirements.txt
# (only if backend/models/ is empty)
python backend/train_model.py
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
# open the URL Vite prints (default http://localhost:5173)
```
