import { useState } from "react";
import axios from "axios";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const COLORS = ["#52c41a", "#ff4d4f"];

function App() {
  const [features, setFeatures] = useState("");
  const [result, setResult] = useState(null);
  const [csvResults, setCsvResults] = useState([]);
  const [file, setFile] = useState(null);

  const handlePredict = async () => {
    try {
      const featureArray = features
        .split(",")
        .map((item) => parseFloat(item.trim()));

      const response = await axios.post("http://127.0.0.1:8000/predict", {
        features: featureArray,
      });

      setResult(response.data);
    } catch {
      alert("Prediction failed.");
    }
  };

  const handleCsvUpload = async () => {
    if (!file) return alert("Select CSV file first");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await axios.post(
        "http://127.0.0.1:8000/predict-csv",
        formData
      );

      setCsvResults(response.data.results);
    } catch {
      alert("CSV upload failed.");
    }
  };

  const attackCount = csvResults.filter(r => r.prediction === "Attack").length;
  const normalCount = csvResults.filter(r => r.prediction === "Normal").length;
  const avgConfidence =
    csvResults.length > 0
      ? (
          csvResults.reduce((sum, r) => sum + r.confidence, 0) /
          csvResults.length
        ).toFixed(2)
      : 0;

  const pieData = [
    { name: "Normal", value: normalCount },
    { name: "Attack", value: attackCount },
  ];

  return (
    <div style={styles.page}>
      <div style={styles.wrapper}>
        <h1 style={styles.title}>AI Cybersecurity Threat Detection Dashboard</h1>

        <div style={styles.grid}>
          <div style={styles.card}>
            <h2>Manual Prediction</h2>
            <textarea
              rows="6"
              value={features}
              onChange={(e) => setFeatures(e.target.value)}
              placeholder="Enter 41 comma-separated features..."
              style={styles.textarea}
            />
            <button onClick={handlePredict} style={styles.button}>
              Predict Threat
            </button>

            {result && (
              <div style={styles.resultBox}>
                <p>Status: {result.prediction}</p>
                <p>Confidence: {result.confidence}%</p>
              </div>
            )}
          </div>

          <div style={styles.card}>
            <h2>CSV Bulk Prediction</h2>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files[0])}
            />
            <button onClick={handleCsvUpload} style={styles.button}>
              Upload CSV
            </button>
          </div>
        </div>

        {csvResults.length > 0 && (
          <>
            <div style={styles.analyticsGrid}>
              <div style={styles.statCard}>
                <h3>Total Records</h3>
                <p>{csvResults.length}</p>
              </div>

              <div style={styles.statCard}>
                <h3>Attacks</h3>
                <p>{attackCount}</p>
              </div>

              <div style={styles.statCard}>
                <h3>Normal</h3>
                <p>{normalCount}</p>
              </div>

              <div style={styles.statCard}>
                <h3>Avg Confidence</h3>
                <p>{avgConfidence}%</p>
              </div>
            </div>

            <div style={styles.chartGrid}>
              <div style={styles.card}>
                <h2>Attack Distribution</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" outerRadius={100}>
                      {pieData.map((entry, index) => (
                        <Cell key={index} fill={COLORS[index]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div style={styles.card}>
                <h2>Confidence Distribution</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={csvResults}>
                    <XAxis dataKey="prediction" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="confidence" fill="#2563eb" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0b1120",
    padding: "30px",
    color: "white",
  },
  wrapper: {
    maxWidth: "1400px",
    margin: "0 auto",
  },
  title: {
    textAlign: "center",
    marginBottom: "30px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
  },
  analyticsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "20px",
    marginTop: "30px",
  },
  chartGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
    marginTop: "30px",
  },
  card: {
    background: "#111827",
    padding: "20px",
    borderRadius: "16px",
  },
  statCard: {
    background: "#1e293b",
    padding: "20px",
    borderRadius: "12px",
    textAlign: "center",
  },
  textarea: {
    width: "100%",
    padding: "12px",
    margin: "15px 0",
    borderRadius: "10px",
  },
  button: {
    width: "100%",
    padding: "12px",
    background: "#2563eb",
    color: "white",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
  },
  resultBox: {
    marginTop: "15px",
  },
};

export default App;