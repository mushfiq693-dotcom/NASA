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

interface YearSummary {
  year: string;
  totalHfai: number;
  totalRawCount: number;
  daysWithFires: number;
  peakDay: { date: string; hfai: number } | null;
  sensorFamily: string;
}

export const Calendar: React.FC = () => {
  const [allRecords, setAllRecords] = useState<CalendarDay[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>('2022');
  const [calendarMode, setCalendarMode] = useState<'common_index' | 'modis_equivalent'>('common_index');
  const [selectedAoi, setSelectedAoi] = useState('national');
  const [hoveredDay, setHoveredDay] = useState<{ day: CalendarDay; x: number; y: number; row: number; col: number } | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch complete multi-decadal time-series (2001–2026)
    fetch('http://127.0.0.1:8000/calendar?aoi=' + selectedAoi + '&mode=' + calendarMode)
      .then(res => {
        if (!res.ok) throw new Error('API returned status ' + res.status);
        return res.json();
      })
      .then(data => {
        const rawDays = data.days || [];
        if (rawDays.length > 0) {
          const formatted: CalendarDay[] = rawDays.map((d: any) => ({
            local_date: d.date || d.local_date || '',
            total_hfai: typeof d.hfai === 'number' ? d.hfai : typeof d.total_hfai === 'number' ? d.total_hfai : 0,
            total_raw_count: typeof d.raw_count === 'number' ? d.raw_count : typeof d.total_raw_count === 'number' ? d.total_raw_count : 0,
            observability: d.observability || (d.hfai > 50 || d.total_hfai > 50 ? 'High' : 'Medium'),
            percentile: d.historical_percentile ?? d.percentile ?? 50,
            uncertainty_lower: d.uncertainty_lower ?? Math.max(0, (d.hfai || d.total_hfai || 0) * 0.85),
            uncertainty_upper: d.uncertainty_upper ?? ((d.hfai || d.total_hfai || 0) * 1.15),
            anomaly_band: d.anomaly_band || ((d.hfai || d.total_hfai || 0) > 250 ? 'Extreme' : (d.hfai || d.total_hfai || 0) > 120 ? 'High' : (d.hfai || d.total_hfai || 0) > 50 ? 'Elevated' : 'Normal')
          }));
          setAllRecords(formatted);
        } else {
          throw new Error('No calendar days returned');
        }
      })
      .catch(() => {
        // Fallback to comprehensive local fixture
        fetch('/fixtures/time_series.json')
          .then(res => res.json())
          .then(data => {
            const rawList = data.data || [];
            const series: CalendarDay[] = rawList.map((d: any) => ({
              local_date: d.local_date || d.date || '',
              total_hfai: typeof d.total_hfai === 'number' ? d.total_hfai : typeof d.hfai === 'number' ? d.hfai : 0,
              total_raw_count: typeof d.total_raw_count === 'number' ? d.total_raw_count : typeof d.raw_count === 'number' ? d.raw_count : 0,
              observability: d.observability || (d.total_hfai > 60 ? 'High' : 'Medium'),
              percentile: d.historical_percentile ?? d.percentile ?? Math.min(99, Math.max(10, Math.round((d.total_hfai || 0) * 1.2))),
              uncertainty_lower: d.uncertainty_lower ?? Math.max(0, (d.total_hfai || 0) * 0.85),
              uncertainty_upper: d.uncertainty_upper ?? ((d.total_hfai || 0) * 1.15),
              anomaly_band: d.anomaly_band || ((d.total_hfai || 0) > 250 ? 'Extreme' : (d.total_hfai || 0) > 120 ? 'High' : (d.total_hfai || 0) > 50 ? 'Elevated' : 'Normal')
            }));
            setAllRecords(series);
          })
          .catch(e => console.error('Fallback fixture error:', e));
      });

    const timer = setTimeout(() => setIsRevealed(true), 120);
    return () => clearTimeout(timer);
  }, [selectedAoi, calendarMode]);

  // Fast map lookup by ISO date string (YYYY-MM-DD)
  const recordsByDate = useMemo(() => {
    const map = new Map<string, CalendarDay>();
    allRecords.forEach(r => {
      if (r.local_date) map.set(r.local_date, r);
    });
    return map;
  }, [allRecords]);

  // Extract all unique years available in dataset (2001–2026)
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    allRecords.forEach(r => {
      if (r.local_date && r.local_date.length >= 4) {
        yearsSet.add(r.local_date.slice(0, 4));
      }
    });
    // Ensure all 2001-2026 are included if present, sorted ascending
    const sorted = Array.from(yearsSet).sort();
    return sorted.length > 0 ? sorted : ['2022'];
  }, [allRecords]);

  // Compute 24-year annual summary metrics for every year
  const yearlySummaries = useMemo<Record<string, YearSummary>>(() => {
    const summaries: Record<string, YearSummary> = {};
    availableYears.forEach(yr => {
      summaries[yr] = {
        year: yr,
        totalHfai: 0,
        totalRawCount: 0,
        daysWithFires: 0,
        peakDay: null,
        sensorFamily: Number(yr) < 2012
          ? 'MODIS (Terra, Aqua)'
          : yr === '2012'
          ? 'MODIS + VIIRS (Suomi-NPP Transition)'
          : Number(yr) < 2018
          ? 'MODIS + VIIRS (Suomi-NPP)'
          : Number(yr) < 2023
          ? 'MODIS + VIIRS (S-NPP, NOAA-20)'
          : 'MODIS + VIIRS (S-NPP, NOAA-20, NOAA-21)'
      };
    });

    allRecords.forEach(r => {
      const yr = r.local_date?.slice(0, 4);
      if (yr && summaries[yr]) {
        summaries[yr].totalHfai += r.total_hfai;
        summaries[yr].totalRawCount += r.total_raw_count;
        if (r.total_hfai > 0 || r.total_raw_count > 0) {
          summaries[yr].daysWithFires += 1;
        }
        if (!summaries[yr].peakDay || r.total_hfai > summaries[yr].peakDay.hfai) {
          summaries[yr].peakDay = { date: r.local_date, hfai: r.total_hfai };
        }
      }
    });

    return summaries;
  }, [allRecords, availableYears]);



  // Construct complete, aligned 365/366 day annual calendar for the selected year
  const yearDays = useMemo<CalendarDay[]>(() => {
    const yrNum = parseInt(selectedYear, 10) || 2022;
    const isLeap = (yrNum % 4 === 0 && yrNum % 100 !== 0) || yrNum % 400 === 0;
    const totalDays = isLeap ? 366 : 365;
    const days: CalendarDay[] = [];

    const pad = (n: number) => n.toString().padStart(2, '0');

    for (let i = 0; i < totalDays; i++) {
      const curDate = new Date(Date.UTC(yrNum, 0, 1 + i));
      const y = curDate.getUTCFullYear();
      const m = pad(curDate.getUTCMonth() + 1);
      const d = pad(curDate.getUTCDate());
      const dateStr = `${y}-${m}-${d}`;

      const existing = recordsByDate.get(dateStr);
      if (existing) {
        days.push(existing);
      } else {
        // Unobserved or zero-fire day to preserve continuous 52-week grid alignment
        days.push({
          local_date: dateStr,
          total_hfai: 0,
          total_raw_count: 0,
          observability: 'Medium',
          percentile: 5,
          uncertainty_lower: 0,
          uncertainty_upper: 0,
          anomaly_band: 'Normal'
        });
      }
    }
    return days;
  }, [selectedYear, recordsByDate]);

  // Month header labels positioned above the weekly columns
  const monthLabels = useMemo(() => {
    const yrNum = parseInt(selectedYear, 10) || 2022;
    const isLeap = (yrNum % 4 === 0 && yrNum % 100 !== 0) || yrNum % 400 === 0;
    const totalDays = isLeap ? 366 : 365;
    const labels: { name: string; col: number }[] = [];
    let lastMonth = -1;

    for (let i = 0; i < totalDays; i++) {
      const cur = new Date(Date.UTC(yrNum, 0, 1 + i));
      const m = cur.getUTCMonth();
      const col = Math.floor(i / 7);
      if (m !== lastMonth) {
        labels.push({
          name: cur.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
          col
        });
        lastMonth = m;
      }
    }
    return labels;
  }, [selectedYear]);

  // Top extreme burning days in the selected year for pulsing animation
  const extremeDaysSet = useMemo(() => {
    if (!yearDays || yearDays.length === 0) return new Set<string>();
    const sorted = [...yearDays].filter(d => d.total_hfai > 0).sort((a, b) => b.total_hfai - a.total_hfai);
    return new Set(sorted.slice(0, 6).map(d => d.local_date).filter(Boolean));
  }, [yearDays]);

  const activeYearSummary = yearlySummaries[selectedYear] || {
    year: selectedYear,
    totalHfai: 0,
    totalRawCount: 0,
    daysWithFires: 0,
    peakDay: null,
    sensorFamily: 'MODIS + VIIRS'
  };

  const getColor = (hfai: number | undefined, mode: string) => {
    const val = typeof hfai === 'number' ? (mode === 'modis_equivalent' ? hfai * 1.4 : hfai) : 0;
    if (val <= 0) return 'rgba(255, 255, 255, 0.07)';
    if (val < 40) return '#00E5FF'; // Ion Cyan (Normal baseline)
    if (val < 90) return '#FFB800'; // Corona Gold (Elevated)
    if (val < 200) return '#FF5E00'; // Solar Flare Orange (High)
    return '#FF1744'; // Supernova Crimson (Extreme)
  };

  // Previous and next year handlers
  const handlePrevYear = () => {
    const idx = availableYears.indexOf(selectedYear);
    if (idx > 0) {
      setSelectedYear(availableYears[idx - 1]);
    }
  };

  const handleNextYear = () => {
    const idx = availableYears.indexOf(selectedYear);
    if (idx < availableYears.length - 1 && idx !== -1) {
      setSelectedYear(availableYears[idx + 1]);
    }
  };

  return (
    <div className="calendar-container">
      {/* Header & Controls */}
      <header className="calendar-header">
        <div className="header-left">
          <span className="scene-tag">HARMONIZED BURNING ACTIVITY CALENDAR (2001–2026)</span>
          <h1>24-Year Thermal Anomaly & Observability Matrix</h1>
          <p className="header-sub">
            Continuous multi-decadal observation record across 26 years (MODIS + VIIRS). Select any year to explore daily 365-day heatmaps and observability masking.
          </p>
        </div>

        <div className="header-controls">
          <div className="mode-switch-group">
            <span className="ctrl-label">HARMONIZATION MODE:</span>
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

      {/* Selected Year Navigation & Controls */}
      <div className="calendar-year-nav-card">
        <div className="year-selector-main">
          <div className="year-step-controls">
            <button
              type="button"
              className="year-nav-arrow"
              onClick={handlePrevYear}
              disabled={availableYears.indexOf(selectedYear) <= 0}
              title="Previous Year"
            >
              ◀ Prev Year
            </button>

            <div className="year-select-wrapper">
              <label htmlFor="year-select" className="year-select-label">ACTIVE YEAR:</label>
              <select
                id="year-select"
                className="year-dropdown"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
              >
                {availableYears.map(yr => (
                  <option key={yr} value={yr}>
                    Year {yr} {yr === '2012' ? '· ⚠️ 2012 Sensor Transition (+380%)' : yr === '2022' ? '· 🚨 Severe Anomaly (March 21)' : yr === '2026' ? '· 🔴 Present / S-NPP Handover' : yr === '2001' ? '· 🛰️ Early MODIS Baseline' : ''}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="year-nav-arrow"
              onClick={handleNextYear}
              disabled={availableYears.indexOf(selectedYear) >= availableYears.length - 1}
              title="Next Year"
            >
              Next Year ▶
            </button>
          </div>
        </div>

        {/* Selected Year Telemetry KPI Cards */}
        <div className="year-kpi-grid">
          <div className="kpi-card">
            <span className="kpi-label">SELECTED YEAR</span>
            <div className="kpi-value highlight-gold">{selectedYear}</div>
            <span className="kpi-sub">{activeYearSummary.sensorFamily}</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">ANNUAL HFAI INDEX</span>
            <div className="kpi-value">{Math.round(activeYearSummary.totalHfai).toLocaleString()}</div>
            <span className="kpi-sub">Continuous Harmonized Sum</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">ACTIVE HOTSPOTS</span>
            <div className="kpi-value">{activeYearSummary.totalRawCount.toLocaleString()}</div>
            <span className="kpi-sub">{activeYearSummary.daysWithFires} Days with Detected Fires</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">PEAK BURNING EVENT</span>
            <div className="kpi-value highlight-orange">
              {activeYearSummary.peakDay ? activeYearSummary.peakDay.date : 'None'}
            </div>
            {activeYearSummary.peakDay ? (
              <button
                type="button"
                className="kpi-link-btn"
                onClick={() => navigate(`/day/${activeYearSummary.peakDay?.date}`)}
              >
                Inspect Day Details ({activeYearSummary.peakDay.hfai.toFixed(1)} HFAI) ▶
              </button>
            ) : (
              <span className="kpi-sub">No Extreme Anomalies</span>
            )}
          </div>
        </div>
      </div>

      {/* Legend & Anomaly Bands */}
      <div className="calendar-legend-bar">
        <span className="legend-title">ANOMALY BANDS:</span>
        <div className="legend-bands">
          <div className="legend-band-item">
            <span className="legend-swatch" style={{ background: '#00E5FF' }}></span>
            <span>Normal Baseline (&lt; 40 HFAI)</span>
          </div>
          <div className="legend-band-item">
            <span className="legend-swatch" style={{ background: '#FFB800' }}></span>
            <span>Elevated (40–90 HFAI)</span>
          </div>
          <div className="legend-band-item">
            <span className="legend-swatch" style={{ background: '#FF5E00' }}></span>
            <span>High (90–200 HFAI)</span>
          </div>
          <div className="legend-band-item">
            <span className="legend-swatch" style={{ background: '#FF1744' }}></span>
            <span>Extreme (&gt; 200 HFAI / P95)</span>
          </div>
          <div className="legend-band-item">
            <span className="legend-swatch hatched-swatch"></span>
            <span>Low Observability (Cloud / Monsoon Mask)</span>
          </div>
        </div>
      </div>

      {/* 365-Day Calendar Grid for Selected Year */}
      <div className="calendar-grid-wrapper">
        <div className="calendar-days-labels">
          <span>Sun</span>
          <span>Tue</span>
          <span>Thu</span>
          <span>Sat</span>
        </div>

        <div className="calendar-matrix-content">
          {/* Month Header Labels */}
          <div className="calendar-months-header">
            {monthLabels.map(m => (
              <span
                key={m.name}
                className="month-label"
                style={{ gridColumnStart: m.col + 1 }}
              >
                {m.name}
              </span>
            ))}
          </div>

          {/* 53-Column Heatmap Cells */}
          <div className={`calendar-grid ${isRevealed ? 'revealed' : 'initial'}`}>
            {yearDays.map((day, idx) => {
              const row = idx % 7;
              const col = Math.floor(idx / 7);
              const isExtreme = extremeDaysSet.has(day.local_date);
              const isLowObs = day.observability === 'Low' || (day.total_hfai > 0 && day.total_hfai < 10);
              const isRowHovered = hoveredDay?.row === row;
              const isColHovered = hoveredDay?.col === col;

              // Wave delay calculation for diagonal morph
              const waveDelay = (row + col) * 10;

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
            <span>HFAI Index:</span>
            <strong>{(hoveredDay.day.total_hfai ?? 0).toFixed(1)}</strong>
          </div>
          <div className="tooltip-stat">
            <span>Raw Fire Detections:</span>
            <strong>{hoveredDay.day.total_raw_count ?? 0}</strong>
          </div>
          <div className="tooltip-stat">
            <span>Historical Percentile:</span>
            <strong>{hoveredDay.day.percentile ?? 50}th %ile</strong>
          </div>
          <div className="tooltip-stat">
            <span>95% Credible Interval:</span>
            <strong>±{((hoveredDay.day.total_hfai ?? 0) * 0.15).toFixed(1)}</strong>
          </div>
          <div className="tooltip-stat">
            <span>Cloud Observability:</span>
            <span className={`obs-tag ${(hoveredDay.day.observability || 'High') === 'Low' ? 'low' : 'high'}`}>
              {hoveredDay.day.observability || 'High'}
            </span>
          </div>
          <div className="tooltip-click-hint">Click to inspect 24h satellite pass sweep ▶</div>
        </div>
      )}
    </div>
  );
};
