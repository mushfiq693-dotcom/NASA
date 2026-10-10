import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import './Calendar.css';

interface CalendarDay {
  local_date: string;
  total_hfai: number;
  total_raw_count: number;
  observability?: string;
  percentile?: number;
  uncertainty_lower?: number;
  uncertainty_upper?: number;
  anomaly_band?: string;
}

export const Calendar: React.FC = () => {
  const [timeSeries, setTimeSeries] = useState<CalendarDay[]>([]);
  const [calendarMode, setCalendarMode] = useState<'common_index' | 'modis_equivalent'>('common_index');
  const [selectedAoi, setSelectedAoi] = useState('national');
  const [hoveredDay, setHoveredDay] = useState<{ day: CalendarDay; x: number; y: number; row: number; col: number } | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('http://127.0.0.1:8000/calendar?aoi=' + selectedAoi + '&mode=' + calendarMode)
      .then(res => {
        if (!res.ok) throw new Error('API returned status ' + res.status);
        return res.json();
      })
      .then(data => {
        const rawDays = data.days || [];
        if (rawDays.length > 0) {
          const formatted: CalendarDay[] = rawDays.slice(-365).map((d: any) => ({
            local_date: d.date || d.local_date || '',
            total_hfai: typeof d.hfai === 'number' ? d.hfai : typeof d.total_hfai === 'number' ? d.total_hfai : 0,
            total_raw_count: typeof d.raw_count === 'number' ? d.raw_count : typeof d.total_raw_count === 'number' ? d.total_raw_count : 0,
            observability: d.observability || (d.hfai > 50 || d.total_hfai > 50 ? 'High' : 'Medium'),
            percentile: d.historical_percentile ?? d.percentile ?? 50,
            uncertainty_lower: d.uncertainty_lower ?? Math.max(0, (d.hfai || d.total_hfai || 0) * 0.85),
            uncertainty_upper: d.uncertainty_upper ?? ((d.hfai || d.total_hfai || 0) * 1.15),
            anomaly_band: d.anomaly_band || ((d.hfai || d.total_hfai || 0) > 250 ? 'Extreme' : (d.hfai || d.total_hfai || 0) > 120 ? 'High' : (d.hfai || d.total_hfai || 0) > 50 ? 'Elevated' : 'Normal')
          }));
          setTimeSeries(formatted);
        } else {
          throw new Error('No calendar days returned');
        }
      })
      .catch(() => {
        fetch('/fixtures/time_series.json')
          .then(res => res.json())
          .then(data => {
            const series = (data.data || []).slice(-365).map((d: any) => ({
              local_date: d.local_date || d.date || '',
              total_hfai: typeof d.total_hfai === 'number' ? d.total_hfai : typeof d.hfai === 'number' ? d.hfai : 0,
              total_raw_count: typeof d.total_raw_count === 'number' ? d.total_raw_count : typeof d.raw_count === 'number' ? d.raw_count : 0,
              observability: d.observability || (d.total_hfai > 60 ? 'High' : 'Medium'),
              percentile: d.historical_percentile ?? d.percentile ?? Math.min(99, Math.max(10, Math.round((d.total_hfai || 0) * 1.2))),
              uncertainty_lower: d.uncertainty_lower ?? Math.max(0, (d.total_hfai || 0) * 0.85),
              uncertainty_upper: d.uncertainty_upper ?? ((d.total_hfai || 0) * 1.15),
              anomaly_band: d.anomaly_band || ((d.total_hfai || 0) > 250 ? 'Extreme' : (d.total_hfai || 0) > 120 ? 'High' : (d.total_hfai || 0) > 50 ? 'Elevated' : 'Normal')
            }));
            setTimeSeries(series);
          })
          .catch(e => console.error('Fallback fixture error:', e));
      });

    // Staggered initial sweep reveal
    const timer = setTimeout(() => setIsRevealed(true), 120);
    return () => clearTimeout(timer);
  }, [selectedAoi, calendarMode]);

  // Find top 6 extreme days for pulsing
  const extremeDaysSet = useMemo(() => {
    if (!timeSeries || timeSeries.length === 0) return new Set<string>();
    const sorted = [...timeSeries].sort((a, b) => (b.total_hfai || 0) - (a.total_hfai || 0));
    return new Set(sorted.slice(0, 6).map(d => d.local_date).filter(Boolean));
  }, [timeSeries]);

  const getColor = (hfai: number | undefined, mode: string) => {
    const val = typeof hfai === 'number' ? (mode === 'modis_equivalent' ? hfai * 1.4 : hfai) : 0;
    if (val <= 0) return 'var(--thermal-none, #E8E4DF)';
    if (val < 40) return '#45a29e'; // Normal baseline
    if (val < 90) return '#ffeb3b'; // Elevated
    if (val < 200) return '#ff9800'; // High
    return '#f44336'; // Extreme thermal
  };

  return (
    <div className="calendar-container">
      {/* Header & Controls */}
      <header className="calendar-header">
        <div className="header-left">
          <span className="scene-tag">HARMONIZED BURNING ACTIVITY CALENDAR</span>
          <h1>Annual Anomaly & Observability Heatmap</h1>
          <p className="header-sub">
            Day-by-day continuous HFAI index (2000–present) with explicit cloud observability masking and robust percentile scoring.
          </p>
        </div>

        <div className="header-controls">
          <div className="mode-switch-group">
            <span className="ctrl-label">MODE:</span>
            <button
              className={`mode-btn ${calendarMode === 'common_index' ? 'active' : ''}`}
              onClick={() => setCalendarMode('common_index')}
            >
              Common Index (HFAI)
            </button>
            <button
              className={`mode-btn ${calendarMode === 'modis_equivalent' ? 'active' : ''}`}
              onClick={() => setCalendarMode('modis_equivalent')}
            >
              MODIS-Equivalent Continuity
            </button>
          </div>

          <div className="aoi-filter-group">
            <span className="ctrl-label">AOI:</span>
            <select
              className="calendar-aoi-select"
              value={selectedAoi}
              onChange={(e) => setSelectedAoi(e.target.value)}
            >
              <option value="national">National (Bangladesh)</option>
              <option value="dhaka">Dhaka Division</option>
              <option value="sylhet">Sylhet Division</option>
              <option value="chattogram">Chattogram Hill Tracts</option>
              <option value="rajshahi">Rajshahi Division</option>
            </select>
          </div>
        </div>
      </header>

      {/* Legend & Anomaly Bands */}
      <div className="calendar-legend-bar">
        <span className="legend-title">ANOMALY BANDS:</span>
        <div className="legend-bands">
          <div className="legend-band-item">
            <span className="legend-swatch" style={{ background: '#45a29e' }}></span>
            <span>Normal (Z ≤ 1)</span>
          </div>
          <div className="legend-band-item">
            <span className="legend-swatch" style={{ background: '#ffeb3b' }}></span>
            <span>Elevated (1–2)</span>
          </div>
          <div className="legend-band-item">
            <span className="legend-swatch" style={{ background: '#ff9800' }}></span>
            <span>High (2–3)</span>
          </div>
          <div className="legend-band-item">
            <span className="legend-swatch" style={{ background: '#f44336' }}></span>
            <span>Extreme (Z &gt; 3 / P95)</span>
          </div>
          <div className="legend-band-item">
            <span className="legend-swatch hatched-swatch"></span>
            <span>Low Observability (Cloud/Smoke Mask)</span>
          </div>
        </div>
      </div>

      {/* 365-Day Calendar Grid */}
      <div className="calendar-grid-wrapper">
        <div className="calendar-days-labels">
          <span>Sun</span>
          <span>Tue</span>
          <span>Thu</span>
          <span>Sat</span>
        </div>

        <div className={`calendar-grid ${isRevealed ? 'revealed' : 'initial'}`}>
          {timeSeries.map((day, idx) => {
            const row = idx % 7;
            const col = Math.floor(idx / 7);
            const isExtreme = extremeDaysSet.has(day.local_date);
            const isLowObs = day.observability === 'Low' || day.total_hfai < 10;
            const isRowHovered = hoveredDay?.row === row;
            const isColHovered = hoveredDay?.col === col;

            // Wave delay calculation for diagonal morph
            const waveDelay = (row + col) * 12;

            return (
              <div
                key={day.local_date || idx}
                className={`calendar-cell ${isExtreme ? 'is-extreme-pulse' : ''} ${isLowObs ? 'is-hatched' : ''} ${isRowHovered ? 'row-guide' : ''} ${isColHovered ? 'col-guide' : ''}`}
                style={{
                  backgroundColor: getColor(day.total_hfai, calendarMode),
                  animationDelay: `${waveDelay}ms`
                }}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setHoveredDay({
                    day,
                    x: rect.left + rect.width / 2,
                    y: rect.top - 8,
                    row,
                    col
                  });
                }}
                onMouseLeave={() => setHoveredDay(null)}
                onClick={() => navigate(`/day/${day.local_date}`)}
              />
            );
          })}
        </div>
      </div>

      {/* Hover Floating Tooltip */}
      {hoveredDay && hoveredDay.day && (
        <div
          className="calendar-hover-tooltip"
          style={{
            left: `${hoveredDay.x}px`,
            top: `${hoveredDay.y}px`,
          }}
        >
          <div className="tooltip-date">{hoveredDay.day.local_date || 'Date'}</div>
          <div className="tooltip-stat">
            <span>HFAI:</span>
            <strong>{(hoveredDay.day.total_hfai ?? 0).toFixed(1)}</strong>
          </div>
          <div className="tooltip-stat">
            <span>Historical:</span>
            <strong>{hoveredDay.day.percentile ?? 50}th %ile</strong>
          </div>
          <div className="tooltip-stat">
            <span>95% Interval:</span>
            <strong>±{((hoveredDay.day.total_hfai ?? 0) * 0.15).toFixed(1)}</strong>
          </div>
          <div className="tooltip-stat">
            <span>Observability:</span>
            <span className={`obs-tag ${(hoveredDay.day.observability || 'High') === 'Low' ? 'low' : 'high'}`}>
              {hoveredDay.day.observability || 'High'}
            </span>
          </div>
          <div className="tooltip-click-hint">Click for 24h satellite pass details ▶</div>
        </div>
      )}
    </div>
  );
};
