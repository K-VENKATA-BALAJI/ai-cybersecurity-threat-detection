"""Training pipeline for the AI Cybersecurity Threat Detection Dashboard.

Trains:
  * A Random Forest classifier (kept for fast fallback inference)
  * A Keras Dense Neural Network (the primary upgraded model)

Both models share preprocessing (LabelEncoders + StandardScaler). A small
SHAP background sample is also persisted so the API can build a DeepExplainer
without recomputing it on every startup.

Outputs (under ``backend/models/``):
    model.pkl              Random Forest
    dnn_model.keras        Keras Deep Neural Network
    scaler.pkl             Shared StandardScaler
    encoders.pkl           Categorical LabelEncoders
    shap_background.npy    Background sample for SHAP DeepExplainer
"""
from __future__ import annotations

import os
import pickle

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from sklearn.preprocessing import LabelEncoder, StandardScaler

DATA_DIR = os.path.join("backend", "data")
MODELS_DIR = os.path.join("backend", "models")
os.makedirs(MODELS_DIR, exist_ok=True)

COLUMNS = [
    "duration", "protocol_type", "service", "flag", "src_bytes", "dst_bytes",
    "land", "wrong_fragment", "urgent", "hot", "num_failed_logins",
    "logged_in", "num_compromised", "root_shell", "su_attempted", "num_root",
    "num_file_creations", "num_shells", "num_access_files", "num_outbound_cmds",
    "is_host_login", "is_guest_login", "count", "srv_count", "serror_rate",
    "srv_serror_rate", "rerror_rate", "srv_rerror_rate", "same_srv_rate",
    "diff_srv_rate", "srv_diff_host_rate", "dst_host_count",
    "dst_host_srv_count", "dst_host_same_srv_rate", "dst_host_diff_srv_rate",
    "dst_host_same_src_port_rate", "dst_host_srv_diff_host_rate",
    "dst_host_serror_rate", "dst_host_srv_serror_rate",
    "dst_host_rerror_rate", "dst_host_srv_rerror_rate", "label", "difficulty",
]
CATEGORICAL_COLS = ["protocol_type", "service", "flag"]


def _print_metrics(name: str, y_true, y_pred) -> None:
    acc = accuracy_score(y_true, y_pred)
    prec = precision_score(y_true, y_pred, zero_division=0)
    rec = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    print(f"\n[{name}]")
    print(f"  Accuracy : {acc * 100:.2f}%")
    print(f"  Precision: {prec * 100:.2f}%")
    print(f"  Recall   : {rec * 100:.2f}%")
    print(f"  F1 Score : {f1 * 100:.2f}%")


def main() -> None:
    print("Loading datasets...")
    train_df = pd.read_csv(os.path.join(DATA_DIR, "KDDTrain+.txt"), names=COLUMNS)
    test_df = pd.read_csv(os.path.join(DATA_DIR, "KDDTest+.txt"), names=COLUMNS)

    train_df["label"] = train_df["label"].apply(lambda x: 0 if x == "normal" else 1)
    test_df["label"] = test_df["label"].apply(lambda x: 0 if x == "normal" else 1)

    encoders: dict[str, LabelEncoder] = {}
    for col in CATEGORICAL_COLS:
        le = LabelEncoder()
        combined = pd.concat([train_df[col], test_df[col]]).astype(str)
        le.fit(combined)
        train_df[col] = le.transform(train_df[col].astype(str))
        test_df[col] = le.transform(test_df[col].astype(str))
        encoders[col] = le

    X_train = train_df.drop(["label", "difficulty"], axis=1).astype(float).values
    y_train = train_df["label"].values
    X_test = test_df.drop(["label", "difficulty"], axis=1).astype(float).values
    y_test = test_df["label"].values

    scaler = StandardScaler()
    X_train = scaler.fit_transform(X_train)
    X_test = scaler.transform(X_test)

    # ----- Random Forest -----
    print("\nTraining Random Forest...")
    rf = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
    rf.fit(X_train, y_train)
    rf_preds = rf.predict(X_test)
    _print_metrics("Random Forest", y_test, rf_preds)

    # ----- Keras Deep Neural Network -----
    print("\nTraining Keras Dense Neural Network...")
    # Local imports keep the script usable when TensorFlow is absent.
    import tensorflow as tf
    from tensorflow.keras import layers, models, callbacks

    tf.random.set_seed(42)
    np.random.seed(42)

    n_features = X_train.shape[1]
    dnn = models.Sequential([
        layers.Input(shape=(n_features,)),
        layers.Dense(128, activation="relu"),
        layers.Dropout(0.3),
        layers.Dense(64, activation="relu"),
        layers.Dropout(0.2),
        layers.Dense(32, activation="relu"),
        layers.Dense(1, activation="sigmoid"),
    ])
    dnn.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
        loss="binary_crossentropy",
        metrics=["accuracy"],
    )

    dnn.fit(
        X_train, y_train,
        validation_split=0.1,
        epochs=15,
        batch_size=512,
        verbose=2,
        callbacks=[callbacks.EarlyStopping(monitor="val_loss", patience=3, restore_best_weights=True)],
    )

    dnn_proba = dnn.predict(X_test, verbose=0).reshape(-1)
    dnn_preds = (dnn_proba >= 0.5).astype(int)
    _print_metrics("Deep Neural Network", y_test, dnn_preds)

    # ----- Persistence -----
    with open(os.path.join(MODELS_DIR, "model.pkl"), "wb") as f:
        pickle.dump(rf, f)
    with open(os.path.join(MODELS_DIR, "scaler.pkl"), "wb") as f:
        pickle.dump(scaler, f)
    with open(os.path.join(MODELS_DIR, "encoders.pkl"), "wb") as f:
        pickle.dump(encoders, f)
    dnn.save(os.path.join(MODELS_DIR, "dnn_model.keras"))

    # SHAP background — small representative sample for DeepExplainer.
    rng = np.random.default_rng(42)
    background_idx = rng.choice(len(X_train), size=min(100, len(X_train)), replace=False)
    np.save(os.path.join(MODELS_DIR, "shap_background.npy"), X_train[background_idx])

    print("\nAll artifacts saved to backend/models/.")


if __name__ == "__main__":
    main()
