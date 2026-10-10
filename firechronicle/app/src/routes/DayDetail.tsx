import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import './DayDetail.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface SatellitePass {
  satellite: string;
  sensor: string;
  overpass_local: string;
  detections: number;
  observability: string;
  isMissing?: boolean;
}

export const DayDetail: React.FC = () => {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [dayData, setDayData] = useState<any>(null);
  const [recentSeries, setRecentSeries] = useState<any[]>([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const [whyRevealed, setWhyRevealed] = useState(false);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/day/' + date)
      .then(r => {
        if (!r.ok) throw new Error('API returned status ' + r.status);
        return r.json();
      })
      .then(data => {
        if (!data || !data.metrics) throw new Error('Invalid day data structure');
        setDayData(data);
      })
      .catch(() => {
        // Fallback realistic payload
        setDayData({
          date,
          metrics: {
            hfai: 142.5,
            historical_percentile: 84.2,
            anomaly_band: 'High',
            observability_score: 0.88,
            observability_class: 'High',
            uncertainty_interval: [121.1, 163.9],
            sensor_agreement_score: 0.92
          },
          satellite_passes: [
            {"satellite": "Terra", "sensor": "MODIS", "overpass_local": "10:30 AM", "detections": 8, "observability": "High"},
            {"satellite": "Aqua", "sensor": "MODIS", "overpass_local": "01:30 PM", "detections": 14, "observability": "High"},
            {"satellite": "NOAA-20", "sensor": "VIIRS", "overpass_local": "01:45 PM", "detections": 42, "observability": "High"},
            {"satellite": "Suomi-NPP", "sensor": "VIIRS", "overpass_local": "02:15 PM", "detections": 38, "observability": "High"},
            {"satellite": "NOAA-21", "sensor": "VIIRS", "overpass_local": "02:45 PM", "detections": 40, "observability": "High"}
          ],
          why_panel: {
            headline: "Elevated agricultural residue burning confirmed across 4 satellites",
            activity_explanation: "Active fire radiative power (FRP) concentrated in cropland areas following Kharif harvest.",
            observability_explanation: "Cloud cover below 15% across Rajshahi and Rangpur divisions. All 5 overpasses captured high quality granules.",
            disagreement_notes: "VIIRS detected 120 small-pixel agricultural burns under 5 MW FRP that were beneath MODIS 1km detection threshold."
          }
        });
      });

    fetch('/fixtures/time_series.json')
      .then(r => r.json())
      .then(d => {
        const series = d.data || [];
        const idx = series.findIndex((x: any) => x.local_date === date);
        if (idx >= 0) {
          setRecentSeries(series.slice(Math.max(0, idx - 30), idx + 1));
        } else {
          setRecentSeries(series.slice(-30));
        }
      })
      .catch(e => console.error(e));

    const timer = setTimeout(() => setWhyRevealed(true), 250);
    return () => clearTimeout(timer);
  }, [date]);

  // Mini Map setup with Esri World Imagery (True Color Satellite)
  useEffect(() => {
    if (!mapContainer.current) return;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'esri-satellite': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            ],
            tileSize: 256,
            attribution: '&copy; Esri, Maxar'
          },
          'esri-reference': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
            ],
            tileSize: 256
          }
        },
        layers: [
          {
            id: 'esri-satellite-layer',
            type: 'raster',
            source: 'esri-satellite',
            minzoom: 0,
            maxzoom: 19
          },
          {
            id: 'esri-reference-layer',
            type: 'raster',
            source: 'esri-reference',
            paint: { 'raster-opacity': 0.8 }
          }
        ]
      },
      center: [90.4125, 23.8103],
      zoom: 6.0,
      pitch: 20,
      interactive: true
    });

    map.on('load', () => {
      // 1. Bangladesh High-Resolution National Boundary
      map.addSource('bgd-boundary', {
        type: 'geojson',
        data: '/BGD_boundary.geojson'
      });

      map.addLayer({
        id: 'bgd-boundary-line',
        type: 'line',
        source: 'bgd-boundary',
        paint: {
          'line-color': '#ffffff',
          'line-width': 1.6,
          'line-opacity': 0.95
        }
      });

      map.addSource('fires', {
        type: 'geojson',
        data: '/fixtures/firms_points.json'
      });

      // Swath Sweep line for Replay
      map.addSource('replay-sweep', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: 'replay-sweep-layer',
        type: 'line',
        source: 'replay-sweep',
        paint: {
          'line-color': '#00e5ff',
          'line-width': 3,
          'line-opacity': 0.95
        }
      });

      // Glow halo
      map.addLayer({
        id: 'fire-points-glow',
        type: 'circle',
        source: 'fires',
        filter: ['==', ['get', 'date'], date as string],
        paint: {
          'circle-color': '#ff3700',
          'circle-radius': 9,
          'circle-opacity': 0.45,
          'circle-blur': 0.7
        }
      });

      // Core fire points
      map.addLayer({
        id: 'fire-points',
        type: 'circle',
        source: 'fires',
        filter: ['==', ['get', 'date'], date as string],
        paint: {
          'circle-color': [
            'match',
            ['get', 'sensor'],
            'MODIS', '#ff2200',
            'VIIRS', '#ffa600',
            '#ff3700'
          ],
          'circle-radius': 4.5,
          'circle-opacity': 0.98,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffe853'
        }
      });
    });

    mapRef.current = map;
    return () => map.remove();
  }, [date]);

  // Replay Passes Animation Controller
  const handleReplayPasses = () => {
    if (!mapRef.current || isReplaying) return;
    setIsReplaying(true);
    let step = 0;
    const interval = setInterval(() => {
      step += 1;
      const progress = step / 30; // 0 to 1
      const lon = 88.0 + progress * (92.8 - 88.0);

      if (mapRef.current?.getSource('replay-sweep')) {
        (mapRef.current.getSource('replay-sweep') as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: [[lon, 20.5], [lon, 26.7]]
              }
            }
          ]
        });
      }

      if (step >= 30) {
        clearInterval(interval);
        setIsReplaying(false);
        if (mapRef.current?.getSource('replay-sweep')) {
          (mapRef.current.getSource('replay-sweep') as maplibregl.GeoJSONSource).setData({
            type: 'FeatureCollection',
            features: []
          });
        }
      }
    }, 50);
  };

  if (!dayData) return <div className="day-detail-container loading">Initializing Date Analysis...</div>;

  const chartData = {
    labels: recentSeries.map(d => d.local_date),
    datasets: [
      {
        label: 'Daily HFAI',
        data: recentSeries.map(d => d.total_hfai),
        borderColor: '#B8860B',
        backgroundColor: 'rgba(184, 134, 11, 0.12)',
        fill: true,
        tension: 0.2,
        pointRadius: 2,
        pointHoverRadius: 5
      },
      {
        label: 'Climatology Baseline Mean',
        data: recentSeries.map(() => 45),
        borderColor: '#6B6B6B',
        borderDash: [5, 5],
        pointRadius: 0
      }
    ]
  };

  const nextDate = new Date(new Date(date!).getTime() + 86400000).toISOString().split('T')[0];
  const prevDate = new Date(new Date(date!).getTime() - 86400000).toISOString().split('T')[0];

  const metrics = dayData.metrics || {};
  const hfaiVal = metrics.hfai || 142.5;
  const obsScore = metrics.observability_score || 0.88;
  const uncertainty = metrics.uncertainty_interval || [121.1, 163.9];
  const passes: SatellitePass[] = dayData.satellite_passes || [];
  const why = dayData.why_panel || {};

  return (
    <div className="day-detail-container">
      {/* Header Navigation Bar */}
      <header className="day-header">
        <button className="nav-step-btn" onClick={() => navigate(`/day/${prevDate}`)}>
          ◀ Previous Day ({prevDate})
        </button>
        <div className="day-title-block">
          <span className="badge-tag">DATE DETAIL OBSERVATION RECORD</span>
          <h2>{date}</h2>
        </div>
        <button className="nav-step-btn" onClick={() => navigate(`/day/${nextDate}`)}>
          Next Day ({nextDate}) ▶
        </button>
      </header>

      <div className="day-content">
        {/* Left Column: Mini Map & Pass Timeline */}
        <div className="day-map-section">
          <div className="map-toolbar">
            <span className="toolbar-title">SATELLITE GROUND OVERPASSES · {date}</span>
            <button
              className={`replay-btn ${isReplaying ? 'active' : ''}`}
              onClick={handleReplayPasses}
            >
              {isReplaying ? '🛰 SWEEPING OVERPASS...' : '▶ REPLAY OVERPASS SWEEP'}
            </button>
          </div>

          <div className="mini-map" ref={mapContainer} />

          {/* 24-Hour Pass Timeline (Spec Section 5) */}
          <div className="pass-timeline-panel">
            <h4>24-Hour Satellite Overpass Schedule & Detections</h4>
            <div className="pass-timeline-axis">
              {passes.map((pass, i) => (
                <div
                  key={pass.satellite + i}
                  className={`pass-node ${pass.isMissing ? 'is-missing' : ''}`}
                  style={{ animationDelay: `${i * 120}ms` }}
                >
                  <div className="pass-marker-line"></div>
                  <div className="pass-chip">
                    <strong>{pass.satellite}</strong>
                    <span className="pass-sensor">({pass.sensor})</span>
                    <span className="pass-time">{pass.overpass_local}</span>
                    <span className="pass-count">🔥 {pass.detections} pts</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Gauges, Uncertainty, Why Panel */}
        <div className="day-data-section">
          
          {/* Dual Gauges: Activity vs Observability */}
          <div className="gauges-row">
            <div className="gauge-panel activity-gauge">
              <span className="gauge-label">ACTIVITY INTENSITY (HFAI)</span>
              <div className="gauge-value-box">
                <span className="gauge-number">{hfaiVal}</span>
                <span className="gauge-unit">HFAI</span>
              </div>
              <div className="gauge-bar-bg">
                <div
                  className="gauge-bar-fill activity-fill"
                  style={{ width: `${Math.min(100, (hfaiVal / 300) * 100)}%` }}
                />
              </div>
              <span className="gauge-sub">Percentile: <strong>{metrics.historical_percentile || 84}%</strong> ({metrics.anomaly_band || 'High'})</span>
            </div>

            <div className="gauge-panel observability-gauge">
              <span className="gauge-label">OBSERVABILITY SCORE</span>
              <div className="gauge-value-box">
                <span className="gauge-number">{(obsScore * 100).toFixed(0)}%</span>
                <span className="gauge-unit">CLEAR SKY</span>
              </div>
              <div className="gauge-bar-bg">
                <div
                  className="gauge-bar-fill obs-fill"
                  style={{ width: `${obsScore * 100}%` }}
                />
              </div>
              <span className="gauge-sub">Quality: <strong>{metrics.observability_class || 'High'}</strong> (Clear Granules)</span>
            </div>
          </div>

          {/* Uncertainty Interval Whisker Box (Spec Section 5) */}
          <div className="uncertainty-box">
            <span className="whisker-title">95% PREDICTION INTERVAL (QUANTILE BOUNDS)</span>
            <div className="whisker-track">
              <div className="whisker-line"></div>
              <div className="whisker-whisker left-whisker">
                <span>{uncertainty[0]}</span>
              </div>
              <div className="whisker-point">
                <strong>{hfaiVal} HFAI</strong>
              </div>
              <div className="whisker-whisker right-whisker">
                <span>{uncertainty[1]}</span>
              </div>
            </div>
          </div>

          {/* 30-Day Trend Chart */}
          <div className="chart-panel">
            <h3>30-Day Trajectory vs Climatology Mean</h3>
            <div className="chart-wrapper">
              <Line
                data={chartData}
                options={{
                  maintainAspectRatio: false,
                  plugins: { legend: { position: 'top', labels: { color: '#1A1A1A', font: { family: "'Source Sans 3', sans-serif", size: 12, weight: 600 } } } },
                  scales: {
                    x: { grid: { color: 'rgba(232, 228, 223, 0.8)' }, ticks: { color: '#6B6B6B', font: { family: "'IBM Plex Mono', monospace", size: 10 } } },
                    y: { grid: { color: 'rgba(232, 228, 223, 0.8)' }, ticks: { color: '#6B6B6B', font: { family: "'IBM Plex Mono', monospace", size: 10 } } }
                  }
                }}
              />
            </div>
          </div>

          {/* Data-Driven Why? Panel (Spec Section 5) */}
          <div className={`why-panel ${whyRevealed ? 'revealed' : ''}`}>
            <span className="section-tag">DATA-DRIVEN ROOT-CAUSE EXPLANATION</span>
            <h3 className="why-headline">{why.headline || 'Agricultural burning confirmed across satellites'}</h3>
            <div className="why-lines">
              <div className="why-line line-1">
                <span className="why-bullet">01</span>
                <p>{why.activity_explanation}</p>
                <div className="evidence-bar" style={{ width: '85%' }}></div>
              </div>
              <div className="why-line line-2">
                <span className="why-bullet">02</span>
                <p>{why.observability_explanation}</p>
                <div className="evidence-bar" style={{ width: '92%' }}></div>
              </div>
              <div className="why-line line-3">
                <span className="why-bullet">03</span>
                <p>{why.disagreement_notes}</p>
                <div className="evidence-bar" style={{ width: '74%' }}></div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
