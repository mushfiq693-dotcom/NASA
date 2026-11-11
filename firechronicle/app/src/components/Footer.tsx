import React from 'react';
import { NavLink } from 'react-router-dom';
import './Footer.css';

export const Footer: React.FC = () => {
  return (
    <footer className="bengal-footer">
      <div className="bengal-footer-inner">
        <div className="bengal-footer-brand">
          <div className="footer-brand-title">
            <span className="brand-name-bengal">Bengal</span>
            <span className="brand-name-flare">Flare</span>
            <span className="footer-badge-tag">NASA EO TELEMETRY</span>
          </div>
          <p className="footer-brand-desc">
            Harmonized Multi-Decadal Earth Observation Telemetry Record (2001–2026) for Bangladesh & the Bay of Bengal Basin.
          </p>
          <div className="footer-telegram-cta">
            <a 
              href="https://t.me/pika09_bot" 
              target="_blank" 
              rel="noreferrer" 
              className="footer-tg-link"
              title="Subscribe to official Telegram Early Warning Channel"
            >
              <svg className="telegram-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.52 2.77-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z"/>
              </svg>
              <span>Join Telegram Channel Alerts</span>
            </a>
          </div>
        </div>

        <div className="bengal-footer-nav">
          <div className="footer-nav-col">
            <span className="footer-col-title">MISSION SUITE</span>
            <div className="footer-nav-grid">
              <NavLink to="/atlas" className="footer-nav-link">
                Atlas Explorer
              </NavLink>
              <NavLink to="/calendar" className="footer-nav-link">
                Annual Heatmap Calendar
              </NavLink>
              <NavLink to="/live" className="footer-nav-link">
                Live Telemetry
              </NavLink>
              <NavLink to="/early-warning" className="footer-nav-link">
                Early Warning & FDI
              </NavLink>
              <NavLink to="/lab" className="footer-nav-link highlight-lab" title="Multi-Sensor Harmonization Laboratory">
                <span className="footer-link-dot lab-dot"></span>
                <span>Sensor Lab</span>
                <span className="lab-badge">Calibration</span>
              </NavLink>
            </div>
          </div>

          <div className="footer-nav-col">
            <span className="footer-col-title">SCIENTIFIC RIGOR</span>
            <div className="footer-nav-list">
              <NavLink to="/methodology" className="footer-nav-link">
                <span className="footer-link-dot"></span>
                Methodology & Proofs
              </NavLink>
              <NavLink to="/validation" className="footer-nav-link">
                <span className="footer-link-dot"></span>
                Empirical Validation
              </NavLink>
            </div>
          </div>
        </div>
      </div>

      <div className="bengal-footer-bottom">
        <span>NASA Space Apps Challenge · Earth Observation Data Harmonization</span>
        <span className="footer-sensor-pill">MODIS (Terra/Aqua) + VIIRS (S-NPP, NOAA-20, NOAA-21)</span>
      </div>
    </footer>
  );
};

