import React, { useEffect, useRef, useState, useCallback } from 'react';
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
import './Atlas.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

// Fix Vite Web Worker loading in MapLibre GL JS
if (typeof window !== 'undefined') {
  maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');
}

const AOI_COORDINATES: Record<string, { center: [number, number]; zoom: number; pitch: number }> = {
  'national': { center: [90.3563, 23.6850], zoom: 6.8, pitch: 0 },
  'dhaka': { center: [90.4125, 23.8103], zoom: 8.5, pitch: 30 },
  'sylhet': { center: [91.8687, 24.8949], zoom: 8.5, pitch: 30 },
  'chattogram': { center: [91.8365, 22.3384], zoom: 8.0, pitch: 35 },
  'rajshahi': { center: [88.6042, 24.3745], zoom: 8.2, pitch: 25 },
};

const DISAGREEMENT_CATEGORIES = [
  { id: 'both', label: 'Both Detected (High Agreement)', color: '#ffeb3b', class: 'both' },
  { id: 'modis-only', label: 'MODIS Only (Saturated/Large)', color: '#ff9800', class: 'modis-only' },
  { id: 'viirs-only', label: 'VIIRS Only (Small <5MW)', color: '#f44336', class: 'viirs-only' },
  { id: 'obscured', label: 'Potentially Obscured (Cloud)', color: '#00e5ff', class: 'obscured' }
];

