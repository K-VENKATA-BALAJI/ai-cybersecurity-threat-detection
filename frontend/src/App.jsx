import { useState, useRef, useCallback, useMemo } from 'react'
import axios from 'axios'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import './App.css'

const API_BASE = 'http://127.0.0.1:8000'

const SEVERITY_ORDER = ['High', 'Medium', 'Low', 'Informational']
const SEVERITY_COLORS = {
  High: '#ff4757',
  Medium: '#ffa502',
  Low: '#00d4ff',
  Informational: '#00e676',
}

function Spinner() {
  return <span className="spinner"><span className="spinner-inner" /></span>
}

function StatCard({ label, value, accent, icon }) {
  return (
    <div className={`stat-card stat-card--${accent}`}>
      <div className="stat-card__icon">{icon}</div>
      <div className="stat-card__body">
        <span className="stat-card__value">{value}</span>
        <span className="stat-card__label">{label}</span>
      </div>
    </div>
  )
}

function ConfidenceBar({ value }) {
  const pct = Math.min(100, Math.round(value))
  const color = pct > 70 ? '#00e676' : pct > 40 ? '#ffa502' : '#ff4757'
  return (
    <div className="conf-bar">
      <div className="conf-bar__track">
        <div className="conf-bar__fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="conf-bar__label" style={{ color }}>{pct}%</span>
    </div>
  )
}

function SeverityBadge({ severity }) {
  if (!severity) return null
  return (
    <div className={`severity-badge severity-${String(severity).toLowerCase()}`}>
      Severity: {severity}
    </div>
  )
}

function ResultBadge({ prediction, confidence, severity }) {
  const isAttack = prediction?.toLowerCase() === 'attack'
  return (
    <div className={`result-badge result-badge--${isAttack ? 'attack' : 'normal'}`}>
      <div className="result-badge__icon">
        {isAttack ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        )}
      </div>
      <div className="result-badge__content">
        <span className="result-badge__status">
          {isAttack ? 'THREAT DETECTED' : 'TRAFFIC NORMAL'}
        </span>
        <span className="result-badge__label">{prediction}</span>
        {confidence !== undefined && <SeverityBadge severity={severity} />}
      </div>
      {confidence !== undefined && (
        <div className="result-badge__conf">
          <span className="conf-subtitle">Confidence Score</span>
          <ConfidenceBar value={confidence} />
        </div>
      )}
    </div>
  )
}

