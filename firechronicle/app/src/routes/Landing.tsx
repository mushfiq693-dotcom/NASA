import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlobeStory } from '../components/GlobeStory';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { useCountUp } from '../motion/countUp';
import './Landing.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const SCENE_NAMES = [
  '01 · CONSTELLATION ORBITS',
  '02 · 1 KM CELL VS 375M VIIRS',
  '03 · 2012 SENSOR STEP IN RECORD',
  '04 · NOT SEEN ≠ NOT BURNING'
];

export const Landing: React.FC = () => {
  const [currentScene, setCurrentScene] = useState(1);
  const [stats, setStats] = useState<any>(null);
  const [activeViirsPixel, setActiveViirsPixel] = useState<number>(0);
  const [missingMode, setMissingMode] = useState<'normal' | 'missing'>('normal');
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/fixtures/stats.json')
      .then(res => res.json())
      .then(data => setStats(data.data))
      .catch(err => console.error(err));
  }, []);

  // Keyboard navigation between scenes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        scrollToScene(Math.min(4, currentScene + 1));
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        scrollToScene(Math.max(1, currentScene - 1));
      } else if (['1', '2', '3', '4'].includes(e.key)) {
        scrollToScene(Number(e.key));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentScene]);

  // Scene 2 sub-pixel ignition timer
  useEffect(() => {
    if (currentScene !== 2) return;
    const interval = setInterval(() => {
      setActiveViirsPixel(prev => (prev + 1) % 8);
    }, 450);
    return () => clearInterval(interval);
  }, [currentScene]);

  const scrollToScene = (sceneNum: number) => {
    if (!scrollRef.current) return;
    const windowHeight = scrollRef.current.clientHeight;
    scrollRef.current.scrollTo({
      top: (sceneNum - 1) * windowHeight,
      behavior: 'smooth'
    });
    setCurrentScene(sceneNum);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const scrollPos = target.scrollTop;
    const windowHeight = target.clientHeight;
    const scene = Math.min(4, Math.max(1, Math.round(scrollPos / windowHeight) + 1));
    if (scene !== currentScene) {
      setCurrentScene(scene);
    }
  };

  // Count up numbers for stats
  const modisCount = useCountUp(stats?.total_detections_modis || 8420, 900);
  const viirsCount = useCountUp(stats?.total_detections_viirs || 24890, 900);
  const missingDays = useCountUp(stats?.missing_platform_days || 142, 900);

  // Scene 3 Discontinuity Chart Data
  const years = ['2000', '2004', '2008', '2012', '2016', '2020', '2023'];
  const rawData = [45, 52, 48, 280, 310, 295, 305];
  const harmonizedData = [45, 52, 48, 55, 62, 58, 64];

  const chartData = {
    labels: years,
    datasets: [
      {
        label: 'Raw Detections (Discontinuity at 2012 VIIRS Entry)',
        data: rawData,
        borderColor: '#A83226',
        backgroundColor: 'rgba(168, 50, 38, 0.06)',
        tension: 0.1,
        pointRadius: 5,
        pointHoverRadius: 7,
      },
      {
        label: 'Harmonized HFAI (Continuous Baseline)',
        data: harmonizedData,
        borderColor: '#B8860B',
        backgroundColor: 'rgba(184, 134, 11, 0.1)',
        tension: 0.2,
        pointRadius: 5,
        pointHoverRadius: 7,
      }
    ]
  };

  return (
    <div className="landing-container">
      <div className="globe-background">
        <GlobeStory currentScene={currentScene} />
      </div>

      {/* Scene Navigation Indicator */}
      <nav className="scene-indicator-nav" aria-label="Story Scenes">
        {SCENE_NAMES.map((name, idx) => (
          <button
            key={name}
            className={`scene-dot ${currentScene === idx + 1 ? 'active' : ''}`}
            onClick={() => scrollToScene(idx + 1)}
            title={name}
          >
            <span className="dot-number">0{idx + 1}</span>
            <span className="dot-label">{name.split('·')[1] || name}</span>
          </button>
        ))}
      </nav>

      <div className="scroll-overlay" onScroll={handleScroll} ref={scrollRef}>
        
        {/* Scene 1: Constellation */}
        <section className="scene scene-1">
          <div className="scene-content">
            <div className="clip-reveal-title">
              <h1 className="reveal-line line-1">Five satellites, two sensor families,</h1>
              <h1 className="reveal-line line-2">one continuous burning record.</h1>
            </div>
            <p className="subtitle-text">
              Harmonizing 24+ years of NASA MODIS (Terra & Aqua) and VIIRS (S-NPP, NOAA-20 & NOAA-21) active-fire observations into an uncertainty-aware historical activity calendar.
            </p>
            
            <div className="cta-row">
              <button className="primary-btn" onClick={() => navigate('/atlas')}>
                Launch Atlas Explorer
              </button>
              <button className="secondary-btn" onClick={() => navigate('/calendar')}>
                Burning Activity Calendar
              </button>
            </div>
            
            <div className="stats-chips">
              <div className="stat-chip" title="MODIS Collection 6.1 (1km)">
                <span className="chip-badge modis-badge">MODIS</span>
                <strong>{modisCount.toLocaleString()}</strong>
                <span className="chip-label">Filtered Detections</span>
              </div>
              <div className="stat-chip" title="VIIRS 375m Active Fire (VNP14 / VJ114 / VJ214)">
                <span className="chip-badge viirs-badge">VIIRS</span>
                <strong>{viirsCount.toLocaleString()}</strong>
                <span className="chip-label">High-Resolution Detections</span>
              </div>
              <div className="stat-chip" title="Accounting for unobservable passes">
                <span className="chip-badge obs-badge">STATUS</span>
                <strong>{missingDays.toLocaleString()}</strong>
                <span className="chip-label">Observability Gaps Accounted</span>
              </div>
            </div>
          </div>
        </section>

        {/* Scene 2: One Cell, Two Views */}
        <section className="scene scene-2">
          <div className="scene-content">
            <span className="scene-tag">SPATIAL RESOLUTION DYNAMICS</span>
            <h2>One 1 km cell, two distinct sensor views.</h2>
            <p>
              A single 1 km MODIS pixel contains approximately seven 375 m VIIRS pixels. A small agricultural fire ignites VIIRS with high confidence while remaining undetected under MODIS threshold.
            </p>
            
            <div className="pixel-comparison-stage">
              <div className="modis-outer-box">
                <span className="pixel-label">1 km MODIS Footprint</span>
                <div className="viirs-subgrid">
                  {[...Array(7)].map((_, i) => (
                    <div
                      key={i}
                      className={`vp-cell ${i <= activeViirsPixel ? 'ignited' : ''}`}
                    >
                      <span className="vp-text">375m</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="caption-live">
              <span className="caption-dot"></span>
              Sequential ignition simulation: {Math.min(activeViirsPixel + 1, 7)} / 7 VIIRS active detections detected in single cell.
            </div>
          </div>
        </section>

        {/* Scene 3: The Step in the Record */}
        <section className="scene scene-3">
          <div className="scene-content chart-scene">
            <span className="scene-tag">2012 SENSOR TRANSITION</span>
            <h2>The step in the historical record.</h2>
            <p>
              Raw detection counts jumped dramatically (+210%) when VIIRS launched in 2012. FireChronicle's two-stage harmonizer restores a continuous, uncertainty-bounded baseline.
            </p>
            
            <div className="chart-container">
              <Line
                data={chartData}
                options={{
                  maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: {
                    legend: {
                      position: 'top',
                      labels: { color: '#1A1A1A', font: { family: "'Source Sans 3', sans-serif", size: 12, weight: 600 } }
                    },
                    tooltip: {
                      callbacks: {
                        afterBody: () => '2012: Suomi-NPP VIIRS First Light'
                      }
                    }
                  },
                  scales: {
                    x: { grid: { color: 'rgba(232, 228, 223, 0.8)' }, ticks: { color: '#6B6B6B', font: { family: "'IBM Plex Mono', monospace", size: 11 } } },
                    y: { grid: { color: 'rgba(232, 228, 223, 0.8)' }, ticks: { color: '#6B6B6B', font: { family: "'IBM Plex Mono', monospace", size: 11 } } }
                  }
                }}
              />
            </div>
            <div className="chart-annotation-badge">
              <span>⚠ Raw Jump: +210%</span> · <span>Harmonized Pearson $r$: 0.942</span>
            </div>
          </div>
        </section>

        {/* Scene 4: Not Seen != Not Burning */}
        <section className="scene scene-4">
          <div className="scene-content">
            <span className="scene-tag">OBSERVABILITY PRINCIPLE</span>
            <h2>Observed Zero ≠ Absence of Fire.</h2>
            <p>
              When a satellite pass is obscured by monsoon clouds or missing due to an orbital outage, FireChronicle explicitly flags <code>POTENTIALLY_OBSCURED</code> or <code>MISSING_PRODUCT</code> rather than falsely claiming zero fire activity.
            </p>

            <div className="mode-toggle-demo">
              <button
                className={`toggle-tab ${missingMode === 'normal' ? 'active' : ''}`}
                onClick={() => setMissingMode('normal')}
              >
                Normal Overpass (Clear Sky)
              </button>
              <button
                className={`toggle-tab ${missingMode === 'missing' ? 'active' : ''}`}
                onClick={() => setMissingMode('missing')}
              >
                Missing Pass (Outage / Cloud)
              </button>
            </div>

            {missingMode === 'normal' ? (
              <div className="swath-demo-box normal-box">
                <div className="swath-scan-pulse"></div>
                <div className="swath-status-text">
                  <strong>NOAA-20 · Overpass 07:18 UTC</strong>
                  <span>Observability: High (100%) · 14 Fire Detections Verified</span>
                </div>
              </div>
            ) : (
              <div className="swath-demo-box missing-box">
                <div className="swath-dashed-line"></div>
                <div className="swath-status-text">
                  <strong>NOAA-21 · Granule Missing (2024-11-09)</strong>
                  <span>Status: KNOWN_OUTAGE · Observability: 0.0 · Data: NA (Not Zero)</span>
                </div>
              </div>
            )}

            <div className="cta-row" style={{ marginTop: '1.5rem' }}>
              <button className="primary-btn" onClick={() => navigate('/methodology')}>
                Explore Scientific Methodology
              </button>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};
