# AI Cybersecurity Threat Detection Dashboard

A full-stack web app that classifies network packets as **Normal** or **Attack**
using a Random Forest / Deep Neural Network trained on the **NSL-KDD** dataset,
with **SHAP-based explanations** and an automated-response panel.

* **Backend** — FastAPI + scikit-learn + TensorFlow/Keras + SHAP
* **Frontend** — React 19 + Vite + Recharts + Axios

---

## 1. Prerequisites

Install these on the new laptop **before** cloning:

| Tool       | Recommended version | Notes                                    |
| ---------- | ------------------- | ---------------------------------------- |
| Python     | 3.10 – 3.11         | TensorFlow 2.x does not support 3.13+    |
| Node.js    | 18+ (20 LTS ideal)  | Comes with `npm`                         |
| Git        | any                 | To clone the repo                        |

Optional: a virtual-environment tool (`venv` ships with Python).

---

## 2. Clone the repo

```bash
git clone <your-github-url> ai-cybersecurity-project
cd ai-cybersecurity-project
```

---

## 3. Backend setup

From the project root:

```bash
# Create and activate a virtual environment
python -m venv venv

# Windows (PowerShell)
venv\Scripts\Activate.ps1
# Windows (cmd)
venv\Scripts\activate.bat
# macOS / Linux
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r backend/requirements.txt
```

> The first install pulls TensorFlow and SHAP — it can take several minutes
> and a few GB of disk.

### 3a. Train the models (only if `backend/models/` is empty)

The repo ships with `model.pkl`, `scaler.pkl`, and `encoders.pkl` so you can
skip this step. If they are missing, or you want to retrain:

```bash
# from the project root
python backend/train_model.py
```

This reads `backend/data/KDDTrain+.txt` and `KDDTest+.txt` and writes:

```
backend/models/model.pkl              # Random Forest (fallback)
backend/models/dnn_model.keras        # Keras DNN  (preferred at inference)
backend/models/scaler.pkl             # StandardScaler
backend/models/encoders.pkl           # LabelEncoders
backend/models/shap_background.npy    # SHAP background sample
```

### 3b. Start the API

```bash
# from the project root (so the relative `backend/models` path resolves)
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Sanity-check it’s alive:

```bash
curl http://127.0.0.1:8000/
# => {"status":"running","model":"rf" or "dnn", ...}
```

API endpoints:

| Method | Path           | Body / params                            |
| ------ | -------------- | ---------------------------------------- |
| GET    | `/`            | health + which model is loaded           |
| POST   | `/predict`     | `{"features": [<41 floats>]}`            |
| POST   | `/predict-csv` | multipart file upload (`file=<csv>`)     |

Auto-generated docs: <http://127.0.0.1:8000/docs>

---

## 4. Frontend setup

In a **second terminal**:

```bash
cd frontend
npm install
npm run dev
```

Vite prints a local URL (default <http://localhost:5173>). Open it in a browser.

The frontend talks to the backend at `http://127.0.0.1:8000` — that constant
lives at the top of `frontend/src/App.jsx` (`API_BASE`). Change it there if
you run the backend on a different port/host.

---

## 5. Try it

* **Manual Analysis tab** — paste 41 comma-separated numbers (any row of
  `backend/data/sample_test.csv` works) and click *Analyze Packet*.
* **Bulk CSV Analysis tab** — drag-and-drop `backend/data/sample_test.csv`
  (or any CSV with the 41 NSL-KDD feature columns) and click *Run Bulk
  Analysis*.

To regenerate `sample_test.csv` from the test set:

```bash
python backend/create_sample_csv.py
```

---

## 6. Common issues

| Symptom                                            | Fix                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| `ModuleNotFoundError: backend.utils`               | Run uvicorn from the **project root**, not from inside `backend/`              |
| `FileNotFoundError: backend/models/...`            | Run `python backend/train_model.py`, or run uvicorn from the project root      |
| TensorFlow install fails on Python 3.13            | Use Python 3.10 / 3.11                                                         |
| CORS / network error in the browser                | Backend not running, or `API_BASE` in `App.jsx` does not match the API URL    |
| `shap` import error → predictions still work, no top features | Expected — the API degrades gracefully when SHAP is unavailable        |

---

## 7. Project layout

```
ai-cybersecurity-project/
├── backend/
│   ├── main.py              # FastAPI app, /predict and /predict-csv endpoints
│   ├── train_model.py       # Trains RF + DNN, persists artifacts
│   ├── create_sample_csv.py # Builds backend/data/sample_test.csv
│   ├── requirements.txt
│   ├── data/                # NSL-KDD train/test + sample CSV
│   ├── models/              # Persisted model + scaler + encoders + SHAP bg
│   └── utils/               # feature columns, severity, response, SHAP, loader
├── frontend/                # Vite + React 19 dashboard
│   ├── src/App.jsx          # Single-page UI (Manual + Bulk tabs)
│   ├── src/App.css
│   └── package.json
├── AI_CONTEXT.md            # Deep project context for AI assistants
└── README.md                # ← you are here
```

For a full conceptual walkthrough of the project (architecture, data flow,
model choices, file-by-file responsibilities), see [AI_CONTEXT.md](./AI_CONTEXT.md).
