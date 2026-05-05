import pandas as pd
import pickle
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.ensemble import RandomForestClassifier

columns = [
    "duration","protocol_type","service","flag","src_bytes","dst_bytes",
    "land","wrong_fragment","urgent","hot","num_failed_logins",
    "logged_in","num_compromised","root_shell","su_attempted","num_root",
    "num_file_creations","num_shells","num_access_files","num_outbound_cmds",
    "is_host_login","is_guest_login","count","srv_count","serror_rate",
    "srv_serror_rate","rerror_rate","srv_rerror_rate","same_srv_rate",
    "diff_srv_rate","srv_diff_host_rate","dst_host_count",
    "dst_host_srv_count","dst_host_same_srv_rate","dst_host_diff_srv_rate",
    "dst_host_same_src_port_rate","dst_host_srv_diff_host_rate",
    "dst_host_serror_rate","dst_host_srv_serror_rate",
    "dst_host_rerror_rate","dst_host_srv_rerror_rate","label","difficulty"
]

def load_escaped_tab_file(path):
    raw = pd.read_csv(path, header=None)
    split_rows = raw[0].str.split(r"\\t", expand=True)
    split_rows.columns = columns
    return split_rows

train_df = pd.read_csv("backend/data/KDDTrain+.txt", names=columns)
test_df = pd.read_csv("backend/data/KDDTest+.txt", names=columns)

train_df["label"] = train_df["label"].apply(lambda x: 0 if x == "normal" else 1)
test_df["label"] = test_df["label"].apply(lambda x: 0 if x == "normal" else 1)

categorical_cols = ["protocol_type", "service", "flag"]

encoders = {}
for col in categorical_cols:
    le = LabelEncoder()
    combined = pd.concat([train_df[col], test_df[col]])
    le.fit(combined)
    train_df[col] = le.transform(train_df[col])
    test_df[col] = le.transform(test_df[col])
    encoders[col] = le

X_train = train_df.drop(["label", "difficulty"], axis=1).astype(float)
y_train = train_df["label"]

X_test = test_df.drop(["label", "difficulty"], axis=1).astype(float)
y_test = test_df["label"]

scaler = StandardScaler()
X_train = scaler.fit_transform(X_train)
X_test = scaler.transform(X_test)

model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

accuracy = model.score(X_test, y_test)
print(f"Model Accuracy: {accuracy * 100:.2f}%")

with open("backend/models/model.pkl", "wb") as f:
    pickle.dump(model, f)

with open("backend/models/scaler.pkl", "wb") as f:
    pickle.dump(scaler, f)

with open("backend/models/encoders.pkl", "wb") as f:
    pickle.dump(encoders, f)

print("Model, scaler, and encoders saved successfully.")