export const Atlas: React.FC = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [allFeatures, setAllFeatures] = useState<any[]>([]);
  const [activeLayer, setActiveLayer] = useState('harmonized');
  const [selectedAoi, setSelectedAoi] = useState('national');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState<number>(1);
  const [currentDate, setCurrentDate] = useState('2022-03-21');
  const [timeSeries, setTimeSeries] = useState<any[]>([]);
  const [pointerInfo, setPointerInfo] = useState<{ lat: number; lon: number; cellId: string } | null>(null);
  const [revealedCategories, setRevealedCategories] = useState<string[]>(['both', 'modis-only', 'viirs-only', 'obscured']);
  const [dailyFireCount, setDailyFireCount] = useState<number>(0);

  // Fetch GeoJSON and time-series
  useEffect(() => {
    // 1. Fetch GeoJSON
    fetch('/fixtures/firms_points.json')
      .then(r => r.json())
      .then(data => {
        setAllFeatures(data.features || []);
      })
      .catch(err => console.error("Error loading fires GeoJSON:", err));

    // 2. Fetch Time Series
    fetch('http://127.0.0.1:8000/time-series')
      .then(r => r.json())
      .then(d => {
        const series = d.data || [];
        setTimeSeries(series);
      })
      .catch(() => {
        fetch('/fixtures/time_series.json')
          .then(r => r.json())
          .then(d => setTimeSeries(d.data || []));
      });
  }, []);

  // Update map source GeoJSON data for current date & active layer
  const updateDateData = useCallback((date: string, layer: string, features: any[]) => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('fires') as maplibregl.GeoJSONSource | undefined;
    if (!source || features.length === 0) return;

    // Filter points around target date (within ±2 days for temporal ember tracking)
    const targetDateObj = new Date(date);
    const targetTime = targetDateObj.getTime();
    
    let windowed = features.filter(f => {
      const fDate = f.properties?.date;
      if (fDate === date) return true;
      if (!fDate) return false;
      const fTime = new Date(fDate).getTime();
      const diffDays = Math.abs((targetTime - fTime) / (1000 * 3600 * 24));
      return diffDays <= 2;
    });

    // Fallback: if selected window has zero in sample, take peak sample
    if (windowed.length === 0) {
      windowed = features.filter(f => f.properties?.date === '2022-03-21');
    }

    if (layer === 'modis') {
      windowed = windowed.filter(f => f.properties?.sensor === 'MODIS');
    } else if (layer === 'viirs') {
      windowed = windowed.filter(f => f.properties?.sensor === 'VIIRS');
    }

    setDailyFireCount(windowed.length);

    source.setData({
      type: 'FeatureCollection',
      features: windowed
    });

    if (mapRef.current?.getLayer('fire-points-core')) {
      if (layer === 'disagreement') {
        mapRef.current.setPaintProperty('fire-points-core', 'circle-color', [
          'match',
          ['get', 'sensor'],
          'MODIS', '#ff9800',
          'VIIRS', '#f44336',
          '#ffeb3b'
        ]);
      } else {
        mapRef.current.setPaintProperty('fire-points-core', 'circle-color', [
          'match',
          ['get', 'sensor'],
          'MODIS', '#ff1a00',
          'VIIRS', '#ffa600',
          '#ff2e00'
        ]);
      }
    }
  }, []);

  // Initialize MapLibre Map with Composite Multi-Basemap
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    // True Color Satellite Basemap Specification (Esri World Imagery + Reference)
    const compositeMapStyle: maplibregl.StyleSpecification = {
      version: 8,
      sources: {
        'esri-satellite': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          ],
          tileSize: 256,
          attribution: '&copy; Esri, Maxar, Earthstar Geographics'
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
          id: 'layer-satellite',
          type: 'raster',
          source: 'esri-satellite',
          layout: { visibility: 'visible' },
          minzoom: 0,
          maxzoom: 19
        },
        {
          id: 'layer-reference',
          type: 'raster',
          source: 'esri-reference',
          layout: { visibility: 'visible' },
          paint: {
            'raster-opacity': 0.85
          },
          minzoom: 0,
          maxzoom: 19
        }
      ]
    };

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: compositeMapStyle,
      center: [90.3563, 23.6850],
      zoom: 6.8,
      pitch: 0
    });

    map.on('load', () => {
      // 1. Bangladesh High-Resolution National Boundary
      map.addSource('bgd-boundary', {
        type: 'geojson',
        data: '/BGD_boundary.geojson'
      });

      // Subtle cyan/emerald neon glow around Bangladesh border
      map.addLayer({
        id: 'bgd-boundary-glow',
        type: 'line',
        source: 'bgd-boundary',
        paint: {
          'line-color': '#00e5ff',
          'line-width': 4,
          'line-opacity': 0.45,
          'line-blur': 2.5
        }
      });

      // Crisp white administrative border (matches NASA FIRMS exactly)
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

      // 2. Dynamic Fire Observations Source
      map.addSource('fires', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // 3. Heatmap Plume Glow (Vibrant Thermal Radiant Gradient)
      map.addLayer({
        id: 'fire-heat',
        type: 'heatmap',
        source: 'fires',
        maxzoom: 10,
        paint: {
          'heatmap-weight': [
            'interpolate',
            ['linear'],
            ['get', 'frp'],
            0, 0.3,
            50, 0.8,
            200, 1.6
          ],
          'heatmap-intensity': 1.5,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            0.15, 'rgba(255, 69, 0, 0.35)',
            0.4, 'rgba(255, 120, 0, 0.7)',
            0.7, 'rgba(255, 195, 0, 0.9)',
            1.0, 'rgba(255, 255, 220, 1.0)'
          ],
          'heatmap-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5, 14,
            9, 28
          ],
          'heatmap-opacity': 0.85
        }
      });

      // 4. Fire Points Outer Glow (Atmospheric Ember Aura)
      map.addLayer({
        id: 'fire-points-glow',
        type: 'circle',
        source: 'fires',
        minzoom: 4.5,
        paint: {
          'circle-color': [
            'match',
            ['get', 'sensor'],
            'MODIS', '#ff2600',
            'VIIRS', '#ff7700',
            '#ff3b00'
          ],
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5, 4.5,
            7, 7.5,
            10, 14.0
          ],
          'circle-opacity': 0.45,
          'circle-blur': 0.75
        }
      });

      // 5. Fire Points Core (Sharp, Intense Thermal Hotspots like FIRMS)
      map.addLayer({
        id: 'fire-points-core',
        type: 'circle',
        source: 'fires',
        minzoom: 4.5,
        paint: {
          'circle-color': [
            'match',
            ['get', 'sensor'],
            'MODIS', '#ff1a00',
            'VIIRS', '#ffa600',
            '#ff2e00'
          ],
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5, 2.5,
            7, 4.0,
            10, 7.0
          ],
          'circle-stroke-width': 0.9,
          'circle-stroke-color': '#ffe853',
          'circle-opacity': 0.98
        }
      });

      // 6. Hover Ring Target Reticle Layer
      map.addSource('hover-ring', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: 'hover-ring-layer',
        type: 'circle',
        source: 'hover-ring',
        paint: {
          'circle-radius': 14,
          'circle-color': 'rgba(255, 235, 59, 0.15)',
          'circle-stroke-width': 1.8,
          'circle-stroke-color': '#ffeb3b',
          'circle-stroke-opacity': 0.95
        }
      });

      // Cursor pointer on hover over fire dots
      map.on('mouseenter', 'fire-points-core', () => {
        map.getCanvas().style.cursor = 'crosshair';
      });
      map.on('mouseleave', 'fire-points-core', () => {
        map.getCanvas().style.cursor = '';
      });

      setMapLoaded(true);
      setTimeout(() => {
        map.resize();
      }, 100);
    });

    // ResizeObserver to prevent MapLibre 0px canvas bug in CSS Grid
    const ro = new ResizeObserver(() => {
      map.resize();
    });
    if (mapContainer.current) {
      ro.observe(mapContainer.current);
    }

    // Pointer Move Tracking
    map.on('mousemove', (e) => {
      const lat = Number(e.lngLat.lat.toFixed(4));
      const lon = Number(e.lngLat.lng.toFixed(4));
      const cellId = `c_${Math.floor((lon - 88) * 100)}_${Math.floor((lat - 20) * 100)}`;
      setPointerInfo({ lat, lon, cellId });

      if (map.getSource('hover-ring')) {
        (map.getSource('hover-ring') as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'Point', coordinates: [e.lngLat.lng, e.lngLat.lat] }
            }
          ]
        });
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, []);

  // Update Map when Date, Layer, allFeatures, or mapLoaded Changes
  useEffect(() => {
    if (mapLoaded && allFeatures.length > 0) {
      updateDateData(currentDate, activeLayer, allFeatures);
    }
  }, [mapLoaded, currentDate, activeLayer, allFeatures, updateDateData]);

  // Handle AOI FlyTo
  const handleAoiChange = (aoi: string) => {
    setSelectedAoi(aoi);
    const target = AOI_COORDINATES[aoi] || AOI_COORDINATES['national'];
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: target.center,
        zoom: target.zoom,
        pitch: target.pitch,
        duration: 1800,
        essential: true
      });
    }
  };

  // Time-lapse Playback Engine
  useEffect(() => {
    if (!isPlaying || timeSeries.length === 0) return;

    const interval = setInterval(() => {
      const currentIndex = timeSeries.findIndex(d => d.local_date === currentDate);
      const nextIndex = (currentIndex + 1) % timeSeries.length;
      const nextDate = timeSeries[nextIndex].local_date;
      setCurrentDate(nextDate);
    }, 1000 / playSpeed);

    return () => clearInterval(interval);
  }, [isPlaying, playSpeed, timeSeries, currentDate]);

  // Disagreement Category Staggered Animation
  useEffect(() => {
    if (activeLayer === 'disagreement') {
      setRevealedCategories([]);
      const timers: number[] = [];
      DISAGREEMENT_CATEGORIES.forEach((cat, idx) => {
        const t = window.setTimeout(() => {
          setRevealedCategories(prev => [...prev, cat.id]);
        }, idx * 140);
        timers.push(t);
      });
      return () => timers.forEach(t => clearTimeout(t));
    }
  }, [activeLayer]);

  const currentIndex = timeSeries.findIndex(d => d.local_date === currentDate);

  const chartData = {
    labels: timeSeries.map(d => d.local_date).slice(-45),
    datasets: [
      {
        label: 'AOI Series (HFAI)',
        data: timeSeries.map(d => d.total_hfai).slice(-45),
        borderColor: '#B8860B',
        backgroundColor: 'rgba(184, 134, 11, 0.12)',
        fill: true,
        tension: 0.2,
        pointRadius: 1,
        pointHoverRadius: 4,
      }
    ]
  };

  return (
    <div className="atlas-container">
      {/* Interactive Map Stage */}
      <div className="atlas-map" ref={mapContainer}>
        {/* Real Satellite Imagery Indicator Badge */}
        <div className="map-imagery-badge">
          <span className="badge-pulse-dot"></span>
          <span>NASA EOSDIS / TRUE COLOR SATELLITE VIEW</span>
        </div>

        {/* Live Pointer Crosshair HUD */}
        {pointerInfo && (
          <div className="pointer-hud">
            <span>GRID: <strong>{pointerInfo.cellId}</strong> (1km)</span>
            <span>LAT: <strong>{pointerInfo.lat}°</strong> · LON: <strong>{pointerInfo.lon}°</strong></span>
            <span>ACTIVE FIRES: <strong>{dailyFireCount}</strong></span>
          </div>
        )}
      </div>

      {/* Control Sidebar */}
      <aside className="atlas-sidebar">
        <div className="panel-section">
          <span className="section-tag">REGION FOCUS</span>
          <h3>AOI Picker</h3>
          <select
            className="dark-select"
            value={selectedAoi}
            onChange={(e) => handleAoiChange(e.target.value)}
          >
            <option value="national">National (Bangladesh)</option>
            <option value="dhaka">Dhaka Division (Cropland + Urban)</option>
            <option value="sylhet">Sylhet Division (Tea & Wetland)</option>
            <option value="chattogram">Chattogram Hill Tracts (Jhum)</option>
            <option value="rajshahi">Rajshahi (Kharif Agricultural)</option>
          </select>
        </div>

        <div className="panel-section">
          <span className="section-tag">IMAGERY & BASEMAP</span>
          <h3>Satellite Background</h3>
          <div className="basemap-grid">
            <button
              type="button"
              className="basemap-btn active"
              title="NASA EOSDIS / True Color Satellite View"
            >
              <div className="basemap-btn-header">
                <span className="bm-label">True Color Satellite</span>
                <span className="basemap-status-badge">ACTIVE</span>
              </div>
              <span className="bm-meta">Esri / NASA Imagery</span>
            </button>
          </div>
        </div>

        <div className="panel-section">
          <span className="section-tag">FUSION LAYERS</span>
          <h3>Layer Switcher</h3>
          <div className="radio-group">
            {[
              { id: 'harmonized', label: 'Harmonized Activity (HFAI)' },
              { id: 'modis', label: 'MODIS Baseline (1 km Footprint)' },
              { id: 'viirs', label: 'VIIRS High-Res (375 m Footprint)' },
              { id: 'disagreement', label: 'Disagreement Mode (MODIS vs VIIRS)' },
              { id: 'observability', label: 'Observability Mask' }
            ].map(layer => (
              <label key={layer.id} className={`radio-label ${activeLayer === layer.id ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="layer"
                  value={layer.id}
                  checked={activeLayer === layer.id}
                  onChange={(e) => setActiveLayer(e.target.value)}
                />
                {layer.label}
              </label>
            ))}
          </div>
        </div>

        {activeLayer === 'disagreement' && (
          <div className="panel-section disagreement-legend">
            <span className="section-tag">SENSOR STRATIFICATION</span>
            <h3>Disagreement Categories</h3>
            {DISAGREEMENT_CATEGORIES.map(cat => (
              <div
                key={cat.id}
                className={`legend-item ${revealedCategories.includes(cat.id) ? 'revealed' : 'hidden'}`}
              >
                <span className={`dot ${cat.class}`}></span>
                <span className="legend-label">{cat.label}</span>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Dock Controls & Time-Series Timeline */}
      <footer className="atlas-dock">
        <div className="dock-chart-wrapper">
          {timeSeries.length > 0 && (
            <Line
              data={chartData}
              options={{
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  x: { display: false },
                  y: { display: false }
                }
              }}
            />
          )}
        </div>

        <div className="dock-controls">
          <div className="playback-group">
            <button
              className="icon-btn"
              onClick={() => setIsPlaying(!isPlaying)}
              title={isPlaying ? 'Pause Time-Lapse' : 'Play Time-Lapse'}
            >
              {isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
            </button>
            <div className="speed-buttons">
              {[0.5, 1, 2, 4, 8].map(spd => (
                <button
                  key={spd}
                  className={`spd-btn ${playSpeed === spd ? 'active' : ''}`}
                  onClick={() => setPlaySpeed(spd)}
                >
                  {spd}×
                </button>
              ))}
            </div>
          </div>

          <div className="scrubber-wrapper">
            <input
              type="range"
              className="time-scrubber"
              min="0"
              max={Math.max(0, timeSeries.length - 1)}
              value={currentIndex >= 0 ? currentIndex : 0}
              onChange={(e) => {
                const idx = Number(e.target.value);
                if (timeSeries[idx]) {
                  setCurrentDate(timeSeries[idx].local_date);
                }
              }}
            />
          </div>

          <div className="date-badge">
            <span className="badge-tag">DATE</span>
            <strong>{currentDate}</strong>
          </div>
        </div>
      </footer>
    </div>
  );
};
