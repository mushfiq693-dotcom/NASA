import React, { useState, useEffect, useMemo } from 'react';
import { Scatter, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  CategoryScale,
  BarElement,
  Filler
} from 'chart.js';
import './Lab.css';

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend, CategoryScale, BarElement, Filler);

interface BaselineModel {
  id: string;
  name: string;
  code: string;
  description: string;
  pearson_r: number;
  rmse: number;
  bias_pct: number;
  willmott_d: number;
  scaleFactor: number;
}

const BASELINES: BaselineModel[] = [
  {
    id: 'B0',
    name: 'Raw Sensor Concatenation',
    code: 'B0: Raw Uncalibrated',
    description: 'Direct concatenation showing severe discontinuity (+210% jump) at 2012 VIIRS introduction.',
    pearson_r: 0.68,
    rmse: 18.4,
    bias_pct: 210.0,
    willmott_d: 0.72,
    scaleFactor: 3.2
  },
  {
    id: 'B1',
    name: 'Global Scale Ratio',
    code: 'B1: Global Scaling',
    description: 'Single global scalar multiplier (0.35×) applied uniformly across all regions and seasons.',
    pearson_r: 0.78,
    rmse: 9.2,
    bias_pct: 42.0,
    willmott_d: 0.81,
    scaleFactor: 1.8
  },
  {
    id: 'B2',
    name: 'Context-Specific Ratio',
    code: 'B2: Context Ratio',
    description: 'Stratified scaling per season (Kharif/Rabi), scan angle, and day/night overpass conditions.',
    pearson_r: 0.86,
    rmse: 6.5,
    bias_pct: 18.0,
    willmott_d: 0.89,
    scaleFactor: 1.35
  },
  {
    id: 'B3',
    name: 'Log-Linear Multi-Parameter',
    code: 'B3: Log-Linear Reg',
    description: 'log(1 + MODIS) ~ log(1 + VIIRS) + log(1 + FRP) + geometry track/scan terms.',
    pearson_r: 0.90,
    rmse: 5.1,
    bias_pct: 7.2,
    willmott_d: 0.92,
    scaleFactor: 1.15
  },
  {
    id: 'B4',
    name: 'Empirical Quantile Mapping',
    code: 'B4: Quantile Mapping',
    description: 'Non-parametric CDF matching across 100 empirical quantiles per seasonal window.',
    pearson_r: 0.925,
    rmse: 4.4,
    bias_pct: 3.5,
    willmott_d: 0.95,
    scaleFactor: 1.06
  },
  {
    id: 'B5',
    name: 'Two-Stage Quantile Regression Forest',
    code: 'B5: QRF + HFAI (Selected)',
    description: 'Hurdle model (zero-inflation occurrence classifier + intensity regressor) with 95% uncertainty bounds.',
    pearson_r: 0.942,
    rmse: 3.82,
    bias_pct: 1.84,
    willmott_d: 0.968,
    scaleFactor: 1.0
  }
];

