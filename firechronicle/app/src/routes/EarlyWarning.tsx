import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './EarlyWarning.css';
import {
  fetchLiveFirmsHotspots,
  fetchLiveWeather,
  calculateVPD,
  calculateFuelMoisture,
  calculateFDI,
  calculateForwardSpreadRate,
  generateHuygensConeGeoJSON,
  evaluateThreatenedSettlements,
  getStoredFirmsKey,
  setStoredFirmsKey,
  DEFAULT_FIRMS_KEY
} from '../services/firmsService';
import type {
  FirmsHotspot,
  LiveWeatherData,
  ThreatenedSettlement
} from '../services/firmsService';

// Fix Vite Web Worker loading in MapLibre GL JS
if (typeof window !== 'undefined') {
  maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');
}

interface ScenarioPreset {
  id: string;
  name: string;
  description: string;
  lat: number;
  lon: number;
  zoom: number;
  temp_c: number;
  rh_pct: number;
  wind_kmh: number;
  wind_dir: number;
  drought: number;
  slope_deg: number;
  frp_mw: number;
}

const PRESETS: Record<string, ScenarioPreset> = {
  camp_fire: {
    id: 'camp_fire',
    name: '⚡ 2018 Camp Fire Benchmark (Paradise, CA)',
    description: 'Jarvis Gap Diablo wind event. Poe Dam ignition propagating towards Concow and Paradise.',
    lat: 39.813,
    lon: -121.438,
    zoom: 10.5,
    temp_c: 18.3,
    rh_pct: 8.0,
    wind_kmh: 56.0,
    wind_dir: 45.0, // NE wind => SW spread
    drought: 10.0,
    slope_deg: 18.0,
    frp_mw: 450.0
  },
  chittagong: {
    id: 'chittagong',
    name: '⛰️ Chittagong Hill Tracts (Pre-Monsoon Peak)',
    description: 'Dry season shifting cultivation ridge fires in Rangamati & Bandarban.',
    lat: 22.35,
    lon: 92.20,
    zoom: 10.0,
    temp_c: 36.5,
    rh_pct: 28.0,
    wind_kmh: 24.0,
    wind_dir: 210.0, // SSW wind => NNE spread
    drought: 8.5,
    slope_deg: 14.0,
    frp_mw: 65.0
  },
  sundarbans: {
    id: 'sundarbans',
    name: '🌲 Sundarbans Mangrove Buffer Zone',
    description: 'Southern mangrove fringe with high moisture and tidal buffer.',
    lat: 22.05,
    lon: 89.50,
    zoom: 10.0,
    temp_c: 31.0,
    rh_pct: 68.0,
    wind_kmh: 16.0,
    wind_dir: 180.0,
    drought: 4.0,
    slope_deg: 0.5,
    frp_mw: 20.0
  },
  sylhet: {
    id: 'sylhet',
    name: '🌾 Sylhet Haor Basin & Tea Estates',
    description: 'Post-harvest agricultural stubble burns along wetland corridors.',
    lat: 24.30,
    lon: 91.73,
    zoom: 10.0,
    temp_c: 33.0,
    rh_pct: 42.0,
    wind_kmh: 18.0,
    wind_dir: 195.0,
    drought: 6.0,
    slope_deg: 2.0,
    frp_mw: 35.0
  }
};

