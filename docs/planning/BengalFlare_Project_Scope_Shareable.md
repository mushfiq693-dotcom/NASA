# 🔥 BengalFlare: Wildfire Early Warning & Thermal Harmonization Platform
## Project Scope & Technical Direction Brief (Mentor & Team Executive Summary)

> **Prepared by:** Team Zen’in Clan · Gopalganj Science & Technology University (GSTU), Bangladesh 🇧🇩  
> **Challenge:** NASA Space Apps Challenge · Harmonization of MODIS & VIIRS Hot Spots  
> **Live Deployment:** [bengalflare.vercel.app](https://bengalflare.vercel.app) · **Repository:** [github.com/mushfiq693-dotcom/NASA](https://github.com/mushfiq693-dotcom/NASA)  
> **Immediate Planning Delivery Deadline:** November 3, 2026, at 9:00 PM BST (Asia/Dhaka)  
> **Document Status:** Planning & Documentation Phase (Non-operational; no live code modified)

---

### 1. Executive Summary & Core Mission
**BengalFlare** was originally conceived to solve the **"2012 Sensor Paradox"**—the artificial ~400% surge in global active-fire hotspot counts caused by the transition from NASA's 1,000 m MODIS (Terra/Aqua) to the higher-resolution 375 m VIIRS (Suomi-NPP, NOAA-20/21) instruments. 

Following our in-depth technical review with our NASA Space Apps mentor, BengalFlare is expanding its scope from a retrospective burning activity archive into an **integrated Wildfire Early Warning & Threat Assessment System Architecture**. Grounded in a retrospective case study of California's devastating **2018 Camp Fire**, this extension demonstrates how multi-sensor satellite thermal observations, calibrated historical baselines, and environmental risk factors (wind, fuel dryness, topography, and community exposure) can combine into a scientifically defensible early warning framework.

---

### 2. Problem Statement
1. **Satellite Observational Asymmetry:** MODIS detects larger, hotter fires (>8–10 MW) with coarse 1 km pixels; VIIRS detects small fires (<1 MW) with 375 m pixels. Naive aggregation creates misleading climate trends and false alarm spikes.
2. **The Temporal Latency Barrier:** Polar-orbiting LEO satellites (MODIS/VIIRS) only pass over a target area 2–4 times daily per satellite, with typical NASA FIRMS Near-Real-Time (NRT) latencies of 1–3 hours. In wind-driven megafires, a fire can expand miles before the next polar overpass.
3. **Absence of Unified Threat Context:** Existing open-access fire maps display isolated hotspot coordinates without real-time downwind vectoring, fuel moisture conditions, or critical infrastructure proximity.

---

### 3. Core Project Objectives
- **Objective 1 (Core Harmonization):** Reconcile 24+ years of MODIS and VIIRS records into a single, continuous, sensor-agnostic **Harmonized Fire Activity Index (HFAI)** on an equal-area 1 km grid (`EPSG:6933`) and H3 hexagonal mesh.
- **Objective 2 (Statistical Climatology):** Establish rigorous 24-year daily baselines ($P_{50}, P_{90}, P_{98}$) that account for zero-fire background days and satellite observation gaps (`Missing \ne 0`), isolating true ecological and agricultural anomalies.
- **Objective 3 (Early Warning & Threat Architecture):** Architect a multi-tiered alerting pipeline that fuses satellite hotspot detections with atmospheric wind fields, fuel dryness, slope, and population exposure to estimate downwind threat corridors.
- **Objective 4 (2018 Camp Fire Retrospective Demonstration):** Reconstruct the timeline of California's 2018 Camp Fire to benchmark detection latency, evaluate sensor agreement, and validate simulated threat alerts against official CAL FIRE / NIST post-incident reports.

---

### 4. Target Users & Stakeholders
1. **Wildfire Analysts & Incident Planning Teams:** For regional situational awareness, cross-sensor verification, and multi-day risk baselining.
2. **Disaster Management & Civil Protection Authorities:** For automated downwind exposure screening and prioritisation of aerial/ground reconnaissance.
3. **Environmental & Climate Researchers:** For uncorrupted long-term fire regime trends, carbon emissions accounting, and land-use analysis.
4. **Community Planners & WUI Advocates:** For identifying vulnerable wildland-urban interface (WUI) corridors with recurring seasonal fire anomalies.

---

### 5. Multi-Tiered System Architecture & Workflow

```
[Layer 1: Spaceborne Telemetry]
  ├── NASA FIRMS MODIS (Terra/Aqua C6.1 - 1 km)
  ├── NASA FIRMS VIIRS (S-NPP, NOAA-20, NOAA-21 - 375 m)
  └── Geostationary Thermal Triggers (GOES ABI - 2 km, 5-15 min)
              │
              ▼
[Layer 2: Harmonization & Climatology Engine]
  ├── EPSG:6933 1 km Equal-Area Grid & Cross-Sensor Normalization
  ├── Observation Status Tracking (Observed, Known Outage, Cloud Obscured)
  └── Statistical Anomaly Scoring against 24-Year Daily Baselines
              │
              ▼
[Layer 3: Environmental Risk & Exposure Fusion]
  ├── High-Resolution Wind & Weather (HRRR / ERA5-Land: Wind Vector, RH, Temp)
  ├── Fuel Dryness & Drought (USFS 1000-hr Fuel Moisture, ERC, KBDI)
  ├── Topography & Terrain Funnels (USGS 3DEP Slope & Aspect)
  └── Infrastructure Exposure (OpenStreetMap WUI, Evacuation Corridors, Settlements)
              │
              ▼
[Layer 4: Threat Assessment & Actionable Alerting]
  ├── Level 1: Fire Weather Watch (Elevated pre-ignition environmental risk)
  ├── Level 2: Thermal Hotspot Alert (Multi-sensor satellite detection confirmed)
  ├── Level 3: Wildfire Threat Warning (Rapid spread projected toward populated WUI)
  └── Multi-Channel Dispatch (Interactive WebGL Atlas, In-App Webhook, Push)
```

---

### 6. Critical Scientific Distinctions & Boundaries

To preserve strict scientific and operational integrity:

| Tier | Definition | Satellite Capabilities & BengalFlare Scope |
| :--- | :--- | :--- |
| **1. Fire Detection** | Identifying an active thermal anomaly from space. | High confidence with MODIS/VIIRS/GOES; subject to orbital pass times and cloud cover. |
| **2. Fire Danger Assessment** | Estimating meteorological and fuel conditions supporting ignition and explosive growth. | Derived from NWP weather (HRRR/ERA5), ERC, fuel moisture, and drought indices. **Hotspots alone cannot do this.** |
| **3. Fire Spread & Exposure** | Estimating fire propagation vectors and identifying downwind vulnerable assets. | Modeled via Huygens/Rothermel wind-slope propagation vectors intersecting settlement polygons. |
| **4. Early Warning** | Providing actionable, verified information to authorities and public. | BengalFlare provides **decision-support intelligence only**. It does **NOT** issue mandatory evacuation orders, which remain the sole legal authority of emergency services. |

---

### 7. 2018 Camp Fire Case Study Scope
- **Ignition:** Nov 8, 2018, ~06:15 PST near Pulga, CA (Feather River Canyon).
- **Incident Reality:** Driven by 50+ mph Jarbo Gap downslope winds and single-digit relative humidity, the fire traversed Concow and struck Paradise within 90 minutes.
- **Satellite Reconstruction:**
  - *Pre-ignition (02:30 PST):* Nighttime VIIRS passes showed zero anomalies.
  - *Ignition + 15–30 min (06:30–06:45 PST):* Coarse geostationary GOES-16 ABI captured earliest thermal pixel.
  - *LEO Polar Overpasses (10:45 PST Terra; 12:45 PST Aqua; 13:45 PST S-NPP):* Detailed high-resolution fire front and massive FRP (>1,000 MW) mapping after Paradise was already impacted.
- **Demonstration Goal:** Prove how combining pre-ignition Red Flag fire weather indices with rapid geostationary detection and high-resolution LEO fire front perimeter tracking creates a coherent early warning timeline.

---

### 8. System Inputs & Output Specifications

#### Primary Inputs:
- **Active Fire:** NASA FIRMS Standard & NRT Archives (MODIS MCD14DL, VIIRS VNP14IMGTDL / VJ114IMGTDL).
- **Weather & Wind:** NOAA HRRR (3 km hourly) for Camp Fire case study; ECMWF ERA5-Land (9 km) for long-term historical baseline.
- **Fuels & Vegetation:** USGS/USFS LANDFIRE Scott & Burgan 40 Fire Behavior Fuel Models (FBFM40); MODIS NDVI/NDWI.
- **Topography:** USGS 3DEP 30 m DEM (Elevation, Slope, Aspect).
- **Vulnerability:** US Census TIGER / OpenStreetMap building footprints, road networks, and population density grids.

#### Key System Outputs:
- **Harmonized Activity Index (HFAI):** Cross-calibrated, energy-weighted fire metric per grid-cell-day.
- **Seasonal Anomaly Map:** Dynamic H3 hexagonal map identifying statistical deviations from 24-year climatology.
- **Downwind Hazard Corridor:** Dynamic elliptical spread cone based on real-time wind speed, direction, and terrain slope.
- **Alert Dossier & Evidence Log:** Structured JSON payload detailing sensor confidence, overpass time, weather conditions, estimated FRP, and intersecting downwind infrastructure.

---

### 9. MVP Scope vs. Out-of-Scope (Strict Boundaries)

#### In-Scope for MVP Prototype:
- [x] Fix current codebase flaws (proper national border clipping, cross-sensor deduplication, true zero-fire background integration).
- [x] Implement empirical quantile regression / cross-calibration between coincident MODIS and VIIRS passes.
- [x] Ingest historical HRRR / ERA5 wind and weather variables for the Camp Fire benchmark area (Butte County, CA) and Bangladesh pilot zones.
- [x] Reconstruct Camp Fire multi-sensor timeline (GOES, MODIS, VIIRS) with interactive replay slider on MapLibre GL.
- [x] Rule-based 3-level alert engine with evidence panel and JSON API output.

#### Strictly Out-of-Scope (Deferred to Future Production):
- [ ] Physics-based 3D computational fluid dynamics (CFD) fire behavior simulations (e.g., FARSITE / WRF-SFIRE).
- [ ] Direct consumer mass SMS / public sirens / automated evacuation ordering.
- [ ] Airborne infrared or drone-based live video streaming.
- [ ] Global real-time sub-minute edge processing.

---

### 10. Team Roles & Accountability (Zen’in Clan)

| Member | Assigned Role | Accountability in Implementation |
| :--- | :--- | :--- |
| **Kazi Mushfiqur Rahman** | **Team Lead & Backend Engineer** | Overall architecture, FastAPI backend, DuckDB analytics, LEO/GEO data pipelines, and alerting engine. |
| **Farhan Zaman Aurko** | **Frontend Engineer** | React 19 UI, MapLibre WebGL map layers, Camp Fire temporal playback slider, and alert visualizer. |
| **Nasir A. Efty** | **Product Manager & QA** | NASA Space Apps rubric compliance, acceptance testing, data validation protocols, and user stories. |
| **Shakib Al Hasan** | **Remote Sensing Researcher** | Sensor physics, overpass geometry calibration, HRRR/ERA5 weather ingestion, and CAL FIRE benchmark validation. |
| **Anika Islam** | **Scientific Presenter** | Technical documentation, executive briefing narratives, mentor presentations, and pitch voiceover. |
| **Sadhin Roy** | **Visual & Media Producer** | System architecture diagrams, video demonstration walkthrough, UI risk badges, and visual overlays. |

---

### 11. Proposed Project Milestones (Asia/Dhaka Timeline)
- **Milestone 0 (Immediate):** Mentor Planning Package Review & Alignment · **November 3, 2026, 9:00 PM BST**
- **Milestone 1:** Data Ingestion Hardening & Zero-Background Grid Repair · **November 20, 2026**
- **Milestone 2:** Cross-Sensor Empirical Harmonization & Climatology Engine · **December 5, 2026**
- **Milestone 3:** Environmental Weather & Fuel Risk Factor Integration · **December 20, 2026**
- **Milestone 4:** Downwind Exposure Modeling & Rule-Based Alert Engine · **January 5, 2027**
- **Milestone 5:** Camp Fire Retrospective Simulation & Benchmarking · **January 18, 2027**
- **Milestone 6:** Full-Stack WebGL Atlas Integration & Final Demo Showcase · **January 31, 2027**

---

### 12. Mentor Review Action Items
1. Confirm the multi-sensor tiered alerting paradigm (GOES rapid trigger + MODIS/VIIRS high-resolution perimeter tracking).
2. Validate proposed use of NOAA HRRR and USFS ERC for the Camp Fire retrospective case study.
3. Review the proposed 3-level alert framework to ensure alignment with standard emergency management terminology.