export const Lab: React.FC = () => {
  const [selectedBaselineIdx, setSelectedBaselineIdx] = useState<number>(5); // default B5
  const [spatialScale, setSpatialScale] = useState<'1km' | '5km' | '10km'>('1km');
  const [isAutoStepping, setIsAutoStepping] = useState(false);

  const activeBaseline = BASELINES[selectedBaselineIdx];

  // Auto Stepper Timer B0 -> B5
  useEffect(() => {
    if (!isAutoStepping) return;
    const interval = setInterval(() => {
      setSelectedBaselineIdx(prev => (prev + 1) % BASELINES.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [isAutoStepping]);

  // Generate Scatter Points dynamically based on active baseline's scaleFactor (Morphing)
  const scatterPoints = useMemo(() => {
    const rawSeeds = [
      { modis: 5, viirsRaw: 18 },
      { modis: 12, viirsRaw: 38 },
      { modis: 18, viirsRaw: 58 },
      { modis: 24, viirsRaw: 74 },
      { modis: 32, viirsRaw: 98 },
      { modis: 45, viirsRaw: 140 },
      { modis: 52, viirsRaw: 165 },
      { modis: 64, viirsRaw: 205 },
      { modis: 78, viirsRaw: 245 },
      { modis: 88, viirsRaw: 280 },
      { modis: 95, viirsRaw: 310 },
      { modis: 8, viirsRaw: 26 },
      { modis: 15, viirsRaw: 46 },
      { modis: 28, viirsRaw: 88 },
      { modis: 40, viirsRaw: 125 },
      { modis: 60, viirsRaw: 190 },
      { modis: 70, viirsRaw: 220 },
      { modis: 82, viirsRaw: 260 },
      { modis: 90, viirsRaw: 290 },
      { modis: 20, viirsRaw: 62 }
    ];

    const sf = activeBaseline.scaleFactor;
    return rawSeeds.map(pt => {
      // Morph between raw VIIRS and calibrated MODIS-equivalent value
      const calibrated = pt.modis + (pt.viirsRaw - pt.modis) * ((sf - 1) / 2.2);
      return { x: pt.modis, y: Math.max(0, Math.round(calibrated * 10) / 10) };
    });
  }, [activeBaseline]);

  const scatterData = {
    datasets: [
      {
        label: `Calibrated Scatter (${activeBaseline.id})`,
        data: scatterPoints,
        backgroundColor: activeBaseline.id === 'B5' ? 'rgba(184, 134, 11, 0.85)' : 'rgba(168, 50, 38, 0.75)',
        borderColor: activeBaseline.id === 'B5' ? '#B8860B' : '#A83226',
        pointRadius: 5,
        pointHoverRadius: 8,
      },
      {
        label: '1:1 Ideal Harmonization Line',
        data: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
        type: 'line' as const,
        borderColor: 'rgba(26, 26, 26, 0.35)',
        borderDash: [6, 6],
        pointRadius: 0,
        fill: false,
      }
    ]
  };

  // Monthly Directional Bias Data
  const monthlyBiasValues = useMemo(() => {
    if (activeBaseline.id === 'B0') {
      return [45, 60, 120, 90, 30, 10, 5, 8, 15, 25, 35, 50];
    } else if (activeBaseline.id === 'B1') {
      return [18, 24, 48, 36, 12, 4, 2, 3, 6, 10, 14, 20];
    } else if (activeBaseline.id === 'B2') {
      return [8, 11, 22, 16, 5, 2, 1, 1, 3, 4, 6, 9];
    } else if (activeBaseline.id === 'B3') {
      return [4, 5, 9, 7, 2, 1, 0, 0, 1, 2, 3, 4];
    } else if (activeBaseline.id === 'B4') {
      return [2, 2, 4, 3, 1, 0, 0, 0, 1, 1, 1, 2];
    }
    // B5 (QRF)
    return [1.2, 1.4, 2.1, 1.8, 0.8, 0.2, 0.1, 0.3, 0.6, 0.9, 1.1, 1.3];
  }, [activeBaseline]);

  const biasData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    datasets: [
      {
        label: `${activeBaseline.code} Absolute Bias (%)`,
        data: monthlyBiasValues,
        backgroundColor: activeBaseline.id === 'B5' ? 'rgba(184, 134, 11, 0.85)' : 'rgba(168, 50, 38, 0.75)',
        borderColor: activeBaseline.id === 'B5' ? '#B8860B' : '#A83226',
        borderWidth: 1,
        borderRadius: 4
      }
    ]
  };

  // Spatial Scale Sensitivity Data (1km, 5km, 10km)
  const sensitivityData = useMemo(() => {
    const scaleFactorMap = {
      '1km': { r: 0.942, rmse: 3.82, pbias: 1.84, willmott: 0.968 },
      '5km': { r: 0.956, rmse: 2.95, pbias: 1.42, willmott: 0.975 },
      '10km': { r: 0.968, rmse: 2.14, pbias: 0.98, willmott: 0.984 }
    };
    const currentMetrics = scaleFactorMap[spatialScale];

    return {
      labels: ['Pearson r (×100)', 'RMSE (Counts/Grid)', '|PBIAS| (%)', 'Willmott d (×100)'],
      datasets: [
        {
          label: `${spatialScale.toUpperCase()} Analysis Grid Metrics`,
          data: [currentMetrics.r * 100, currentMetrics.rmse, currentMetrics.pbias, currentMetrics.willmott * 100],
          backgroundColor: ['#B8860B', '#D4A84B', '#A83226', '#E6A123'],
          borderRadius: 4
        }
      ]
    };
  }, [spatialScale]);

  return (
    <div className="lab-container">
      {/* Header */}
      <header className="lab-header">
        <span className="scene-tag">HARMONIZATION BENCHMARK & CALIBRATION SUITE</span>
        <h1>Sensor Harmonization & Model Evolution Lab</h1>
        <p className="lab-subtitle">
          Step through historical model baselines (B0 → B5) to inspect how the 2012 VIIRS sensor discontinuity is resolved via Quantile Regression Forests.
        </p>
      </header>

      {/* Signature Before/After Stepper Bar (Spec Section 6) */}
      <div className="baseline-stepper-bar">
        <div className="stepper-controls">
          <button
            className="stepper-btn"
            onClick={() => setSelectedBaselineIdx(Math.max(0, selectedBaselineIdx - 1))}
            disabled={selectedBaselineIdx === 0}
          >
            ◀ Previous Model
          </button>
          <button
            className={`auto-step-btn ${isAutoStepping ? 'active' : ''}`}
            onClick={() => setIsAutoStepping(!isAutoStepping)}
          >
            {isAutoStepping ? '⏸ PAUSE STEPPER' : '▶ AUTO-PLAY (B0 → B5)'}
          </button>
          <button
            className="stepper-btn"
            onClick={() => setSelectedBaselineIdx(Math.min(BASELINES.length - 1, selectedBaselineIdx + 1))}
            disabled={selectedBaselineIdx === BASELINES.length - 1}
          >
            Next Model ▶
          </button>
        </div>

        {/* Model Steps Selector Tabs */}
        <div className="stepper-tabs">
          {BASELINES.map((model, idx) => (
            <button
              key={model.id}
              className={`model-tab ${selectedBaselineIdx === idx ? 'active' : ''} ${model.id === 'B5' ? 'champion' : ''}`}
              onClick={() => {
                setIsAutoStepping(false);
                setSelectedBaselineIdx(idx);
              }}
            >
              <span className="tab-id">{model.id}</span>
              <span className="tab-name">{model.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Active Model KPI Metrics HUD */}
      <div className="model-kpi-hud">
        <div className="kpi-card">
          <span className="kpi-label">PEARSON CORRELATION (r)</span>
          <div className="kpi-value text-cyan">
            {activeBaseline.pearson_r}
            <span className="kpi-target">Target: ≥ 0.92</span>
          </div>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">ROOT MEAN SQ ERROR (RMSE)</span>
          <div className="kpi-value text-orange">
            {activeBaseline.rmse} <span className="kpi-unit">counts</span>
            <span className="kpi-target">Target: ≤ 4.1</span>
          </div>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">PERCENT BIAS (|PBIAS|)</span>
          <div className="kpi-value text-red">
            {activeBaseline.bias_pct}%
            <span className="kpi-target">Target: ≤ 2.5%</span>
          </div>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">WILLMOTT AGREEMENT (d)</span>
          <div className="kpi-value text-yellow">
            {activeBaseline.willmott_d}
            <span className="kpi-target">Target: ≥ 0.95</span>
          </div>
        </div>
      </div>

      {/* Main Charts Grid */}
      <div className="lab-grid">
        
        {/* Scatter Plot Card with Point Morphing */}
        <div className="lab-card scatter-card">
          <div className="card-header-row">
            <div>
              <h3>Interactive Scatter Calibration · {activeBaseline.name}</h3>
              <p className="card-desc">
                {activeBaseline.description} Points dynamically morph along the Y-axis as baseline adjustments are calibrated against the 1:1 reference line.
              </p>
            </div>
            <span className="badge-model">{activeBaseline.id} ACTIVE</span>
          </div>
          <div className="chart-wrapper">
            <Scatter
              data={scatterData as any}
              options={{
                maintainAspectRatio: false,
                animation: { duration: 700, easing: 'easeOutQuart' },
                scales: {
                  x: {
                    title: { display: true, text: 'MODIS Collocated Detections (1 km)', color: '#FFFFFF', font: { family: "'Source Sans 3', sans-serif", size: 12, weight: 600 } },
                    grid: { color: 'rgba(255, 255, 255, 0.08)' },
                    ticks: { color: '#94A3B8', font: { family: "'IBM Plex Mono', monospace", size: 10 } },
                    max: 120
                  },
                  y: {
                    title: { display: true, text: `${activeBaseline.code} Calibrated Value`, color: '#FFFFFF', font: { family: "'Source Sans 3', sans-serif", size: 12, weight: 600 } },
                    grid: { color: 'rgba(255, 255, 255, 0.08)' },
                    ticks: { color: '#94A3B8', font: { family: "'IBM Plex Mono', monospace", size: 10 } },
                    max: 150
                  }
                },
                plugins: {
                  legend: { labels: { color: '#FFFFFF', font: { family: "'Source Sans 3', sans-serif", size: 12 } } }
                }
              }}
            />
          </div>
        </div>

        {/* Monthly Directional Bias Bar Card */}
        <div className="lab-card bias-card">
          <h3>Monthly Stratification Bias</h3>
          <p className="card-desc">
            Calibration residual bias across 12 calendar months under {activeBaseline.name}.
          </p>
          <div className="chart-wrapper">
            <Bar
              data={biasData}
              options={{
                maintainAspectRatio: false,
                animation: { duration: 600 },
                scales: {
                  x: { grid: { color: 'rgba(255, 255, 255, 0.08)' }, ticks: { color: '#94A3B8', font: { family: "'IBM Plex Mono', monospace", size: 10 } } },
                  y: {
                    title: { display: true, text: 'Absolute Bias (%)', color: '#FFFFFF', font: { family: "'Source Sans 3', sans-serif", size: 12, weight: 600 } },
                    grid: { color: 'rgba(255, 255, 255, 0.08)' },
                    ticks: { color: '#94A3B8', font: { family: "'IBM Plex Mono', monospace", size: 10 } }
                  }
                },
                plugins: { legend: { display: false } }
              }}
            />
          </div>
        </div>

        {/* Spatial Grid Scale Sensitivity Tabs Card */}
        <div className="lab-card sensitivity-card">
          <div className="card-header-row">
            <div>
              <h3>Spatial Scale Sensitivity</h3>
              <p className="card-desc">
                Harmonization stability tested across 1 km (primary), 5 km, and 10 km grid resolutions.
              </p>
            </div>
            <div className="scale-tabs">
              {(['1km', '5km', '10km'] as const).map(scale => (
                <button
                  key={scale}
                  className={`scale-tab ${spatialScale === scale ? 'active' : ''}`}
                  onClick={() => setSpatialScale(scale)}
                >
                  {scale.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="chart-wrapper">
            <Bar
              data={sensitivityData}
              options={{
                maintainAspectRatio: false,
                animation: { duration: 500 },
                scales: {
                  x: { grid: { color: 'rgba(255, 255, 255, 0.08)' }, ticks: { color: '#94A3B8', font: { family: "'IBM Plex Mono', monospace", size: 10 } } },
                  y: { grid: { color: 'rgba(255, 255, 255, 0.08)' }, ticks: { color: '#94A3B8', font: { family: "'IBM Plex Mono', monospace", size: 10 } }, max: 110 }
                },
                plugins: { legend: { display: false } }
              }}
            />
          </div>
        </div>

      </div>
    </div>
  );
};
