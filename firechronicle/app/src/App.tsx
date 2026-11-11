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
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  const handleEnablePushNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert('Browser notifications are not supported in this browser.');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setPushPermission(perm);
      if (perm === 'granted') {
        new Notification('🚨 BengalFlare Wildfire Warning System Activated', {
          body: 'You will receive real-time push alerts on your screen when critical wildfire propagation is detected across Bangladesh.',
          icon: '/favicon.ico'
        });
      }
    } catch (err) {
      console.warn('Notification permission error:', err);
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

            // Trigger native OS Browser Web Push Notification if permission is granted
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
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
              className={`emergency-push-btn ${pushPermission === 'granted' ? 'granted' : ''}`}
              onClick={handleEnablePushNotifications}
              title="Receive instant push notifications on your phone or desktop even when site is closed"
            >
              {pushPermission === 'granted' ? '🔔 Web Push Active' : '🔔 Enable Web Push'}
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
            <svg className="brand-logo-icon" viewBox="0 0 36 36" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="bf-flare-grad" x1="6" y1="30" x2="30" y2="6" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#FF3D00" />
                  <stop offset="55%" stopColor="#FF6A00" />
                  <stop offset="100%" stopColor="#FFB800" />
                </linearGradient>
                <linearGradient id="bf-orbit-grad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#FF6A00" stopOpacity="0.3" />
                </linearGradient>
                <filter id="bf-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="1.5" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              {/* Orbital Telemetry Path */}
              <ellipse cx="18" cy="18" rx="14" ry="7" transform="rotate(-28 18 18)" stroke="url(#bf-orbit-grad)" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.85" />
              {/* Dynamic Flare Flame */}
              <path d="M18 4C18 4 11 14 11 20C11 24.4183 14.134 28 18 28C21.866 28 25 24.4183 25 20C25 14 18 4 18 4Z" fill="url(#bf-flare-grad)" filter="url(#bf-glow)" />
              {/* Inner Hot Core */}
              <path d="M18 12C18 12 14.5 18 14.5 21.5C14.5 23.9853 16.067 26 18 26C19.933 26 21.5 23.9853 21.5 21.5C21.5 18 18 12 18 12Z" fill="#FFF5D6" opacity="0.95" />
              {/* Orbiting Satellite Node */}
              <circle cx="28.5" cy="11.5" r="2" fill="#00E5FF" />
              <circle cx="28.5" cy="11.5" r="3.5" stroke="#00E5FF" strokeWidth="0.75" opacity="0.6" />
            </svg>
            <div className="brand-text-block">
              <span className="brand-name">
                <span className="brand-name-bengal">Bengal</span>
                <span className="brand-name-flare">Flare</span>
              </span>
              <span className="brand-subtitle">NASA THERMAL TELEMETRY</span>
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
            href="https://t.me/pika09_bot" 
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
            className={`nav-push-badge ${pushPermission === 'granted' ? 'active' : ''}`}
            onClick={handleEnablePushNotifications}
            title={pushPermission === 'granted' ? 'Browser Web Push alerts are active' : 'Click to enable Browser Web Push alerts'}
          >
            {pushPermission === 'granted' ? '🔔 Alerts On' : '🔔 Push Alerts'}
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
