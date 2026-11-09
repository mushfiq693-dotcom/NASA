import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './EarlyWarning.css';

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

const SETTLEMENT_RECEPTORS = [
  { name: 'Concow Community, CA', lat: 39.758, lon: -121.520, pop: '710' },
  { name: 'Paradise Town Center, CA', lat: 39.759, lon: -121.621, pop: '26,800' },
  { name: 'Bandarban Town & Valley', lat: 22.19, lon: 92.22, pop: '45,000' },
  { name: 'Rangamati Lakeside Area', lat: 22.65, lon: 92.17, pop: '65,000' },
  { name: 'Khagrachhari Town', lat: 23.11, lon: 91.98, pop: '38,000' },
  { name: 'Sreemangal Tea Estates', lat: 24.30, lon: 91.73, pop: '28,000' },
  { name: 'Mongla Coastal Buffer', lat: 22.48, lon: 89.60, pop: '35,000' }
];

export const EarlyWarning: React.FC = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const [selectedPresetKey, setSelectedPresetKey] = useState<string>('camp_fire');
  const activePreset = PRESETS[selectedPresetKey];

  // Interactive control states
  const [forecastHours, setForecastHours] = useState<number>(3);
  const [windSpeed, setWindSpeed] = useState<number>(activePreset.wind_kmh);
  const [windDir, setWindDir] = useState<number>(activePreset.wind_dir);
  const [isLiveLoading, setIsLiveLoading] = useState<boolean>(false);

  // Derived telemetry metrics
  const [fdiScore, setFdiScore] = useState<number>(100.0);
  const [dangerClass, setDangerClass] = useState<string>('Extreme');
  const [vpdVal, setVpdVal] = useState<number>(1.9);
  const [fuelMoisture, setFuelMoisture] = useState<number>(2.2);
  const [spreadRate, setSpreadRate] = useState<number>(1.58);
  const [spreadDistance, setSpreadDistance] = useState<number>(4.74);
  const [burnArea, setBurnArea] = useState<number>(3.35);
  const [spreadAzimuth, setSpreadAzimuth] = useState<number>(225.0);
  const [spreadGeoJson, setSpreadGeoJson] = useState<any>(null);
  const [exposedCommunities, setExposedCommunities] = useState<any[]>([]);

  // Update controls when preset changes
  useEffect(() => {
    setWindSpeed(activePreset.wind_kmh);
    setWindDir(activePreset.wind_dir);
  }, [selectedPresetKey]);

  // Client-side math calculator for instant slider responsiveness
  const recalculatePhysics = useCallback((speed: number, dir: number, hours: number) => {
    // 1. Fuel moisture (Nelson NFDRS)
    const rh = activePreset.rh_pct;
    const t = activePreset.temp_c;
    let mf = 10.0;
    if (rh < 10) {
      mf = 0.032 + 0.281 * rh - 0.00058 * rh * t;
    } else if (rh < 50) {
      mf = 2.227 + 0.160 * rh - 0.0148 * t;
    } else {
      mf = 21.06 + 0.0056 * (rh ** 2) - 0.483 * rh;
    }
    mf = Math.max(1.0, Math.min(30.0, mf));
    setFuelMoisture(Number(mf.toFixed(1)));

    // 2. VPD
    const svp = 0.61078 * Math.exp((17.27 * t) / (t + 237.3));
    const avp = svp * (rh / 100);
    const vpd = Math.max(0, svp - avp);
    setVpdVal(Number(vpd.toFixed(2)));

    // 3. Fosberg FFWI
    const chi = mf / 30.0;
    const eta = 1.0 - 2.0 * chi + 1.5 * (chi ** 2) - 0.5 * (chi ** 3);
    const windMph = speed * 0.621371;
    const lam = Math.sqrt(1.0 + (windMph ** 2));
    const ffwi = Math.min(100, Math.max(0, (eta * lam) / 0.3002));
    const finalFdi = Number(ffwi.toFixed(1));
    setFdiScore(finalFdi);

    if (finalFdi >= 85) setDangerClass('Extreme');
    else if (finalFdi >= 70) setDangerClass('Very High');
    else if (finalFdi >= 50) setDangerClass('High');
    else if (finalFdi >= 25) setDangerClass('Moderate');
    else setDangerClass('Low');

    // 4. Spread Physics (Rothermel & Huygens)
    const r0 = 0.12;
    const phi_w = 0.045 * (speed ** 1.45);
    const phi_s = 5.275 * (Math.tan((activePreset.slope_deg * Math.PI) / 180) ** 2);
    const eta_m = Math.max(0.05, 1.0 - 2.59 * (mf / 20.0) + 5.11 * ((mf / 20.0) ** 2) - 3.52 * ((mf / 20.0) ** 3));
    const fRate = Number((r0 * (1 + phi_w + phi_s) * eta_m).toFixed(2));
    setSpreadRate(fRate);

    const fDist = Number((fRate * hours).toFixed(2));
    setSpreadDistance(fDist);

    const bDist = Math.max(0.05, fDist * 0.08);
    const lb = speed > 1 ? 1.0 + 0.25 * (speed ** 0.75) : 1.0;
    const totalLen = fDist + bDist;
    const flankW = totalLen / Math.max(1, lb);
    const a = totalLen / 2;
    const b = flankW / 2;
    setBurnArea(Number((Math.PI * a * b).toFixed(2)));

    const sAzimuth = (dir + 180) % 360;
    setSpreadAzimuth(sAzimuth);

    // Generate Ellipse GeoJSON
    const rad = (sAzimuth * Math.PI) / 180;
    const cOffset = a - bDist;
    const kmLat = 111.0;
    const kmLon = 111.0 * Math.cos((activePreset.lat * Math.PI) / 180);
    const cLat = activePreset.lat + (cOffset * Math.cos(rad)) / kmLat;
    const cLon = activePreset.lon + (cOffset * Math.sin(rad)) / kmLon;

    const coords: [number, number][] = [];
    const numPts = 36;
    for (let i = 0; i <= numPts; i++) {
      const theta = (2 * Math.PI * i) / numPts;
      const lx = a * Math.cos(theta);
      const ly = b * Math.sin(theta);
      const rNorth = lx * Math.cos(rad) - ly * Math.sin(rad);
      const rEast = lx * Math.sin(rad) + ly * Math.cos(rad);
      coords.push([
        Number((cLon + rEast / kmLon).toFixed(5)),
        Number((cLat + rNorth / kmLat).toFixed(5))
      ]);
    }

    const geoJson = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [coords] }
    };
    setSpreadGeoJson(geoJson);

    // Calculate exposed settlements
    const exposed = SETTLEMENT_RECEPTORS.map(s => {
      const dLat = ((s.lat - activePreset.lat) * Math.PI) / 180;
      const dLon = ((s.lon - activePreset.lon) * Math.PI) / 180;
      const aH = Math.sin(dLat / 2) ** 2 + Math.cos((activePreset.lat * Math.PI) / 180) * Math.cos((s.lat * Math.PI) / 180) * (Math.sin(dLon / 2) ** 2);
      const dist = Number((6371 * 2 * Math.atan2(Math.sqrt(aH), Math.sqrt(1 - aH))).toFixed(1));
      
      const yB = Math.sin(dLon) * Math.cos((s.lat * Math.PI) / 180);
      const xB = Math.cos((activePreset.lat * Math.PI) / 180) * Math.sin((s.lat * Math.PI) / 180) - Math.sin((activePreset.lat * Math.PI) / 180) * Math.cos((s.lat * Math.PI) / 180) * Math.cos(dLon);
      const bearing = (Math.atan2(yB, xB) * 180 / Math.PI + 360) % 360;
      const diff = Math.abs(((bearing - sAzimuth + 180) % 360) - 180);
      const isDownwind = diff <= 40.0;
      const eta = isDownwind ? Number((dist / fRate).toFixed(1)) : null;

      let sev = 'FLANK';
      if (isDownwind && dist <= fDist) sev = 'CRITICAL';
      else if (isDownwind && dist <= fDist * 1.5) sev = 'HIGH';
      else if (isDownwind) sev = 'ELEVATED';

      return {
        ...s,
        dist_km: dist,
        bearing: Math.round(bearing),
        isDownwind,
        sev,
        eta
      };
    }).filter(s => s.dist_km <= 40).sort((a, b) => a.dist_km - b.dist_km);

    setExposedCommunities(exposed);
  }, [activePreset]);

  // Recalculate on any parameter shift
  useEffect(() => {
    recalculatePhysics(windSpeed, windDir, forecastHours);
  }, [windSpeed, windDir, forecastHours, recalculatePhysics]);

  // MapLibre Map Lifecycle
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
      center: [activePreset.lon, activePreset.lat],
      zoom: activePreset.zoom,
      pitch: 20
    });

    map.on('load', () => {
      // 1. Origin Ignition Marker Source
      map.addSource('origin-point', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [activePreset.lon, activePreset.lat] }
        }
      });

      map.addLayer({
        id: 'origin-glow',
        type: 'circle',
        source: 'origin-point',
        paint: {
          'circle-radius': 14,
          'circle-color': '#FF0033',
          'circle-opacity': 0.4
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
          'line-color': '#FF3366',
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

  // Update map camera and sources when preset or spread changes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    mapRef.current.flyTo({
      center: [activePreset.lon, activePreset.lat],
      zoom: activePreset.zoom,
      duration: 1200
    });

    const originSource = mapRef.current.getSource('origin-point') as maplibregl.GeoJSONSource | undefined;
    if (originSource) {
      originSource.setData({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [activePreset.lon, activePreset.lat] }
      });
    }
  }, [activePreset, mapLoaded]);

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

  // Live weather fetch button handler
  const handleFetchLiveWeather = async () => {
    setIsLiveLoading(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/weather/live?lat=${activePreset.lat}&lon=${activePreset.lon}`);
      if (res.ok) {
        const data = await res.json();
        const w = data.weather;
        setWindSpeed(Math.round(w.wind_speed_kmh));
        setWindDir(Math.round(w.wind_direction_deg));
      }
    } catch (e) {
      console.warn("Live API fallback triggered", e);
    } finally {
      setIsLiveLoading(false);
    }
  };

  const isRedFlag = fdiScore >= 70 || (fuelMoisture <= 6.0 && windSpeed >= 35);
  const alertLevel = isRedFlag ? 'LEVEL 3: WARNING' : fdiScore >= 50 ? 'LEVEL 2: WATCH' : 'LEVEL 1: ADVISORY';
  const alertColorClass = isRedFlag ? 'level-warning' : fdiScore >= 50 ? 'level-watch' : 'level-advisory';

  return (
    <div className="early-warning-container">
      {/* HEADER */}
      <header className="ew-header">
        <div>
          <div className="ew-badge">
            <span className="pulse-dot"></span>
            WILDFIRE THREAT EARLY WARNING & PREDICTION
          </div>
          <h1>Atmospheric Fire Danger & Spread Simulator</h1>
          <p className="ew-lead">
            Coupling real-time meteorological vectors, Dead Fine Fuel Moisture (Nelson NFDRS),
            Fosberg Fire Weather Index (FFWI), and Huygens downwind forward spread modeling.
          </p>
        </div>
        <div className="ew-header-controls">
          <button 
            className="live-fetch-btn"
            onClick={handleFetchLiveWeather}
            disabled={isLiveLoading}
          >
            {isLiveLoading ? '🛰️ Querying Sensors...' : '🛰️ Pull Live Weather (Open-Meteo)'}
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
            <span className={`status-pill ${fuelMoisture <= 6.0 ? 'pill-red-flag' : 'pill-normal'}`}>
              {fuelMoisture <= 6.0 ? 'CRITICAL DRY' : 'ADEQUATE'}
            </span>
          </div>
          <div className="metric-number-row">
            <span className="metric-big">{fuelMoisture}%</span>
            <span className="metric-unit">10-hr litter</span>
          </div>
          <p className="metric-subtext">
            Extinction threshold ~20%. Flashover combustibility occurs at &lt;6%.
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

      {/* DUAL PANE: CONTROLS & MAP */}
      <div className="ew-main-dual">
        {/* SIDEBAR CONTROLS */}
        <aside className="ew-control-sidebar">
          <h2 className="control-section-title">Scenario & Simulator Parameters</h2>

          {/* PRESET SELECTOR */}
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
              <span>Ignition Origin / Thermal Core</span>
            </div>
            <div className="legend-row">
              <span className="legend-swatch swatch-cone"></span>
              <span>{forecastHours}h Huygens Spread Envelope</span>
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
              ? 'EMERGENCY ACTION: Critical fire weather and aggressive forward spread rate. Downwind communities in propagation cone must initiate staging.'
              : 'MONITORING ADVISORY: Routine containment protocol. Atmospheric conditions support moderate localized spread.'}
          </div>
        </div>

        {/* EXPOSED COMMUNITIES */}
        <div>
          <h3 style={{ fontSize: '1rem', margin: '0 0 10px 0', color: '#FFFFFF' }}>
            Downwind Settlement & Infrastructure Exposure Assessment ({exposedCommunities.length} Receptors)
          </h3>
          <div className="receptors-table-wrapper">
            <table className="receptors-table">
              <thead>
                <tr>
                  <th>Community / Asset</th>
                  <th>Population</th>
                  <th>Distance</th>
                  <th>Bearing</th>
                  <th>Downwind Cone</th>
                  <th>Arrival ETA</th>
                  <th>Threat Tier</th>
                </tr>
              </thead>
              <tbody>
                {exposedCommunities.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: '#94A3B8', padding: '16px' }}>
                      No registered population centers located within 40 km radius.
                    </td>
                  </tr>
                ) : (
                  exposedCommunities.map((rec) => (
                    <tr key={rec.name}>
                      <td><strong>{rec.name}</strong></td>
                      <td style={{ color: '#CBD5E1' }}>{rec.pop}</td>
                      <td>{rec.dist_km} km</td>
                      <td>{rec.bearing}°</td>
                      <td>
                        {rec.isDownwind ? (
                          <span style={{ color: '#FF3366', fontWeight: 700 }}>YES (Direct)</span>
                        ) : (
                          <span style={{ color: '#94A3B8' }}>Flank</span>
                        )}
                      </td>
                      <td style={{ color: rec.eta ? '#FFB800' : '#94A3B8', fontWeight: 600 }}>
                        {rec.eta ? `~${rec.eta} Hours` : 'N/A (Off Axis)'}
                      </td>
                      <td>
                        <span className={`threat-badge ${rec.sev === 'CRITICAL' ? 'badge-critical' : rec.sev === 'HIGH' ? 'badge-high' : rec.sev === 'ELEVATED' ? 'badge-elevated' : 'badge-flank'}`}>
                          {rec.sev}
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
          <strong>SCIENTIFIC DECISION-SUPPORT PROTOCOL:</strong> This early warning system generates analytical predictive models from satellite thermal infrared observations and atmospheric indices. Evacuation mandates and operational suppression directives are issued exclusively by designated civil protection and emergency management authorities.
        </div>
      </section>
    </div>
  );
};