function ResponsePanel({ severity, actions }) {
  if (!actions || actions.length === 0) return null
  return (
    <div className={`response-panel response-panel--${String(severity || '').toLowerCase()}`}>
      <div className="response-panel__header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="response-panel__icon">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
        </svg>
        <div>
          <h3 className="response-panel__title">Automated Response</h3>
          <p className="response-panel__subtitle">Recommended mitigation steps for this {severity?.toLowerCase()} event</p>
        </div>
      </div>
      <ul className="response-panel__list">
        {actions.map((action, i) => (
          <li key={i} className="response-panel__item">
            <span className="response-panel__bullet" />
            {action}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ExplainabilityPanel({ topFeatures }) {
  if (!topFeatures || topFeatures.length === 0) return null

  const chartData = topFeatures.map(f => ({
    feature: f.feature,
    impact: Number(f.impact.toFixed(4)),
    abs: Math.abs(f.impact),
  }))

  return (
    <div className="explain-panel">
      <div className="explain-panel__header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="explain-panel__icon">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <div>
          <h3 className="explain-panel__title">Explainable AI (SHAP)</h3>
          <p className="explain-panel__subtitle">Top features driving this classification</p>
        </div>
      </div>

      <ul className="feature-list">
        {topFeatures.map((f, i) => (
          <li key={i} className="feature-list__item">
            <span className="feature-list__rank">#{i + 1}</span>
            <span className="feature-list__name">{f.feature}</span>
            <span
              className="feature-list__impact"
              style={{ color: f.impact >= 0 ? '#ff4757' : '#00e676' }}
            >
              {f.impact >= 0 ? '+' : ''}{f.impact.toFixed(4)}
            </span>
          </li>
        ))}
      </ul>

      <div className="explain-panel__chart">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 16, left: 8, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="feature" tick={{ fill: '#94a3b8', fontSize: 11 }} width={140} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f1f5f9', fontSize: '12px' }} />
            <Bar dataKey="impact" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.impact >= 0 ? '#ff4757' : '#00e676'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function ManualPredictionTab() {
  const [features, setFeatures] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handlePredict = async () => {
    if (!features.trim()) { setError('Please enter feature values.'); return }
    setLoading(true); setError(null); setResult(null)
    try {
      const featureArray = features.split(',').map(v => parseFloat(v.trim()))
      if (featureArray.length !== 41 || featureArray.some(isNaN)) {
        throw new Error('Enter exactly 41 valid numeric values separated by commas.')
      }
      const res = await axios.post(`${API_BASE}/predict`, { features: featureArray })
      setResult(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Prediction failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => { setFeatures(''); setResult(null); setError(null) }

  return (
    <div className="tab-panel">
      <div className="panel-header">
        <div className="panel-header__icon panel-header__icon--blue">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        </div>
        <div>
          <h2 className="panel-header__title">Manual Packet Analysis</h2>
          <p className="panel-header__subtitle">Enter 41 network packet features for real-time threat classification</p>
        </div>
      </div>

      <div className="input-group">
        <label className="input-label">
          Network Features
          <span className="input-label__badge">41 values required</span>
        </label>
        <textarea
          className="feature-input"
          value={features}
          onChange={e => setFeatures(e.target.value)}
          placeholder="0.0, 0.0, 0.0, 0.0, ..."
          rows={4}
          disabled={loading}
        />
        <p className="input-hint">Enter exactly 41 comma-separated numeric values representing network packet features.</p>
      </div>

      {error && (
        <div className="alert alert--error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="alert__icon">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </div>
      )}

      <div className="btn-row">
        <button className="btn btn--primary" onClick={handlePredict} disabled={loading}>
          {loading ? (<><Spinner /> Analyzing...</>) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              Analyze Packet
            </>
          )}
        </button>
        <button className="btn btn--ghost" onClick={handleClear} disabled={loading}>Clear</button>
      </div>

      {result && (
        <>
          <ResultBadge
            prediction={result.prediction}
            confidence={result.confidence}
            severity={result.severity}
          />
          <ResponsePanel severity={result.severity} actions={result.recommended_action} />
          <ExplainabilityPanel topFeatures={result.top_features} />
        </>
      )}
    </div>
  )
}

function CsvRow({ row, index }) {
  const [open, setOpen] = useState(false)
  const isAttack = row.prediction?.toLowerCase() === 'attack'
  const hasExplanation = row.top_features && row.top_features.length > 0

  return (
    <>
      <tr className={`csv-row csv-row--${isAttack ? 'attack' : 'normal'}`}>
        <td className="csv-row__index">{index + 1}</td>
        <td>
          <span className={`csv-row__pred csv-row__pred--${isAttack ? 'attack' : 'normal'}`}>
            {row.prediction}
          </span>
        </td>
        <td>{row.confidence?.toFixed(2)}%</td>
        <td><SeverityBadge severity={row.severity} /></td>
        <td className="csv-row__actions">
          {(row.recommended_action || []).slice(0, 1).map((a, i) => (
            <span key={i} className="csv-row__action">{a}</span>
          ))}
          {row.recommended_action && row.recommended_action.length > 1 && (
            <span className="csv-row__more">+{row.recommended_action.length - 1}</span>
          )}
        </td>
        <td className="csv-row__expand">
          <button
            className="expand-btn"
            onClick={() => setOpen(o => !o)}
            disabled={!hasExplanation && (!row.recommended_action || row.recommended_action.length === 0)}
            aria-expanded={open}
          >
            {open ? '−' : '+'}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="csv-row__detail-row">
          <td colSpan={6}>
            <div className="csv-row__detail">
              <ResponsePanel severity={row.severity} actions={row.recommended_action} />
              <ExplainabilityPanel topFeatures={row.top_features} />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function CsvPredictionTab() {
  const [file, setFile] = useState(null)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef(null)

  const handleFile = useCallback((f) => {
    if (f && f.name.endsWith('.csv')) {
      setFile(f); setResults([]); setError(null)
    } else {
      setError('Please upload a valid .csv file.')
    }
  }, [])

  const handleAnalyze = async () => {
    if (!file) { setError('Please select a CSV file.'); return }
    setLoading(true); setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await axios.post(`${API_BASE}/predict-csv`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResults(res.data.results || res.data.predictions || res.data)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'CSV processing failed.')
    } finally {
      setLoading(false)
    }
  }

  const stats = useMemo(() => {
    const attacks = results.filter(r => r.prediction?.toLowerCase() === 'attack').length
    const normal = results.length - attacks
    const avgConf = results.length
      ? results.reduce((s, r) => s + (r.confidence || 0), 0) / results.length : 0

    const sev = { High: 0, Medium: 0, Low: 0, Informational: 0 }
    results.forEach(r => {
      if (r.severity && sev[r.severity] !== undefined) sev[r.severity]++
    })
    return { attacks, normal, avgConf, sev }
  }, [results])

  const pieData = [
    { name: 'Attack', value: stats.attacks },
    { name: 'Normal', value: stats.normal },
  ].filter(d => d.value > 0)

  const severityChartData = SEVERITY_ORDER
    .map(s => ({ name: s, value: stats.sev[s] }))
    .filter(d => d.value > 0)

  const buckets = { '0–25': 0, '26–50': 0, '51–75': 0, '76–100': 0 }
  results.forEach(r => {
    const p = r.confidence || 0
    if (p <= 25) buckets['0–25']++
    else if (p <= 50) buckets['26–50']++
    else if (p <= 75) buckets['51–75']++
    else buckets['76–100']++
  })
  const barData = Object.entries(buckets).map(([range, count]) => ({ range, count }))
  const CHART_COLORS = ['#ff4757', '#00e676', '#00d4ff', '#8b5cf6']

  return (
    <div className="tab-panel">
      <div className="panel-header">
        <div className="panel-header__icon panel-header__icon--purple">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </div>
        <div>
          <h2 className="panel-header__title">Bulk CSV Analysis</h2>
          <p className="panel-header__subtitle">Upload a dataset for batch threat detection and analytics</p>
        </div>
      </div>

      <div
        className={`drop-zone${dragOver ? ' drop-zone--active' : ''}${file ? ' drop-zone--filled' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files[0])} />
        {file ? (
          <>
            <div className="drop-zone__file-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <div className="drop-zone__filename">{file.name}</div>
            <div className="drop-zone__filesize">{(file.size / 1024).toFixed(1)} KB &middot; Click to change</div>
          </>
        ) : (
          <>
            <div className="drop-zone__upload-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 16 12 12 8 16" />
                <line x1="12" y1="12" x2="12" y2="21" />
                <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
              </svg>
            </div>
            <div className="drop-zone__text">Drop CSV file here or click to browse</div>
            <div className="drop-zone__subtext">Supports .csv files</div>
          </>
        )}
      </div>

      {error && (
        <div className="alert alert--error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="alert__icon">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </div>
      )}

      <div className="btn-row">
        <button className="btn btn--primary btn--purple" onClick={handleAnalyze} disabled={loading || !file}>
          {loading ? (<><Spinner /> Processing...</>) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              </svg>
              Run Bulk Analysis
            </>
          )}
        </button>
        {file && (
          <button className="btn btn--ghost" onClick={() => { setFile(null); setResults([]); setError(null) }} disabled={loading}>
            Clear
          </button>
        )}
      </div>

      {results.length > 0 && (
        <div className="analytics-section">
          <h3 className="analytics-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            Analysis Results
          </h3>

          <div className="stats-grid">
            <StatCard label="Total Records" value={results.length} accent="blue" icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" />
                <line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
              </svg>
            } />
            <StatCard label="Threats Detected" value={stats.attacks} accent="red" icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            } />
            <StatCard label="Normal Traffic" value={stats.normal} accent="green" icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            } />
            <StatCard label="Avg Confidence" value={`${Math.round(stats.avgConf)}%`} accent="purple" icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            } />
          </div>

          <h4 className="severity-summary-title">Severity Summary</h4>
          <div className="stats-grid">
            <StatCard label="High Severity Threats" value={stats.sev.High} accent="red" icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v2m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
            } />
            <StatCard label="Medium Severity Threats" value={stats.sev.Medium} accent="orange" icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            } />
            <StatCard label="Low Severity Threats" value={stats.sev.Low} accent="blue" icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12h6l3-9 4 18 3-9h4" />
              </svg>
            } />
            <StatCard label="Informational" value={stats.sev.Informational} accent="green" icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            } />
          </div>

          <div className="charts-grid">
            <div className="chart-card">
              <h4 className="chart-title">Traffic Distribution</h4>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={65} outerRadius={100}
                    paddingAngle={4} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.name === 'Attack' ? '#ff4757' : '#00e676'} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f1f5f9', fontSize: '13px' }} />
                  <Legend wrapperStyle={{ color: '#94a3b8', fontSize: '13px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <h4 className="chart-title">Severity Distribution</h4>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={severityChartData} cx="50%" cy="50%" innerRadius={65} outerRadius={100}
                    paddingAngle={4} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}>
                    {severityChartData.map((entry, i) => (
                      <Cell key={i} fill={SEVERITY_COLORS[entry.name]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f1f5f9', fontSize: '13px' }} />
                  <Legend wrapperStyle={{ color: '#94a3b8', fontSize: '13px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <h4 className="chart-title">Confidence Distribution</h4>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={barData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="range" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f1f5f9', fontSize: '13px' }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {barData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <h4 className="chart-title">Severity Counts</h4>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={SEVERITY_ORDER.map(s => ({ name: s, count: stats.sev[s] }))}
                  margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f1f5f9', fontSize: '13px' }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {SEVERITY_ORDER.map((s, i) => (
                      <Cell key={i} fill={SEVERITY_COLORS[s]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="results-table-wrap">
            <table className="results-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Prediction</th>
                  <th>Confidence</th>
                  <th>Severity</th>
                  <th>Action</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {results.map((row, i) => (
                  <CsvRow key={i} row={row} index={i} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState('manual')

  return (
    <div className="app">
      <div className="bg-grid" aria-hidden="true" />

      <header className="header">
        <div className="header__inner">
          <div className="header__brand">
            <div className="header__logo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <div className="header__name">CyberShield AI</div>
              <div className="header__tagline">Advanced Threat Detection System</div>
            </div>
          </div>
          <div className="header__status">
            <span className="status-dot" />
            <span className="status-text">System Online</span>
          </div>
        </div>
      </header>

      <main className="main">
        <div className="container">
          <div className="tabs" role="tablist">
            <button
              className={`tab${tab === 'manual' ? ' tab--active' : ''}`}
              onClick={() => setTab('manual')}
              role="tab"
              aria-selected={tab === 'manual'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="tab__icon">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              Manual Analysis
            </button>
            <button
              className={`tab${tab === 'csv' ? ' tab--active' : ''}`}
              onClick={() => setTab('csv')}
              role="tab"
              aria-selected={tab === 'csv'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="tab__icon">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Bulk CSV Analysis
            </button>
          </div>

          {tab === 'manual' ? <ManualPredictionTab /> : <CsvPredictionTab />}
        </div>
      </main>

      <footer className="footer">
        <div className="container footer__inner">
          <span>CyberShield AI &middot; Powered by Deep Learning &amp; Explainable AI</span>
          <span>&copy; 2025 &middot; All rights reserved</span>
        </div>
      </footer>
    </div>
  )
}