export const EarlyWarning: React.FC = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Source Mode: Live NASA FIRMS telemetry vs Benchmark scenarios
  const [sourceMode, setSourceMode] = useState<'live_firms' | 'benchmarks'>('live_firms');
  
  // Real-Time NASA FIRMS state
  const [firmsHotspots, setFirmsHotspots] = useState<FirmsHotspot[]>([]);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string>('');
  const [isFirmsLoading, setIsFirmsLoading] = useState<boolean>(true);
  const [firmsKey, setFirmsKey] = useState<string>(getStoredFirmsKey());
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [customKeyInput, setCustomKeyInput] = useState<string>(getStoredFirmsKey());

  // Benchmark preset state
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>('camp_fire');
  const activePreset = PRESETS[selectedPresetKey];

  // Active Origin Coordinates & Attributes
  const activeHotspot = firmsHotspots.find(h => h.id === selectedHotspotId) || firmsHotspots[0] || null;
  const activeLat = sourceMode === 'live_firms' && activeHotspot ? activeHotspot.latitude : activePreset.lat;
  const activeLon = sourceMode === 'live_firms' && activeHotspot ? activeHotspot.longitude : activePreset.lon;
  const activeFrp = sourceMode === 'live_firms' && activeHotspot ? activeHotspot.frp : activePreset.frp_mw;

  // Meteorological state (Live from Open-Meteo or Preset)
  const [weatherData, setWeatherData] = useState<LiveWeatherData | null>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState<boolean>(false);
  const [forecastHours, setForecastHours] = useState<number>(3);
  const [windSpeed, setWindSpeed] = useState<number>(24.0);
  const [windDir, setWindDir] = useState<number>(205.0);
  const [ambientTemp, setAmbientTemp] = useState<number>(31.0);
  const [ambientRh, setAmbientRh] = useState<number>(45.0);

  // Derived telemetry metrics
  const [fdiScore, setFdiScore] = useState<number>(55.0);
  const [dangerClass, setDangerClass] = useState<string>('High');
  const [vpdVal, setVpdVal] = useState<number>(2.1);
  const [fuelMoisture, setFuelMoisture] = useState<number>(8.5);
  const [spreadRate, setSpreadRate] = useState<number>(0.95);
  const [spreadDistance, setSpreadDistance] = useState<number>(2.85);
  const [burnArea, setBurnArea] = useState<number>(2.4);
  const [spreadAzimuth, setSpreadAzimuth] = useState<number>(25.0);
  const [spreadGeoJson, setSpreadGeoJson] = useState<any>(null);
  const [exposedCommunities, setExposedCommunities] = useState<ThreatenedSettlement[]>([]);

  // 1. Initial Load of Real-Time NASA FIRMS Telemetry
  useEffect(() => {
    let isMounted = true;
    const loadFirms = async () => {
      setIsFirmsLoading(true);
      try {
        const spots = await fetchLiveFirmsHotspots(firmsKey, 2);
        if (isMounted && spots.length > 0) {
          setFirmsHotspots(spots);
          // Pick the highest FRP hotspot by default for immediate threat evaluation
          setSelectedHotspotId(spots[0].id);
        }
      } catch (err) {
        console.error('Failed to load NASA FIRMS feed:', err);
      } finally {
        if (isMounted) setIsFirmsLoading(false);
      }
    };

    loadFirms();
    return () => { isMounted = false; };
  }, [firmsKey]);

  // 2. Fetch Live Open-Meteo Weather whenever target coordinates shift
  const fetchWeatherForCoords = useCallback(async (lat: number, lon: number) => {
    setIsWeatherLoading(true);
    try {
      const liveW = await fetchLiveWeather(lat, lon);
      setWeatherData(liveW);
      setAmbientTemp(liveW.temperature_c);
      setAmbientRh(liveW.relative_humidity_pct);
      setWindSpeed(liveW.wind_speed_kmh);
      setWindDir(liveW.wind_direction_deg);
    } catch (e) {
      console.warn('Weather fetch error:', e);
    } finally {
      setIsWeatherLoading(false);
    }
  }, []);

  // Trigger weather fetch when active hotspot or preset changes
  useEffect(() => {
    if (sourceMode === 'live_firms' && activeHotspot) {
      fetchWeatherForCoords(activeHotspot.latitude, activeHotspot.longitude);
    } else if (sourceMode === 'benchmarks') {
      setAmbientTemp(activePreset.temp_c);
      setAmbientRh(activePreset.rh_pct);
      setWindSpeed(activePreset.wind_kmh);
      setWindDir(activePreset.wind_dir);
    }
  }, [sourceMode, selectedHotspotId, selectedPresetKey, fetchWeatherForCoords]);

  // 3. Client-side physics engine: Computes VPD, Fuel Moisture, FDI, Spread Rate & Huygens Cone
  const recalculatePhysics = useCallback(() => {
    const t = ambientTemp;
    const rh = ambientRh;
    const speed = windSpeed;
    const dir = windDir;
    const hours = forecastHours;

    // Fuel Moisture
    const mf = calculateFuelMoisture(t, rh);
    setFuelMoisture(mf);

    // VPD
    const vpd = calculateVPD(t, rh);
    setVpdVal(vpd);

    // Fosberg Fire Weather Index
    const { score, danger_class } = calculateFDI(t, rh, speed);
    setFdiScore(score);
    setDangerClass(danger_class);

    // Rothermel Forward Spread Rate
    const slope = sourceMode === 'benchmarks' ? activePreset.slope_deg : 2.0;
    const rate = calculateForwardSpreadRate(speed, mf, slope);
    setSpreadRate(rate);

    const dist = Number((rate * hours).toFixed(2));
    setSpreadDistance(dist);

    const sAzimuth = Math.round((dir + 180.0) % 360.0);
    setSpreadAzimuth(sAzimuth);

    // Huygens Elliptical Threat Cone
    const coneFeature = generateHuygensConeGeoJSON(
      activeLat,
      activeLon,
      speed,
      dir,
      rate,
      hours
    );
    setSpreadGeoJson(coneFeature);

    // Area approximation
    const windMph = speed * 0.621371;
    const lb = Math.max(1.1, 1.0 + 0.00284 * (windMph ** 1.7));
    const majorA = dist;
    const minorB = majorA / lb;
    const area = Number((Math.PI * (majorA / 2) * (minorB / 2)).toFixed(2));
    setBurnArea(area);

    // Downwind settlement vulnerability assessment
    const settlements = evaluateThreatenedSettlements(
      activeLat,
      activeLon,
      dir,
      dist,
      rate,
      hours
    );
    setExposedCommunities(settlements);
  }, [ambientTemp, ambientRh, windSpeed, windDir, forecastHours, activeLat, activeLon, sourceMode, activePreset]);

  // Recalculate on any parameter shift
  useEffect(() => {
    recalculatePhysics();
  }, [recalculatePhysics]);

  // 4. MapLibre Map Lifecycle
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const compositeMapStyle: maplibregl.StyleSpecification = {
      version: 8,
      sources: {
        'esri-satellite': {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256
        },
        'esri-labels': {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256
        }
      },
      layers: [
        { id: 'sat-layer', type: 'raster', source: 'esri-satellite' },
        { id: 'label-layer', type: 'raster', source: 'esri-labels', paint: { 'raster-opacity': 0.85 } }
      ]
    };

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: compositeMapStyle,
      center: [activeLon, activeLat],
      zoom: sourceMode === 'benchmarks' ? activePreset.zoom : 10.5,
      pitch: 20
    });

    map.on('load', () => {
      // 1. Origin Ignition Marker Source
      map.addSource('origin-point', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [activeLon, activeLat] }
        }
      });

      map.addLayer({
        id: 'origin-glow',
        type: 'circle',
        source: 'origin-point',
        paint: {
          'circle-radius': 16,
          'circle-color': '#FF0033',
          'circle-opacity': 0.45
        }
      });

      map.addLayer({
        id: 'origin-core',
        type: 'circle',
        source: 'origin-point',
        paint: {
          'circle-radius': 7,
          'circle-color': '#FFFFFF',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#FF0033'
        }
      });

      // 2. Spread Cone Ellipse Source
      map.addSource('spread-cone', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      map.addLayer({
        id: 'spread-fill',
        type: 'fill',
        source: 'spread-cone',
        paint: {
          'fill-color': '#FF5E00',
          'fill-opacity': 0.35
        }
      });

      map.addLayer({
        id: 'spread-stroke',
        type: 'line',
        source: 'spread-cone',
        paint: {
          'line-color': '#FF1744',
          'line-width': 2.5,
          'line-dasharray': [2, 1]
        }
      });

      setMapLoaded(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update map camera and sources when coordinates change
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    mapRef.current.flyTo({
      center: [activeLon, activeLat],
      zoom: 10.5,
      duration: 1000
    });

    const originSource = mapRef.current.getSource('origin-point') as maplibregl.GeoJSONSource | undefined;
    if (originSource) {
      originSource.setData({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [activeLon, activeLat] }
      });
    }
  }, [activeLat, activeLon, mapLoaded]);

  // Update cone polygon on map
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !spreadGeoJson) return;

    const coneSource = mapRef.current.getSource('spread-cone') as maplibregl.GeoJSONSource | undefined;
    if (coneSource) {
      coneSource.setData({
        type: 'FeatureCollection',
        features: [spreadGeoJson]
      });
    }
  }, [spreadGeoJson, mapLoaded]);

  // Handle custom FIRMS key submission
  const handleSaveFirmsKey = () => {
    const key = customKeyInput.trim() || DEFAULT_FIRMS_KEY;
    setStoredFirmsKey(key);
    setFirmsKey(key);
    setShowKeyModal(false);
  };

  const isRedFlag = fdiScore >= 65 || (fuelMoisture <= 6.5 && windSpeed >= 30) || (activeFrp >= 30.0 && fdiScore >= 45);
  const alertLevel = isRedFlag ? 'LEVEL 3: EMERGENCY WARNING' : fdiScore >= 45 ? 'LEVEL 2: WATCH' : 'LEVEL 1: ADVISORY';
  const alertColorClass = isRedFlag ? 'level-warning' : fdiScore >= 45 ? 'level-watch' : 'level-advisory';

  return (
    <div className="early-warning-container">
      {/* HEADER WITH REALTIME STATUS BADGE */}
      <header className="ew-header">
        <div>
          <div className="ew-badge">
            <span className="pulse-dot"></span>
            WILDFIRE THREAT EARLY WARNING & SPREAD PREDICTION
          </div>
          <h1>Atmospheric Fire Danger & Spread Simulator</h1>
          <p className="ew-lead">
            Coupling real-time NASA FIRMS satellite telemetry, Open-Meteo meteorological vectors, Dead Fine Fuel Moisture (Nelson NFDRS),
            Fosberg Fire Weather Index (FFWI), and Huygens downwind forward spread modeling.
          </p>
        </div>

        <div className="ew-header-controls">
          <div className="firms-key-badge-row">
            <button 
              className="firms-key-pill"
              onClick={() => setShowKeyModal(true)}
              title="Configure NASA FIRMS MAP_KEY"
            >
              <span className="key-dot active"></span>
              <span>FIRMS Key: <strong>{firmsKey.slice(0, 6)}...{firmsKey.slice(-4)}</strong></span>
              <span className="key-edit-tag">⚙️ EDIT</span>
            </button>
          </div>

          <button 
            className="live-fetch-btn"
            onClick={() => fetchWeatherForCoords(activeLat, activeLon)}
            disabled={isWeatherLoading}
            title="Query real-time meteorological vectors from Open-Meteo API"
          >
            {isWeatherLoading ? '🛰️ Querying Sensors...' : '🛰️ Pull Live Weather (Open-Meteo)'}
          </button>
        </div>
      </header>

      {/* TOP TELEMETRY METRIC CARDS */}
      <section className="ew-telemetry-grid">
        {/* FDI GAUGE */}
        <div className={`telemetry-card ${dangerClass === 'Extreme' ? 'danger-extreme' : dangerClass === 'Very High' ? 'danger-high' : 'danger-mod'}`}>
          <div className="card-label-row">
            <span className="card-title">Fire Danger Index (FDI)</span>
            <span className={`status-pill ${isRedFlag ? 'pill-red-flag' : 'pill-normal'}`}>
              {isRedFlag ? 'RED FLAG' : 'NORMAL'}
            </span>
          </div>
          <div className="metric-number-row">
            <span className="metric-big" style={{ color: dangerClass === 'Extreme' ? '#FF0033' : '#FF6A00' }}>{fdiScore}</span>
            <span className="metric-unit">/ 100</span>
          </div>
          <p className="metric-subtext">
            <strong>{dangerClass.toUpperCase()}</strong> fire weather regime. Based on NOAA / NWS Fosberg FFWI formulation.
          </p>
        </div>

        {/* FUEL MOISTURE */}
        <div className="telemetry-card">
          <div className="card-label-row">
            <span className="card-title">Dead Fine Fuel Moisture</span>
            <span className={`status-pill ${fuelMoisture <= 6.5 ? 'pill-red-flag' : 'pill-normal'}`}>
              {fuelMoisture <= 6.5 ? 'CRITICAL DRY' : 'ADEQUATE'}
            </span>
          </div>
          <div className="metric-number-row">
            <span className="metric-big">{fuelMoisture}%</span>
            <span className="metric-unit">10-hr litter</span>
          </div>
          <p className="metric-subtext">
            Nelson NFDRS equilibrium. Flashover combustibility occurs at &lt;6.5%.
          </p>
        </div>

        {/* VPD */}
        <div className="telemetry-card">
          <div className="card-label-row">
            <span className="card-title">Vapor Pressure Deficit</span>
            <span className="status-pill pill-normal">TETENS SVP</span>
          </div>
          <div className="metric-number-row">
            <span className="metric-big">{vpdVal}</span>
            <span className="metric-unit">kPa</span>
          </div>
          <p className="metric-subtext">
            Atmospheric drying demand. High VPD aggressively strips moisture from living foliage.
          </p>
        </div>

        {/* FORWARD SPREAD RATE */}
        <div className="telemetry-card">
          <div className="card-label-row">
            <span className="card-title">Forward Rate of Spread</span>
            <span className="status-pill pill-normal">ROTHERMEL</span>
          </div>
          <div className="metric-number-row">
            <span className="metric-big" style={{ color: '#00E5FF' }}>{spreadRate}</span>
            <span className="metric-unit">km/h</span>
          </div>
          <p className="metric-subtext">
            Propagates downwind towards <strong>{spreadAzimuth}° azimuth</strong>. Reaches {spreadDistance} km in {forecastHours}h.
          </p>
        </div>
      </section>

      {/* REAL-TIME WEATHER LIVE STATUS STRIP */}
      <div className="live-weather-infobar">
        <div className="weather-stream-status">
          <span className="pulse-green-dot"></span>
          <span>Open-Meteo Real-Time Weather Stream:</span>
          <strong>{weatherData?.isLive ? 'LIVE OBSERVATION' : 'ATMOSPHERIC REANALYSIS'}</strong>
        </div>
        <div className="weather-pills-row">
          <div className="weather-metric-pill">
            <span className="pill-k">TEMP:</span>
            <span className="pill-v">{ambientTemp}°C</span>
          </div>
          <div className="weather-metric-pill">
            <span className="pill-k">HUMIDITY:</span>
            <span className="pill-v">{ambientRh}%</span>
          </div>
          <div className="weather-metric-pill">
            <span className="pill-k">WIND:</span>
            <span className="pill-v">{windSpeed} km/h @ {windDir}°</span>
          </div>
          <div className="weather-metric-pill">
            <span className="pill-k">SOURCE FRP:</span>
            <span className="pill-v" style={{ color: '#FFB800' }}>{activeFrp} MW</span>
          </div>
        </div>
      </div>

      {/* DUAL PANE: CONTROLS & MAP */}
      <div className="ew-main-dual">
        {/* SIDEBAR CONTROLS */}
        <aside className="ew-control-sidebar">
          {/* SOURCE MODE SWITCHER */}
          <div className="ew-source-tabs">
            <button
              type="button"
              className={`source-tab-btn ${sourceMode === 'live_firms' ? 'active' : ''}`}
              onClick={() => setSourceMode('live_firms')}
            >
              <span className="tab-pulse-dot"></span>
              🔴 Real-Time NASA FIRMS ({firmsHotspots.length})
            </button>
            <button
              type="button"
              className={`source-tab-btn ${sourceMode === 'benchmarks' ? 'active' : ''}`}
              onClick={() => setSourceMode('benchmarks')}
            >
              ⚡ Benchmark Scenarios
            </button>
          </div>

          {sourceMode === 'live_firms' ? (
            /* REAL-TIME NASA FIRMS ACTIVE HOTSPOT PICKER */
            <div className="control-group">
              <div className="firms-picker-header">
                <label className="control-label">Active Detected Hotspot:</label>
                <button
                  type="button"
                  className="refresh-feed-link"
                  onClick={async () => {
                    setIsFirmsLoading(true);
                    const spots = await fetchLiveFirmsHotspots(firmsKey, 2);
                    setFirmsHotspots(spots);
                    setIsFirmsLoading(false);
                  }}
                  disabled={isFirmsLoading}
                >
                  {isFirmsLoading ? 'Syncing...' : '↻ Refresh Satellite Feed'}
                </button>
              </div>

              {firmsHotspots.length === 0 ? (
                <div className="no-hotspots-card">
                  No active thermal anomalies detected in the last 48 hours for the regional boundary.
                </div>
              ) : (
                <div className="live-hotspots-picker">
                  {firmsHotspots.slice(0, 6).map((h) => {
                    const isSelected = h.id === selectedHotspotId;
                    return (
                      <button
                        key={h.id}
                        type="button"
                        className={`hotspot-chip ${isSelected ? 'active' : ''}`}
                        onClick={() => setSelectedHotspotId(h.id)}
                      >
                        <div className="hotspot-top-line">
                          <span className="hotspot-name">{h.locationName}</span>
                          <span className="hotspot-badge-frp">{h.frp} MW</span>
                        </div>
                        <div className="hotspot-bottom-line">
                          <span>{h.satellite}</span>
                          <span className="hotspot-time">{h.acq_date} · {h.acq_time}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* BENCHMARK SCENARIO SELECTOR */
            <div className="control-group">
              <label className="control-label" htmlFor="scenario-preset-select">Benchmark Monitoring Preset:</label>
              <select
                id="scenario-preset-select"
                className="preset-select"
                value={selectedPresetKey}
                onChange={(e) => setSelectedPresetKey(e.target.value)}
              >
                {Object.values(PRESETS).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <p className="metric-subtext" style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                {activePreset.description}
              </p>
            </div>
          )}

          {/* SIMULATION SLIDERS */}
          <h2 className="control-section-title" style={{ marginTop: '1rem' }}>Downwind Spread Parameters</h2>

          {/* FORECAST DURATION */}
          <div className="control-group">
            <label className="control-label" htmlFor="ew-lead-time-slider">
              <span>Forecast Lead Time:</span>
              <span className="control-val-badge">+{forecastHours} Hours</span>
            </label>
            <input
              id="ew-lead-time-slider"
              type="range"
              min="1"
              max="6"
              step="1"
              value={forecastHours}
              onChange={(e) => setForecastHours(Number(e.target.value))}
              className="ew-slider"
            />
          </div>

          {/* WIND SPEED */}
          <div className="control-group">
            <label className="control-label" htmlFor="ew-wind-speed-slider">
              <span>Sustained Wind Speed:</span>
              <span className="control-val-badge">{windSpeed} km/h ({(windSpeed * 0.621).toFixed(0)} mph)</span>
            </label>
            <input
              id="ew-wind-speed-slider"
              type="range"
              min="5"
              max="90"
              step="1"
              value={windSpeed}
              onChange={(e) => setWindSpeed(Number(e.target.value))}
              className="ew-slider"
            />
          </div>

          {/* WIND DIRECTION */}
          <div className="control-group">
            <label className="control-label" htmlFor="ew-wind-dir-slider">
              <span>Wind Blowing From:</span>
              <span className="control-val-badge">{windDir}° ({windDir < 90 ? 'NE' : windDir < 180 ? 'SE' : windDir < 270 ? 'SW' : 'NW'})</span>
            </label>
            <input
              id="ew-wind-dir-slider"
              type="range"
              min="0"
              max="355"
              step="5"
              value={windDir}
              onChange={(e) => setWindDir(Number(e.target.value))}
              className="ew-slider"
            />
          </div>

          {/* SPREAD SUMMARY BADGES */}
          <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '12px', borderRadius: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px' }}>
              <span style={{ color: '#94A3B8' }}>Spread Azimuth:</span>
              <strong style={{ color: '#00E5FF' }}>{spreadAzimuth}° Heading</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px' }}>
              <span style={{ color: '#94A3B8' }}>Est. Burn Envelope:</span>
              <strong style={{ color: '#FFB800' }}>{burnArea} km²</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: '#94A3B8' }}>Downwind Reach:</span>
              <strong style={{ color: '#FF3366' }}>{spreadDistance} km</strong>
            </div>
          </div>
        </aside>

        {/* MAP CONTAINER */}
        <div className="ew-map-wrapper">
          <div ref={mapContainer} className="ew-map-container" />

          {/* WIND COMPASS OVERLAY */}
          <div className="map-overlay-compass">
            <span>WIND FLOW:</span>
            <span 
              className="compass-arrow"
              style={{ transform: `rotate(${windDir + 180}deg)` }}
              title={`Airflow heading ${spreadAzimuth}°`}
            >
              ↓
            </span>
            <strong>{windSpeed} km/h</strong>
          </div>

          {/* MAP LEGEND OVERLAY */}
          <div className="map-legend-overlay">
            <div className="legend-row">
              <span className="legend-swatch swatch-origin"></span>
              <span>Ignition Origin ({activeFrp} MW)</span>
            </div>
            <div className="legend-row">
              <span className="legend-swatch swatch-cone"></span>
              <span>+{forecastHours}h Huygens Spread Envelope</span>
            </div>
            <div className="legend-row">
              <span className="legend-swatch swatch-receptor"></span>
              <span>Downwind Communities / Assets</span>
            </div>
          </div>
        </div>
      </div>

      {/* ALERT DISPATCH & EXPOSURE TABLE */}
      <section className="ew-alert-card">
        <div className={`alert-banner ${alertColorClass}`}>
          <div className="alert-headline">{alertLevel}</div>
          <div className="alert-action">
            {isRedFlag 
              ? `CRITICAL WILDFIRE ALERT: High atmospheric spread risk (FDI ${fdiScore}/100, Wind ${windSpeed} km/h). Predicted propagation towards ${spreadAzimuth}° azimuth reaches ${spreadDistance} km in ${forecastHours} hours. Downwind communities must initiate containment staging.`
              : `MONITORING ADVISORY: Atmospheric conditions currently support moderate localized spread (${spreadRate} km/h). Standard patrol containment active.`}
          </div>
        </div>

        {/* EXPOSED COMMUNITIES */}
        <div>
          <h3 style={{ fontSize: '1rem', margin: '0 0 10px 0', color: '#FFFFFF' }}>
            Downwind Settlement & Infrastructure Exposure Assessment ({exposedCommunities.length} Receptors Identified)
          </h3>
          <div className="receptors-table-wrapper">
            <table className="receptors-table">
              <thead>
                <tr>
                  <th>Community / Settlement</th>
                  <th>Population</th>
                  <th>Distance</th>
                  <th>Bearing</th>
                  <th>Time to Impact</th>
                  <th>Threat Tier</th>
                </tr>
              </thead>
              <tbody>
                {exposedCommunities.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: '#94A3B8', padding: '16px' }}>
                      No registered population centers located directly within downwind propagation path.
                    </td>
                  </tr>
                ) : (
                  exposedCommunities.map((rec) => (
                    <tr key={rec.name}>
                      <td><strong>{rec.name}</strong></td>
                      <td style={{ color: '#CBD5E1' }}>{rec.population}</td>
                      <td>{rec.distance_km} km</td>
                      <td>{rec.bearing_deg}°</td>
                      <td style={{ color: rec.time_to_impact_hours <= forecastHours ? '#FF3366' : '#FFB800', fontWeight: 600 }}>
                        ~{rec.time_to_impact_hours} Hours
                      </td>
                      <td>
                        <span 
                          className="threat-badge"
                          style={{
                            background: rec.threat_level === 'CRITICAL DIRECT IMPACT' ? 'rgba(255, 0, 51, 0.25)' : 'rgba(255, 184, 0, 0.25)',
                            color: rec.color,
                            border: `1px solid ${rec.color}`
                          }}
                        >
                          {rec.threat_level}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* DECISION-SUPPORT MANDATORY DISCLAIMER */}
        <div className="disclaimer-box">
          <strong>SCIENTIFIC DECISION-SUPPORT PROTOCOL:</strong> This early warning system couples NASA FIRMS Near-Real-Time thermal observations with Open-Meteo atmospheric forecasts to model fire danger and forward spread physics. Evacuation directives and operational emergency actions are issued exclusively by designated local civil protection authorities.
        </div>
      </section>

      {/* NASA FIRMS MAP_KEY MODAL */}
      {showKeyModal && (
        <div className="key-modal-backdrop" onClick={() => setShowKeyModal(false)}>
          <div className="key-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Configure NASA FIRMS Telemetry Key</h3>
            <p className="modal-sub">
              Enter your NASA Earthdata FIRMS MAP_KEY to directly ingest real-time VIIRS / MODIS satellite observations.
            </p>
            <div className="modal-input-group">
              <label htmlFor="firms-key-input">NASA FIRMS MAP_KEY:</label>
              <input
                id="firms-key-input"
                type="text"
                value={customKeyInput}
                onChange={(e) => setCustomKeyInput(e.target.value)}
                placeholder="Enter 32-character FIRMS MAP_KEY..."
                className="modal-key-input"
              />
            </div>
            <div className="modal-btn-row">
              <button 
                type="button" 
                className="modal-btn-reset"
                onClick={() => setCustomKeyInput(DEFAULT_FIRMS_KEY)}
              >
                Reset to Default
              </button>
              <button 
                type="button" 
                className="modal-btn-cancel"
                onClick={() => setShowKeyModal(false)}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="modal-btn-save"
                onClick={handleSaveFirmsKey}
              >
                Save & Query Live FIRMS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
