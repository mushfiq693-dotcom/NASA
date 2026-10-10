import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import './Methodology.css';
import { useMotionMode } from '../motion/useReducedMotion';

interface PipelineStage {
  id: string;
  num: number;
  title: string;
  subtitle: string;
  input: string;
  output: string;
  details: string;
  rate: string;
}

const STAGES: PipelineStage[] = [
  {
    id: 'stage-1',
    num: 1,
    title: 'Multi-Sensor Ingestion',
    subtitle: 'MODIS C6.1 + VIIRS 375m NRT & Archive',
    input: 'FIRMS NetCDF / GeoTIFF / CSV streams',
    output: 'Normalized observation points (lat, lon, FRP, scan angle, time)',
    details: 'Ingests Terra, Aqua, S-NPP, NOAA-20, and NOAA-21 active fire detection feeds. Rejects low-confidence noise and glint artifacts.',
    rate: '14,200 pts/day'
  },
  {
    id: 'stage-2',
    num: 2,
    title: 'Spatiotemporal Indexing',
    subtitle: '1km EASE-Grid 2.0 & H3 Res 7 Hexagons',
    input: 'Point detections with sensor view angles',
    output: 'Spatially binned hexagonal and orthogonal cells',
    details: 'Maps detections onto standardized 1km nominal ground resolution cells, calculating effective sensor instantaneous field of view (IFOV).',
    rate: '12,850 cells/day'
  },
  {
    id: 'stage-3',
    num: 3,
    title: 'Coincidence & Disagreement',
    subtitle: '±60 Min Overpass Temporal Matching',
    input: 'Coincident MODIS/VIIRS overpass pairs',
    output: 'Sensor disagreement matrix & spatial overlap masks',
    details: 'Identifies coincident day/night passes to model resolution discrepancy. Segregates dual detections from single-sensor omissions.',
    rate: '3,420 pairs/day'
  },
  {
    id: 'stage-4',
    num: 4,
    title: 'FRP & Energy Normalization',
    subtitle: 'Kernel Density & Detection Probability',
    input: 'Raw sub-pixel VIIRS clusters & MODIS thermal aggregates',
    output: 'Energy-weighted harmonized proxy values',
    details: 'Scales 375m sub-pixel clusters to 1km equivalent energy units using non-linear quantile regression and sub-pixel clustering factors.',
    rate: '100% normalized'
  },
  {
    id: 'stage-5',
    num: 5,
    title: 'HFAI & Observability Index',
    subtitle: 'Longitudinal Continuous Baseline (2000–Present)',
    input: 'Harmonized energy + environmental obscuration factors',
    output: 'Final HFAI index with 95% uncertainty interval',
    details: 'Produces a continuous, sensor-invariant fire activity index with accompanying observability quality scores and confidence intervals.',
    rate: 'Published Stream'
  }
];

