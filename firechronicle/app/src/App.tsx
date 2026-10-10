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

import { SharedMotionScene } from './motion/scene';
import { RouteWipe } from './motion/RouteWipe';
import { useMotionMode } from './motion/useReducedMotion';

function App() {
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isSampleData, setIsSampleData] = useState(false);
  const { motionMode, setMotionMode } = useMotionMode();
  
  useEffect(() => {
    // Initial fetch to check API or fallback to fixtures (R1)
    const initData = async () => {
      try {
        const res = await fetch('http://127.0.0.1:8000/time-series');
        if (!res.ok) throw new Error("API not ok");
        setIsSampleData(false);
      } catch (err) {
        console.warn("API failed, falling back to fixtures", err);
        setIsSampleData(true);
        (window as any).__FIXTURES_USED__ = true;
      } finally {
        setDataLoaded(true);
      }
    };
    initData();
  }, []);

  if (!dataLoaded) return <div style={{padding: '2rem'}}>Initializing BengalFlare Systems...</div>;

  return (
    <>
      <SharedMotionScene />

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
          {isSampleData && <span className="sample-badge">SAMPLE DATA — synthetic, not NASA observations</span>}
        </div>
        <div className="nav-links">
          <NavLink to="/">Overview</NavLink>
          <NavLink to="/atlas">Atlas</NavLink>
          <NavLink to="/calendar">Calendar</NavLink>
          <NavLink to="/lab">Sensor Lab</NavLink>
          <NavLink to="/validation">Validation</NavLink>
          <NavLink to="/methodology">Methodology</NavLink>
          <NavLink to="/live">Live</NavLink>
        </div>
        <div className="motion-toggle-wrapper">
          <label className="motion-label" htmlFor="motion-select">MOTION:</label>
          <select
            id="motion-select"
            className="motion-select"
            value={motionMode}
            onChange={(e) => setMotionMode(e.target.value as any)}
          >
            <option value="full">Full Motion</option>
            <option value="reduced">Reduced</option>
            <option value="off">Off</option>
          </select>
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
          </Routes>
        </RouteWipe>
      </main>
    </>
  );
}

export default App;
