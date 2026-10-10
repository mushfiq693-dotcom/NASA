import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
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
  const location = useLocation();
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isSampleData, setIsSampleData] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
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

  if (!dataLoaded) return <div style={{padding: '2rem'}}>Initializing FireChronicle Systems...</div>;

  return (
    <>
      <SharedMotionScene />

      <nav className="shell-nav enter-from-top">
        <div className="nav-brand">
          <strong>FIRECHRONICLE</strong>
          <span className="badge">L2 MISSION CONTROL</span>
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

      {!['/', '/atlas'].includes(location.pathname) && (
        <aside className={`shell-sidebar enter-from-left ${sidebarOpen ? 'open' : 'closed'}`}>
          <button className="toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
          {sidebarOpen && (
            <div className="sidebar-content">
              <h3>Controls</h3>
              <p className="text-muted">Observation parameters & filters.</p>
            </div>
          )}
        </aside>
      )}

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

      {!['/', '/atlas'].includes(location.pathname) && (
        <footer className="shell-dock enter-from-bottom">
          <div className="timeline-placeholder">
            <span>NASA Observation Timeline Active</span>
          </div>
        </footer>
      )}
    </>
  );
}

export default App;
