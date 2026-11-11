import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './EarlyWarning.css';
import { Footer } from '../components/Footer';
import {
  fetchLiveFirmsHotspots,
  fetchLiveWeather,
  calculateFuelMoisture,
  calculateFDI,
  calculateForwardSpreadRate,
  generateHuygensConeGeoJSON,
  evaluateThreatenedSettlements,
  getCompassDirection,
  getShortCompass
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
    name: '⚡ 2018 Camp Fire Benchmark (California)',
    description: 'Jarvis Gap high-wind disaster simulation. Rapid ignition propagating towards Concow & Paradise.',
    lat: 39.813,
    lon: -121.438,
    zoom: 10.5,
    temp_c: 18.3,
    rh_pct: 8.0,
    wind_kmh: 56.0,
    wind_dir: 45.0,
    drought: 10.0,
    slope_deg: 18.0,
    frp_mw: 450.0
  },
  chittagong: {
    id: 'chittagong',
    name: '⛰️ Chittagong Hill Tracts (Dry Season)',
    description: 'Dry season shifting cultivation ridge fires in Rangamati & Bandarban hill terrain.',
    lat: 22.35,
    lon: 92.20,
    zoom: 10.0,
    temp_c: 36.5,
    rh_pct: 28.0,
    wind_kmh: 24.0,
    wind_dir: 210.0,
    drought: 8.5,
    slope_deg: 14.0,
    frp_mw: 65.0
  },
  sundarbans: {
    id: 'sundarbans',
    name: '🌲 Sundarbans Mangrove Buffer Zone',
    description: 'Southern mangrove fringe with high moisture and tidal protection.',
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
    description: 'Agricultural stubble burn corridors along tea plantations and wetlands.',
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
  const [fuelMoisture, setFuelMoisture] = useState<number>(8.5);
  const [spreadRate, setSpreadRate] = useState<number>(0.95);
  const [spreadDistance, setSpreadDistance] = useState<number>(2.85);
  const [spreadAzimuth, setSpreadAzimuth] = useState<number>(25.0);
  const [spreadGeoJson, setSpreadGeoJson] = useState<any>(null);
  const [exposedCommunities, setExposedCommunities] = useState<ThreatenedSettlement[]>([]);

  // 1. Initial Load of Real-Time NASA FIRMS Telemetry
  useEffect(() => {
    let isMounted = true;
    const loadFirms = async () => {
      setIsFirmsLoading(true);
      try {
        const spots = await fetchLiveFirmsHotspots();
        if (isMounted && spots.length > 0) {
          setFirmsHotspots(spots);
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
  }, []);

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
  const isRedFlag = fdiScore >= 65 || (fuelMoisture <= 6.5 && windSpeed >= 30) || (activeFrp >= 50.0 && fdiScore >= 45);
  const isElevated = fdiScore >= 35 || activeFrp >= 30.0;
  
  // Clean Human Alert Status
  const alertHeadline = isRedFlag
    ? '🚨 EMERGENCY WARNING: Rapid Fire Spread Expected'
    : isElevated
    ? '⚠️ WATCH ADVISORY: Moderate Fire Spread Possible'
    : '🟢 SAFE & CONTAINED: Low Fire Spread Risk';

  const alertColorClass = isRedFlag ? 'level-warning' : isElevated ? 'level-watch' : 'level-advisory';

  const spreadCompass = getCompassDirection(spreadAzimuth);
  const windFromCompass = getCompassDirection(windDir);


  return (
    <div className="early-warning-container">
      {/* CLEAN USER-FRIENDLY HEADER */}
      <header className="ew-header">
        <div>
          <div className="ew-badge">
            <span className="pulse-dot"></span>
            LIVE WILDFIRE SPREAD & COMMUNITY ALERT TRACKER
          </div>
          <h1>Wildfire Early Warning & Community Alert System</h1>
          <p className="ew-lead">
            Tracks real-time satellite fire detections and live weather to predict where smoke and flames will spread, alerting communities in their path.
          </p>
        </div>

        <div className="ew-header-controls">
          <div className="satellite-status-pill">
            <span className="pulse-green-dot"></span>
            <span>NASA Satellite Feed: <strong>Active NRT</strong></span>
          </div>

          <button 
            className="live-fetch-btn"
            onClick={() => fetchWeatherForCoords(activeLat, activeLon)}
            disabled={isWeatherLoading}
            title="Refresh current weather from Open-Meteo API"
          >
            {isWeatherLoading ? '🛰️ Querying Sensors...' : '🛰️ Refresh Live Weather'}
          </button>
        </div>
      </header>

      {/* TOP USER-FRIENDLY STATUS CARDS */}
      <section className="ew-telemetry-grid">
        {/* CARD 1: OVERALL THREAT LEVEL */}
        <div className={`telemetry-card ${isRedFlag ? 'danger-extreme' : isElevated ? 'danger-high' : 'danger-mod'}`}>
          <div className="card-label-row">
            <span className="card-title">Overall Fire Threat</span>
            <span className={`status-pill ${isRedFlag ? 'pill-red-flag' : isElevated ? 'pill-watch' : 'pill-normal'}`}>
              {isRedFlag ? 'CRITICAL RISK' : isElevated ? 'ELEVATED RISK' : 'LOW RISK (SAFE)'}
            </span>
          </div>
          <div className="metric-number-row">
            <span className="metric-big" style={{ color: isRedFlag ? '#FF0033' : isElevated ? '#FF9E00' : '#00E676' }}>
              {dangerClass.toUpperCase()}
            </span>
            <span className="metric-unit">({fdiScore}/100)</span>
          </div>
          <p className="metric-subtext">
            {fdiScore < 30 
              ? 'High humidity and mild air prevent fires from spreading fast.' 
              : fdiScore < 60 
              ? 'Moderate spread risk if local wind speeds pick up.' 
              : 'Dangerous dry winds can rapidly fan active flames.'}
          </p>
        </div>

        {/* CARD 2: VEGETATION DRYNESS */}
        <div className="telemetry-card">
          <div className="card-label-row">
            <span className="card-title">Vegetation Dryness (Trees & Grass)</span>
            <span className={`status-pill ${fuelMoisture <= 6.5 ? 'pill-red-flag' : 'pill-normal'}`}>
              {fuelMoisture <= 6.5 ? 'TINDER DRY' : 'DAMP & SAFE'}
            </span>
          </div>
          <div className="metric-number-row">
            <span className="metric-big">{fuelMoisture}%</span>
            <span className="metric-unit">Moisture</span>
          </div>
          <p className="metric-subtext">
            {fuelMoisture <= 6.5 
              ? 'Vegetation is dangerously dry and catches fire very easily.' 
              : 'Ground brush is moist and naturally resists burning.'}
          </p>
        </div>

        {/* CARD 3: AIR TEMPERATURE & HUMIDITY */}
        <div className="telemetry-card">
          <div className="card-label-row">
            <span className="card-title">Air Temperature & Humidity</span>
            <span className="status-pill pill-normal">
              {ambientRh >= 60 ? 'HUMID AIR' : 'DRY AIR'}
            </span>
          </div>
          <div className="metric-number-row">
            <span className="metric-big">{ambientTemp}°C</span>
            <span className="metric-unit">/ {ambientRh}% RH</span>
          </div>
          <p className="metric-subtext">
            {ambientRh >= 60 
              ? 'Moist atmosphere naturally suppresses flame development.' 
              : 'Dry atmosphere actively draws moisture out of forest canopy.'}
          </p>
        </div>

        {/* CARD 4: PREDICTED SPREAD SPEED */}
        <div className="telemetry-card">
          <div className="card-label-row">
            <span className="card-title">Projected Spread Speed</span>
            <span className="status-pill pill-normal">
              {spreadRate >= 1.0 ? 'FAST' : 'SLOW'}
            </span>
          </div>
          <div className="metric-number-row">
            <span className="metric-big" style={{ color: '#00E5FF' }}>{spreadRate}</span>
            <span className="metric-unit">km/h</span>
          </div>
          <p className="metric-subtext">
            Blowing towards <strong>{spreadCompass}</strong>. Reaches ~{spreadDistance} km in {forecastHours} hours.
          </p>
        </div>
      </section>

      {/* CLEAN LIVE WEATHER STATUS BAR */}
      <div className="live-weather-infobar">
        <div className="weather-stream-status">
          <span className="pulse-green-dot"></span>
          <span>Live Weather at Selected Fire:</span>
          <strong>{weatherData?.isLive ? 'LIVE METEOROLOGICAL FEED' : 'REGIONAL ESTIMATE'}</strong>
        </div>
        <div className="weather-pills-row">
          <div className="weather-metric-pill">
            <span className="pill-k">TEMPERATURE:</span>
            <span className="pill-v">{ambientTemp}°C</span>
          </div>
          <div className="weather-metric-pill">
            <span className="pill-k">HUMIDITY:</span>
            <span className="pill-v">{ambientRh}%</span>
          </div>
          <div className="weather-metric-pill">
            <span className="pill-k">WIND:</span>
            <span className="pill-v">{windSpeed} km/h ({windFromCompass})</span>
          </div>
          <div className="weather-metric-pill">
            <span className="pill-k">FIRE HEAT (FRP):</span>
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
              ⚡ Test Scenarios
            </button>
          </div>

          {sourceMode === 'live_firms' ? (
            /* REAL-TIME NASA FIRMS ACTIVE HOTSPOT PICKER */
            <div className="control-group">
              <div className="firms-picker-header">
                <label className="control-label">Select Active Detected Fire:</label>
                <button
                  type="button"
                  className="refresh-feed-link"
                  onClick={async () => {
                    setIsFirmsLoading(true);
                    const spots = await fetchLiveFirmsHotspots();
                    setFirmsHotspots(spots);
                    setIsFirmsLoading(false);
                  }}
                  disabled={isFirmsLoading}
                >
                  {isFirmsLoading ? 'Syncing...' : '↻ Refresh Feed'}
                </button>
              </div>

              {firmsHotspots.length === 0 ? (
                <div className="no-hotspots-card">
                  No active fires detected in the last 48 hours for this region.
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
              <label className="control-label" htmlFor="scenario-preset-select">Historical Benchmark Scenario:</label>
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
          <h2 className="control-section-title" style={{ marginTop: '0.8rem' }}>Spread Prediction Settings</h2>

          {/* FORECAST DURATION */}
          <div className="control-group">
            <label className="control-label" htmlFor="ew-lead-time-slider">
              <span>Predict Forward In Time:</span>
              <span className="control-val-badge">+{forecastHours} Hours Ahead</span>
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
              <span>Wind Speed:</span>
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
              <span className="control-val-badge">{windFromCompass} ({windDir}°)</span>
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

          {/* USER-FRIENDLY SPREAD SUMMARY */}
          <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '12px', borderRadius: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px' }}>
              <span style={{ color: '#94A3B8' }}>Fire Propagation Path:</span>
              <strong style={{ color: '#00E5FF' }}>Towards {spreadCompass}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px' }}>
              <span style={{ color: '#94A3B8' }}>Expected Travel Distance:</span>
              <strong style={{ color: '#FFB800' }}>{spreadDistance} km in {forecastHours}h</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: '#94A3B8' }}>Communities Threatened:</span>
              <strong style={{ color: exposedCommunities.length > 0 ? '#FF3366' : '#00E676' }}>
                {exposedCommunities.length === 0 ? 'None (All Clear)' : `${exposedCommunities.length} nearby areas`}
              </strong>
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
              title={`Smoke & heat blowing toward ${spreadCompass}`}
            >
              ↓
            </span>
            <strong>{windSpeed} km/h ({getShortCompass(spreadAzimuth)})</strong>
          </div>

          {/* MAP LEGEND OVERLAY */}
          <div className="map-legend-overlay">
            <div className="legend-row">
              <span className="legend-swatch swatch-origin"></span>
              <span>Active Fire Hotspot ({activeFrp} MW)</span>
            </div>
            <div className="legend-row">
              <span className="legend-swatch swatch-cone"></span>
              <span>Predicted {forecastHours}h Spread Cone</span>
            </div>
            <div className="legend-row">
              <span className="legend-swatch swatch-receptor"></span>
              <span>Nearby Towns / Settlements</span>
            </div>
          </div>
        </div>
      </div>

      {/* USER-FRIENDLY ALERT DISPATCH & COMMUNITY TABLE */}
      <section className="ew-alert-card">
        <div className={`alert-banner ${alertColorClass}`}>
          <div className="alert-headline">{alertHeadline}</div>
          <div className="alert-action">
            {isRedFlag 
              ? `Fast-moving fire envelope projected downwind towards ${spreadCompass}. Settlements in the projected path should be notified immediately and prepare containment measures.`
              : isElevated
              ? `Elevated spread risk. Smoke and spot fires may travel up to ${spreadDistance} km over the next ${forecastHours} hours towards ${spreadCompass}. Nearby communities should stay informed.`
              : `Current atmospheric conditions (high moisture and mild winds) prevent fast fire spread. Standard routine monitoring active; no evacuation required.`}
          </div>
        </div>

        {/* EXPOSED COMMUNITIES */}
        <div>
          <h3 style={{ fontSize: '1rem', margin: '0 0 10px 0', color: '#FFFFFF' }}>
            Communities & Towns in Downwind Path ({exposedCommunities.length})
          </h3>
          <div className="receptors-table-wrapper">
            <table className="receptors-table">
              <thead>
                <tr>
                  <th>Town / Settlement</th>
                  <th>Population</th>
                  <th>Distance from Fire</th>
                  <th>Direction</th>
                  <th>Time Until Reaches (ETA)</th>
                  <th>Community Alert Tier</th>
                </tr>
              </thead>
              <tbody>
                {exposedCommunities.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: '#94A3B8', padding: '16px' }}>
                      ✅ No registered towns or population centers are located in the downwind path of this fire.
                    </td>
                  </tr>
                ) : (
                  exposedCommunities.map((rec) => (
                    <tr key={rec.name}>
                      <td><strong>{rec.name}</strong></td>
                      <td style={{ color: '#CBD5E1' }}>{rec.population}</td>
                      <td>{rec.distance_km} km</td>
                      <td>{getCompassDirection(rec.bearing_deg)}</td>
                      <td style={{ color: rec.time_to_impact_hours <= forecastHours ? '#FF3366' : '#FFB800', fontWeight: 600 }}>
                        {rec.time_to_impact_hours <= forecastHours 
                          ? `⚠️ ~${rec.time_to_impact_hours} Hours` 
                          : `~${rec.time_to_impact_hours} Hours (Buffer)`}
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
                          {rec.threat_level === 'CRITICAL DIRECT IMPACT' 
                            ? '🔴 DIRECT PATH' 
                            : rec.threat_level === 'HIGH DOWNWIND THREAT' 
                            ? '🟠 HIGH THREAT' 
                            : '🟡 SMOKE ADVISORY'}
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
          <strong>Decision-Support Notice:</strong> BengalFlare couples NASA FIRMS satellite thermal observations with Open-Meteo atmospheric forecasts to model fire danger and forward spread. Official emergency directives and evacuation orders are issued exclusively by local civil protection authorities.
        </div>
      </section>

      {/* GLOBAL FOOTER - VISIBLE ON SCROLL DOWN */}
      <Footer />
    </div>
  );
};
