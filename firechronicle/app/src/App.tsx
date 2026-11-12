import { useState, useEffect } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import './App.css';

import { Landing } from './routes/Landing';
import { Atlas } from './routes/Atlas';
import { Calendar } from './routes/Calendar';
import { DayDetail } from './routes/DayDetail';
import { Lab } from './routes/Lab';
import { Validation } from './routes/Validation';
import { Methodology } from './routes/Methodology';
import { Live } from './routes/Live';
import { EarlyWarning } from './routes/EarlyWarning';

import { SharedMotionScene } from './motion/scene';
import { RouteWipe } from './motion/RouteWipe';
import { fetchLiveFirmsHotspots, fetchLiveWeather, calculateFDI } from './services/firmsService';
import type { FirmsHotspot } from './services/firmsService';

interface EmergencyAlertState {
  hotspot: FirmsHotspot;
  fdiScore: number;
  dangerClass: string;
  windSpeed: number;
  windDir: number;
  spreadDistanceKm: number;
}

function App() {
  const [dataLoaded, setDataLoaded] = useState(false);

  // Real-Time Emergency Situation Alert State
  const [emergencyAlert, setEmergencyAlert] = useState<EmergencyAlertState | null>(null);
  const [isAlertDismissed, setIsAlertDismissed] = useState<boolean>(false);

  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('bengalflare_alerts_enabled');
    if (saved !== null) {
      return saved === 'true';
    }
    return 'Notification' in window && Notification.permission === 'granted';
  });

  const handleToggleAlerts = async () => {
    if (typeof window === 'undefined') return;

    if (!('Notification' in window)) {
      alert('Browser notifications are not supported in this browser.');
      return;
    }

    // If currently ON, toggle to OFF
    if (alertsEnabled) {
      setAlertsEnabled(false);
      localStorage.setItem('bengalflare_alerts_enabled', 'false');
      return;
    }

    // If currently OFF, turn ON
    if (Notification.permission === 'denied') {
      alert('Push notifications are blocked in your browser settings. Please allow notifications for this site to receive emergency wildfire alerts.');
      return;
    }

    if (Notification.permission === 'default') {
      try {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          setAlertsEnabled(true);
          localStorage.setItem('bengalflare_alerts_enabled', 'true');
        } else {
          setAlertsEnabled(false);
          localStorage.setItem('bengalflare_alerts_enabled', 'false');
        }
      } catch (err) {
        console.warn('Notification permission error:', err);
      }
    } else if (Notification.permission === 'granted') {
      setAlertsEnabled(true);
      localStorage.setItem('bengalflare_alerts_enabled', 'true');
    }
  };
  
  useEffect(() => {
    // Initial fetch to check API or fallback to fixtures (R1)
    const initData = async () => {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      if (isLocal) {
        try {
          const res = await fetch('http://127.0.0.1:8000/time-series');
          if (!res.ok) throw new Error("API not ok");
        } catch (err) {
          console.warn("API failed, falling back to fixtures", err);
          (window as any).__FIXTURES_USED__ = true;
        } finally {
          setDataLoaded(true);
        }
      } else {
        (window as any).__FIXTURES_USED__ = true;
        setDataLoaded(true);
      }

      // Check Real-Time NASA FIRMS Telemetry + Open-Meteo for Emergency Situations
      try {
        const spots = await fetchLiveFirmsHotspots(undefined, 2);
        if (spots.length > 0) {
          // Identify the most energetic active hotspot
          const topSpot = spots.slice().sort((a, b) => b.frp - a.frp)[0];
          const weather = await fetchLiveWeather(topSpot.latitude, topSpot.longitude);
          const { score, danger_class } = calculateFDI(
            weather.temperature_c,
            weather.relative_humidity_pct,
            weather.wind_speed_kmh
          );

          // Only dispatch prominent emergency alert if there is genuine elevated danger
          // (prevents false alarms when conditions are humid / low danger)
          if (score >= 40.0 || (topSpot.frp >= 60.0 && score >= 20.0)) {
            setEmergencyAlert({
              hotspot: topSpot,
              fdiScore: score,
              dangerClass: danger_class,
              windSpeed: weather.wind_speed_kmh,
              windDir: weather.wind_direction_deg,
              spreadDistanceKm: Number((weather.wind_speed_kmh * 0.12 * 3).toFixed(1))
            });

            // Trigger native OS Browser Web Push Notification only if user has alerts turned ON and permission granted
            const isAlertsActive = typeof window !== 'undefined' && localStorage.getItem('bengalflare_alerts_enabled') !== 'false';
            if (isAlertsActive && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              new Notification(`🚨 BengalFlare Wildfire Threat: ${topSpot.district}`, {
                body: `Active fire near ${topSpot.locationName} (${topSpot.frp.toFixed(1)} MW). Winds blowing at ${weather.wind_speed_kmh} km/h with high forward spread risk.`,
                icon: '/favicon.ico',
                tag: `fire-${topSpot.id}`
              });
            }
          }
        }
      } catch (e) {
        console.warn('Real-time emergency alert monitor scan completed with notice:', e);
      }
    };

    initData();
  }, []);

  if (!dataLoaded) return <div style={{padding: '2rem'}}>Initializing BengalFlare Systems...</div>;

  return (
    <>
      <SharedMotionScene />

      {/* GLOBAL REAL-TIME WILDFIRE EMERGENCY ALERT BANNER */}
      {emergencyAlert && !isAlertDismissed && (
        <div className="global-emergency-banner enter-from-top">
          <div className="emergency-badge-pulse">
            <span className="pulse-fire-icon">🚨</span>
            <span>REAL-TIME FIRE ALERT</span>
          </div>

          <div className="emergency-message-body">
            <strong>⚠️ Wildfire Spread Alert:</strong> Active fire near {emergencyAlert.hotspot.district} ({emergencyAlert.hotspot.locationName}) · High spread potential due to dry wind ({emergencyAlert.windSpeed} km/h).
          </div>

          <div className="emergency-actions-row">
            <button 
              type="button" 
              role="switch"
              aria-checked={alertsEnabled}
              className={`emergency-push-btn ${alertsEnabled ? 'granted' : ''}`}
              onClick={handleToggleAlerts}
              title={alertsEnabled ? "Wildfire push alerts are ON. Click to mute." : "Wildfire push alerts are OFF. Click to turn ON."}
            >
              {alertsEnabled ? '🔔 Alerts ON' : '🔕 Alerts OFF'}
            </button>
            <a 
              href="https://t.me/bengalflare_live" 
              target="_blank" 
              rel="noreferrer" 
              className="emergency-telegram-btn"
              title="Subscribe to official Telegram Early Warning Channel"
            >
              📢 Telegram Channel
            </a>
            <NavLink to="/early-warning" className="emergency-action-link">
              Inspect Threat Cone ➔
            </NavLink>
            <button 
              type="button" 
              className="emergency-dismiss-button"
              onClick={() => setIsAlertDismissed(true)}
              title="Dismiss Emergency Banner"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <nav className="shell-nav enter-from-top">
        <div className="nav-brand">
          <NavLink to="/" className="brand-logo-link" title="BengalFlare · Orbital Thermal Intelligence">
            <img 
              src="/bengalflare_logo_emblem.png" 
              alt="BengalFlare Logo" 
              className="brand-logo-img" 
              width="36" 
              height="36" 
            />
            <div className="brand-text-block">
              <span className="brand-name">
                <span className="brand-name-bengal">Bengal</span>
                <span className="brand-name-flare">Flare</span>
              </span>
              <span className="brand-subtitle">NASA THERMAL TELEMETRY · SINCE 2026</span>
            </div>
          </NavLink>
        </div>
        <div className="nav-links">
          <NavLink to="/">Overview</NavLink>
          <NavLink to="/atlas">Atlas</NavLink>
          <NavLink to="/calendar">Calendar</NavLink>
          <NavLink to="/live">Live</NavLink>
          <NavLink to="/early-warning">
            Early Warning
            {emergencyAlert && <span className="nav-alert-dot" title="Active Real-Time Threat Detected">LIVE ALERT</span>}
          </NavLink>
        </div>
        <div className="nav-controls-group">
          <a 
            href="https://t.me/bengalflare_live" 
            target="_blank" 
            rel="noreferrer" 
            className="nav-telegram-btn"
            title="Join BengalFlare Telegram Channel for Real-Time Wildfire Alerts"
          >
            <svg className="telegram-icon" viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.52 2.77-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z"/>
            </svg>
            <span>Telegram Channel</span>
          </a>
          <button 
            type="button" 
            role="switch"
            aria-checked={alertsEnabled}
            className={`nav-alert-toggle ${alertsEnabled ? 'active' : ''}`}
            onClick={handleToggleAlerts}
            title={alertsEnabled ? 'Live wildfire alerts are ON. Click to turn OFF.' : 'Live wildfire alerts are OFF. Click to turn ON.'}
          >
            <span className="toggle-bell">{alertsEnabled ? '🔔' : '🔕'}</span>
            <span className="toggle-text">{alertsEnabled ? 'Alerts ON' : 'Alerts OFF'}</span>
            <span className="toggle-slider">
              <span className="toggle-knob"></span>
            </span>
          </button>
        </div>
    </nav>

      <main className="shell-stage">
        <RouteWipe>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/atlas" element={<Atlas />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/day/:date" element={<DayDetail />} />
            <Route path="/lab" element={<Lab />} />
            <Route path="/validation" element={<Validation />} />
            <Route path="/methodology" element={<Methodology />} />
            <Route path="/live" element={<Live />} />
            <Route path="/early-warning" element={<EarlyWarning />} />
          </Routes>
        </RouteWipe>
      </main>
    </>
  );
}

export default App;