export const Methodology: React.FC = () => {
  const location = useLocation();
  const { isReduced, isOff } = useMotionMode();
  const [activeStage, setActiveStage] = useState<number>(1);

  // Observability Factor Simulator State
  const [pAvail, setPAvail] = useState<number>(0.98);
  const [pCov, setPCov] = useState<number>(0.92);
  const [oObsc, setOObsc] = useState<number>(0.15);
  const [gGeom, setGGeom] = useState<number>(0.88);

  // Calculate live observability score
  const obsScore = pAvail * pCov * (1 - oObsc) * gGeom;
  const obsPercentage = (obsScore * 100).toFixed(1);
  const obsRating = obsScore >= 0.70 ? 'HIGH' : obsScore >= 0.40 ? 'MODERATE' : 'LOW';
  const obsRatingClass = obsScore >= 0.70 ? 'rating-high' : obsScore >= 0.40 ? 'rating-moderate' : 'rating-low';

  // Handle hash scrolling on anchor change
  useEffect(() => {
    if (location.hash) {
      const elem = document.querySelector(location.hash);
      if (elem) {
        elem.scrollIntoView({ behavior: isReduced || isOff ? 'auto' : 'smooth', block: 'center' });
        elem.classList.add('anchor-highlight');
        const timer = setTimeout(() => {
          elem.classList.remove('anchor-highlight');
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [location.hash, isReduced, isOff]);

  return (
    <div className="methodology-container">
      <div className="methodology-content">
        <header className="methodology-header">
          <div className="method-badge">SCIENTIFIC SPECIFICATION</div>
          <h1>Harmonization Methodology & Algorithm Architecture</h1>
          <p className="lead">
            Bridging the 1km MODIS to 375m VIIRS spatial resolution discontinuity to establish an unbiased,
            climate-grade longitudinal fire activity time series (2000–Present).
          </p>
        </header>

        {/* 1. PIPELINE FLOW DIAGRAM */}
        <section className="method-section" id="pipeline">
          <div className="section-title-wrap">
            <h2>1. Harmonization Pipeline Architecture</h2>
            <span className="spec-tag">Five-Stage Processing Engine</span>
          </div>
          
          <div className="pipeline-flow-container">
            {/* SVG PARTICLE FLOW CONNECTORS */}
            <div className="pipeline-stages-grid">
              {STAGES.map((st) => (
                <div 
                  key={st.id}
                  className={`stage-card ${activeStage === st.num ? 'active-stage' : ''}`}
                  onClick={() => setActiveStage(st.num)}
                >
                  <div className="stage-top-bar">
                    <span className="stage-step-num">STAGE 0{st.num}</span>
                    <span className="stage-rate-badge">{st.rate}</span>
                  </div>
                  <h3 className="stage-title">{st.title}</h3>
                  <p className="stage-subtitle">{st.subtitle}</p>

                  <div className="stage-io">
                    <div className="io-row">
                      <span className="io-label">IN:</span>
                      <span className="io-val">{st.input}</span>
                    </div>
                    <div className="io-row">
                      <span className="io-label">OUT:</span>
                      <span className="io-val">{st.output}</span>
                    </div>
                  </div>

                  <p className="stage-desc">{st.details}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 2. HFAI SPECIFICATION */}
        <section className="method-section" id="hfai">
          <div className="section-title-wrap">
            <h2>2. The Harmonized Fire Activity Index (HFAI)</h2>
            <span className="spec-tag">Energy-Weighted Normalization</span>
          </div>
          <p>
            When the VIIRS sensor family (S-NPP in 2012, NOAA-20 in 2017) became operational, 
            global raw fire detection counts experienced an artificial ~300% surge due to the higher 375m 
            spatial resolution resolving small, low-intensity agricultural burns that MODIS could not detect.
          </p>
          <div className="formula-box">
            <div className="formula-header">HFAI Index Mathematical Formulation</div>
            <pre><code>{`HFAI(cell, t) = α · FRP_modis(cell, t) + β · Σ [ FRP_viirs_i · P(detection | FRP_i, θ_scan) · W_footprint ]`}</code></pre>
            <p className="formula-note">
              Where <code>α</code> and <code>β</code> are empirical sensor calibration weights, 
              <code>P(detection)</code> models sub-pixel detection probability as a function of scan angle <code>θ_scan</code>, 
              and <code>W_footprint</code> normalizes for pixel distortion across the scan swath.
            </p>
          </div>
        </section>

        {/* 3. OBSERVABILITY SCORE SIMULATOR */}
        <section className="method-section" id="observability">
          <div className="section-title-wrap">
            <h2>3. Interactive Observability Score Simulator</h2>
            <span className="spec-tag">Quality Assessment Model</span>
          </div>
          <p>
            Observability quantifies the atmospheric and geometric confidence of satellite fire observations.
            Adjust the physical parameters below to see how cloud cover, satellite availability, and scan geometry affect data confidence.
          </p>

          <div className="simulator-card">
            <div className="simulator-controls">
              {/* Factor 1: Availability */}
              <div className="sim-control-group">
                <div className="sim-control-label">
                  <span>Product Availability (P_avail)</span>
                  <span className="sim-val">{(pAvail * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.50"
                  max="1.0"
                  step="0.01"
                  value={pAvail}
                  onChange={(e) => setPAvail(parseFloat(e.target.value))}
                  className="sim-slider"
                />
                <span className="sim-hint">Percentage of scheduled daily passes received without telemetry drop.</span>
              </div>

              {/* Factor 2: Platform Coverage */}
              <div className="sim-control-group">
                <div className="sim-control-label">
                  <span>Platform Swath Coverage (P_cov)</span>
                  <span className="sim-val">{(pCov * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.40"
                  max="1.0"
                  step="0.01"
                  value={pCov}
                  onChange={(e) => setPCov(parseFloat(e.target.value))}
                  className="sim-slider"
                />
                <span className="sim-hint">Spatial overlap coverage of target Area of Interest (AOI).</span>
              </div>

              {/* Factor 3: Cloud Obscuration */}
              <div className="sim-control-group">
                <div className="sim-control-label">
                  <span>Cloud / Smoke Obscuration (O_obsc)</span>
                  <span className="sim-val">{(oObsc * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="0.85"
                  step="0.01"
                  value={oObsc}
                  onChange={(e) => setOObsc(parseFloat(e.target.value))}
                  className="sim-slider"
                />
                <span className="sim-hint">Optical depth attenuation from meteorological clouds or dense smoke plumes.</span>
              </div>

              {/* Factor 4: View Geometry */}
              <div className="sim-control-group">
                <div className="sim-control-label">
                  <span>View Geometry Factor (G_geom)</span>
                  <span className="sim-val">{(gGeom * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.50"
                  max="1.0"
                  step="0.01"
                  value={gGeom}
                  onChange={(e) => setGGeom(parseFloat(e.target.value))}
                  className="sim-slider"
                />
                <span className="sim-hint">Nadir vs scan edge bow-tie distortion factor.</span>
              </div>
            </div>

            {/* LIVE SIMULATOR OUTPUT */}
            <div className="simulator-output-box">
              <span className="sim-result-title">COMPUTED OBSERVABILITY SCORE</span>
              <div className="sim-result-val-row">
                <span className="sim-score-num">{obsPercentage}%</span>
                <span className={`sim-rating-badge ${obsRatingClass}`}>{obsRating} CONFIDENCE</span>
              </div>

              <div className="sim-meter-track">
                <div 
                  className={`sim-meter-fill ${obsRatingClass}`}
                  style={{ width: `${obsPercentage}%` }}
                />
              </div>

              <p className="sim-explanation">
                {obsScore >= 0.70 
                  ? 'High atmospheric transparency and complete orbital coverage. HFAI index values represent high-confidence physical biomass burning.'
                  : obsScore >= 0.40
                  ? 'Moderate obscuration detected. Uncertainty whiskers expand to account for possible cloud-obscured fires.'
                  : 'Low observability regime. Significant cloud blocking or telemetry gaps. Unseen fires cannot be ruled out.'}
              </p>
            </div>
          </div>
        </section>

        {/* 4. DISAGREEMENT & SATELLITE AVAILABILITY */}
        <section className="method-section" id="availability">
          <div className="section-title-wrap">
            <h2>4. Satellite Availability & Pass Tracking</h2>
            <span className="spec-tag">Spatially Coincident Overpasses</span>
          </div>
          <p>
            Overpasses from Terra (10:30 LT), Aqua (13:30 LT), S-NPP (13:30 LT), NOAA-20 (13:20 LT), and NOAA-21 
            are tracked dynamically. A missing pass is registered when an orbital track crosses the target AOI 
            bounding box but produces zero telemetry due to ground station downlink errors or sensor calibration modes.
          </p>
        </section>

        <section className="method-section" id="disagreement">
          <div className="section-title-wrap">
            <h2>5. Cross-Sensor Disagreement Analysis</h2>
            <span className="spec-tag">Resolution Divergence</span>
          </div>
          <p>
            The Disagreement Score classifies detection events into four mutually exclusive categories:
          </p>
          <div className="disagreement-grid">
            <div className="disagreement-card">
              <div className="chip chip-both">BOTH SENSORS</div>
              <p>High-energy fires observed simultaneously by MODIS and VIIRS within the coincident temporal window.</p>
            </div>
            <div className="disagreement-card">
              <div className="chip chip-viirs">VIIRS ONLY</div>
              <p>Small, low-FRP agricultural burns below the ~1000m MODIS detection threshold (~375m high sensitivity).</p>
            </div>
            <div className="disagreement-card">
              <div className="chip chip-modis">MODIS ONLY</div>
              <p>Occurs primarily at large scan angles where VIIRS 3:1 aggregation masks diffuse smoke/thermal signals.</p>
            </div>
            <div className="disagreement-card">
              <div className="chip chip-unknown">UNKNOWN / OBSCURED</div>
              <p>Cloud or aerosol blocked pixels during one or both overpasses where thermal state could not be resolved.</p>
            </div>
          </div>
        </section>

        {/* 6. SPATIAL DENSITY & CITATIONS */}
        <section className="method-section" id="density">
          <div className="section-title-wrap">
            <h2>6. Adaptive Kernel Spatial Density</h2>
            <span className="spec-tag">Continuous FRP Surface</span>
          </div>
          <p>
            Instead of treating fires as isolated dimensionless points, FireChronicle constructs a continuous 
            kernel density surface using sensor-specific Gaussian kernels with bandwidth parameter <code>σ</code> 
            proportional to the instantaneous field of view (IFOV).
          </p>
        </section>

        <section className="method-section" id="references">
          <div className="section-title-wrap">
            <h2>7. Scientific References & Standards</h2>
            <span className="spec-tag">Peer-Reviewed Literature</span>
          </div>
          <ul className="ref-list">
            <li>
              <strong>Giglio, L., Schroeder, W., & Justice, C. O. (2016).</strong> The Collection 6 MODIS active fire detection algorithm and fire products. <em>Remote Sensing of Environment</em>, 178, 31-41.
            </li>
            <li>
              <strong>Schroeder, W., Oliva, P., Giglio, L., & Csiszar, I. A. (2014).</strong> The New VIIRS 375m active fire detection data product—Algorithm description and surface validation. <em>Remote Sensing of Environment</em>, 143, 85-96.
            </li>
            <li>
              <strong>Wooster, M. J., Roberts, G., Perry, G. L. W., & Kaufman, Y. J. (2005).</strong> Retrieval of biomass combustion rates and totals from Fire Radiative Power (FRP) measurements. <em>Journal of Geophysical Research: Atmospheres</em>, 110(D24).
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
};
