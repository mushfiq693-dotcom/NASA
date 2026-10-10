# BengalFlare — Master Build Prompt v3
NASA Space Apps Challenge 2026 · Harmonization of MODIS and VIIRS Hot Spots
(Merged from: master_prompt_firechronicle_system_build.md + MODIS_VIIRS_Harmonization_Research_Report_v2.md. Where they conflicted, this file wins.)

---

## 0. How you (the coding agent) must work

You are acting as Principal Software Architect + Remote-Sensing Engineer + Data Scientist + Full-Stack Developer + Motion/UI Engineer.

Operating rules:
1. Work in the phases of Section 14. Do not start a phase before the previous phase's gate passes. After each gate, write a short entry in `docs/DECISIONS.md` (what was decided, why, what was measured).
2. **Never fabricate a number.** Every metric, count, correlation, percentage shown in the UI, README, or pitch must come from code that ran on real data. If a result is not computed yet, the UI shows "not computed" rather than a placeholder.
3. The KPI targets in Section 7.3 are goals to test against, not results to display. If they are missed, report the real values honestly.
4. If a required input (Section 17) is missing, stop and ask once with a precise list. Do not invent credentials, boundaries, or datasets.
5. If NASA network access fails, fall back to the cached sample dataset (`data/sample/`) so the app always runs end to end. Label sample-data mode visibly in the UI.
6. Prefer the simplest model that passes validation. No neural networks unless every baseline in 6.2 has been beaten and documented.

---

## 1. Mission and identity

Build **BengalFlare**: a web application that harmonizes NASA MODIS and VIIRS active-fire records (2000–present) into a common, uncertainty-aware, observability-aware **Burning Activity Calendar**, with Bangladesh as the primary demonstration region and South Asia as the expansion target.

One-line pitch (use verbatim in README header):
> BengalFlare turns NASA's MODIS and VIIRS active-fire observations into one uncertainty-aware historical activity record that separates "no fire" from "no visibility", then shows when and where burning is normal, unusual, persistent, or critical.

Intended users: early-warning and emergency-response staff, scientists, land managers.

What is being harmonized (state this precisely in the UI methodology panel): *satellite-observed fire activity*, not physical fire extent, not burned area.

---

## 2. Scientific principles (non-negotiable)

P1. **Observed zero ≠ no fire.** Every cell-day carries an observation status: `OBSERVED_DETECTION`, `OBSERVED_NO_DETECTION`, `MISSING_PRODUCT`, `KNOWN_OUTAGE`, `POTENTIALLY_OBSCURED`, `UNKNOWN`. Never silently convert missing to zero. Time series use NA for unobservable cells.

P2. **Observability is a separate axis from activity.** Every output has Activity, Observability, Uncertainty, Sensor Agreement. The UI must be able to show "HIGH activity / LOW observability" and "LOW detections / LOW observability".

P3. **MODIS is not ground truth.** The primary target is a common activity index (HFAI). A "MODIS-equivalent" mode is provided as a clearly labelled, switchable baseline for continuity with the historical record.

P4. **Platform-aware.** Treat Terra, Aqua, S-NPP, NOAA-20, NOAA-21 separately; never collapse platforms before the overlap table is built.

P5. **Standard Processing for science, NRT for live panel only.** Never train on NRT where Standard exists for the interval. Mark every record with `processing_stream`.

P6. **Raw count is not the activity metric.** HFAI combines occurrence, intensity (FRP), persistence, quality, and uncertainty.

P7. **Preserve raw data.** Deduplication produces `cluster_count` alongside `raw_count`; raw observations are never destroyed.

P8. **No hard-coded sensor corrections.** Do not hard-code "scale VIIRS by 65%" or a fixed bow-tie geometry. Learn adjustments from overlap data per context; derive pixel area from each record's `scan` and `track` fields.

P9. **Project-defined thresholds are labelled as such.** Z-score/percentile bands are "BengalFlare thresholds", never "NASA thresholds".

P10. **Availability is read at runtime**, not from static pages (see 3.3).

---

## 3. Data specification

### 3.1 Products
- MODIS Collection 6.1 active fire (Terra from 2000-11-01, Aqua from 2002-07-03; ~1 km).
- VIIRS 375 m active fire (VNP14IMG S-NPP, VJ114IMG NOAA-20, VJ214IMG NOAA-21).
- Attributes to keep: latitude, longitude, acq_date, acq_time (UTC), satellite, instrument, confidence, frp, daynight, scan, track, version, type (where present), brightness (MODIS) / bright_ti4, bright_ti5 (VIIRS), source_file, processing_stream.
- Lat/lon are pixel centres, not exact fire positions.

### 3.2 Access strategy
- **Historical research record:** NASA archive (LAADS / FIRMS standard-processing downloads). Do NOT pull decades through the Area API.
- **Operational / live panel:** FIRMS Area API (bounding box, max 5 days per call, MAP_KEY limit 5,000 transactions / 10 min, large requests count multiple) with NRT; fallback to LANCE when the API is delayed or down.
- Implement client-side rate limiting, retry with exponential backoff, and on-disk caching of every response.
- Display layers can use FIRMS WMS (EPSG:4326 / 3857) and NASA GIBS.

### 3.3 Runtime metadata (build first)
- Call `data_availability` and `missing_data` at init; write `metadata/product_availability.csv` and `metadata/missing_dates.csv` with fetch timestamp.
- Different NASA pages disagree on NOAA-20 start (2018-04-01 vs 2020-01-01). The service response is authoritative.

### 3.4 Platform transition
- Suomi NPP science-product delivery ceases **2026-11-01**. Keep S-NPP as a historical bridge; the live pipeline must run on NOAA-20 + NOAA-21 (+ MODIS while available) without S-NPP.

### 3.5 Version rule
- Never filter historically on `type` without checking `version` (the 2025 Collection-2 monthly Type bug was fixed in May 2025 via reprocessing to version 3). Store version on every row; assert in tests.

### 3.6 QA filtering
- Remove or flag: low confidence (keep the original confidence; make the cutoff a config value, default drops MODIS <30 and VIIRS 'low'), type ≠ presumed vegetation fire (flag, do not delete: volcano, static land source, offshore), known static thermal sources detected via multi-year recurrence at the same cell.
- Every filter writes a counter to `reports/qa_summary.json` (rows in, rows out, per rule).

---

## 4. Architecture

```
[1 Ingest + QA] → [2 Grid/Index + Observation status] → [3 Overlap dataset + Harmonizer]
→ [4 Uncertainty + HFAI + Climatology + Anomaly] → [5 API] → [6 Animated frontend]
```

Stack (default; change only with a recorded reason):
- Storage/analytics: Parquet + DuckDB (spatial extension) for the research record. PostGIS only for the serving layer (calendar tables, tile queries). Do not introduce Spark/Sedona.
- Python 3.11, pandas/polars, geopandas, numpy, scikit-learn, LightGBM, `quantile-forest` (do NOT use scikit-garden: unmaintained), statsmodels (STL), h3.
- API: FastAPI. Cache: Redis (optional locally; in-process LRU fallback).
- Frontend: Vite + TypeScript + MapLibre GL JS (globe projection) + Chart.js (canvas, fixed-height containers) + satellite.js. Vector tiles served as MVT.
- Containerized with `docker compose up` bringing the full app up on sample data.

### 4.1 Spatial representation
- **Primary analysis grid: 1 km equal-area cells** (e.g. EPSG:6933 or a Bangladesh-appropriate projected CRS; record the CRS).
- **Sensitivity grids:** 5 km (≈0.05°) and 10 km. Harmonization stability across 1/5/10 km is a required experiment.
- **H3 resolution 7/8** used only for display aggregation and fast tile/cluster queries, never as the training unit.
- Point-to-cell assignment is acceptable for MVP; document the limitation. If time allows, use area-aware overlap using scan/track footprints.

### 4.2 Temporal representation
- Store `acq_datetime_utc`, `local_datetime` (Asia/Dhaka for Bangladesh), `local_date`. Cell-day is the core unit.
- Collocation hierarchy: same-overpass window (default ±30 min, configurable) → same day → weekly → monthly. Sensitivity analysis over these windows is required. Do not label time-of-day disagreement as pure sensor bias.

### 4.3 Deduplication
- L1: same platform + time + cell. L2: nearby detections inside a short time window. L3 (optional): DBSCAN event clusters, ε default 3.5 km, MinPts 2, with an ε sensitivity plot (2/3.5/5 km). Keep `raw_count` and `cluster_count`.

---

## 5. Data model

**raw_observation:** observation_id, sensor, platform, product, version, processing_stream, lat, lon, acq_datetime_utc, confidence, frp, brightness fields, scan, track, daynight, type, source_file.

**cell_day (per platform):** grid_id, date, platform, sensor, raw_count, cluster_count, presence, frp_sum, frp_mean, frp_max, confidence_mean, mean_scan, mean_track, observation_status, product_available, known_outage.

**overlap:** one row per grid_id × date with per-platform counts/FRP (Terra, Aqua, S-NPP, NOAA-20, NOAA-21), totals per sensor family, platform_count, observation_available, missing_flag, obscuration_flag, month, season, daynight, land_cover_id (optional).

**harmonized:** grid_id, date, hfai, harmonized_occurrence, harmonized_intensity, lower_95, upper_95, uncertainty, historical_percentile, anomaly_score, sensor_agreement, observability, quality_class, observation_status.

Observability score (v1, documented formula, validated later): product availability × platform coverage that day × (1 − obscuration proxy) × geometry factor. Obscuration proxy: use a documented cloud/smoke source if supplied (Section 17), else mark `obscuration_flag = UNKNOWN` and cap observability at "Medium".

---

## 6. Harmonization

### 6.1 Overlap-first diagnostics (before any ML)
Run and save figures for: counts (VIIRS vs MODIS scatter), FRP comparison, presence agreement (MODIS only / VIIRS only / Both / Unknown), bias and ratio with log handling for near-zero, spatial scale sensitivity (1/5/10 km), temporal sensitivity, context stratification (season, land cover, day/night, FRP bin, confidence, platform, scan/track).

### 6.2 Models (implement in this order, compare all)
- B0 raw concatenation (to demonstrate the discontinuity)
- B1 global ratio
- B2 context-specific ratio (season, day/night, land cover, platform)
- B3 log-linear regression: log(1+MODIS) ~ log(1+VIIRS) + log(1+FRP) + context
- B4 empirical quantile mapping (per context)
- B5 gradient boosting (LightGBM) and Quantile Regression Forest (`quantile-forest`)

QRF feature vector: VIIRS count, VIIRS FRP sum, mean scan angle/track, land cover ID, plus optional NDVI and relative humidity **only if** those datasets are supplied; document each feature's source and the join logic. Zero-inflation: model occurrence (classifier) and intensity (regressor) separately, then combine (hurdle approach).

### 6.3 Final two-stage observation-aware harmonizer
1. Sensor adjustment: Ĥ_s = f_s(Y_s, X) per sensor/platform.
2. Uncertainty-weighted combination: H = Σ w_s Ĥ_s / Σ w_s, with w_s from availability, confidence, obscuration, platform, geometry; weights fitted/validated, not invented.
Provide two output modes: `common_index` (default) and `modis_equivalent` (continuity mode).

### 6.4 Uncertainty
- Prediction intervals from QRF quantiles (q0.025, q0.975) and bootstrap for non-forest models.
- Report interval **coverage** on held-out data (target near 95%).
- Label honestly: "model/data uncertainty in the harmonized satellite-derived estimate", not total physical fire uncertainty.

### 6.5 HFAI
HFAI = f(occurrence, intensity, persistence, observability, quality, sensor agreement). Choose the functional form after exploratory analysis; start from standardized components with weights set by validation. Persistence = consecutive active days; recurrence = active days in window. Document the final formula in `docs/HFAI.md` with the evidence for it.

---

## 7. Validation

### 7.1 Splits (no random row-wise 80/20)
- Temporal block (example: train 2012–2019, validate 2020–2021, test 2022–2023; adjust to actual availability).
- Spatial holdout (hold out districts/divisions).
- Platform holdout (train on S-NPP, test on NOAA-20/21 where possible).
- Seasonal holdout (leave one season out).

### 7.2 Metrics
MAE, RMSE, Bias, PBIAS, Pearson, Spearman, Willmott's d, distributional distance (e.g. Wasserstein / KS), interval coverage; for occurrence: Brier, precision/recall, PR-AUC. Never rely on RMSE alone for zero-inflated data.

### 7.3 Target KPIs (goals to test, not claims)
Pearson r ≥ 0.92, RMSE ≤ 4.1 counts/grid, |PBIAS| ≤ 2.5%, Willmott d ≥ 0.95. These come from the project brief; the achieved values on held-out data are what get displayed. Raw baseline values quoted in older notes (r 0.62–0.74, RMSE 18.4, PBIAS +210%) are **not** to be reused; recompute from the data.

### 7.4 Before/after table (auto-generated, shown in UI)
Metric | Raw disagreement | Harmonized | Improvement — for each split type.

### 7.5 Independent validation (two clearly separate labels)
- DIRECT ACTIVE-FIRE VALIDATION (same-time higher-resolution active-fire sources, e.g. Landsat 30 m active fire where coverage exists).
- INDIRECT SPATIAL / BURNED-AREA VALIDATION (e.g. VIIRS VNP64A1 / MODIS MCD64A1): does harmonized activity precede burned-area signal? Supporting analysis only, never a training target.

---

## 8. Climatology and anomaly engine

- Baseline: per cell-group and calendar-day, windowed climatology (default ±5 days → 11-day window) built only from observable cell-days.
- Because fire data are zero-inflated and skewed, compute **both** the classic Z = (x − μ)/σ and a robust version (median/MAD) plus empirical percentile; use the robust/percentile version when σ ≈ 0 or zero fraction > configurable limit.
- STL decomposition (seasonal-trend, Loess) on aggregated weekly/daily series; handle zero inflation (ZIP or hurdle) when modelling counts.
- BengalFlare bands (project-defined, configurable): Normal Z ≤ 1; Elevated 1–2; High 2–3; Extreme > 3 (and/or percentile ≥ P95). Show the band **and** the observability label together.
- Critical-period logic: anomaly band ≥ High for ≥ N consecutive days with Observability ≥ Medium, or Extreme regardless of observability with a "low-visibility" annotation.

---

## 9. Regional context (interpretation layers, not deletion)

Implement as toggleable overlays and flags in the "Why?" panel. Never silently remove detections.
- Agricultural burning: Kharif rice (Oct–Nov) and Rabi wheat (Apr–May) seasonal windows over cropland; let the data show which dominates before asserting it.
- Industrial thermal sources: brick-kiln layer (Nov–Apr) around Dhaka/urban centres **if** a kiln dataset is supplied (Section 17); otherwise detect persistent static sources via recurrence (same cell active in ≥ N years on ≥ M days) and flag them as "persistent thermal source".
- Chittagong Hill Tracts jhum (Mar–Apr): seasonal highlands overlay.
- Transboundary context: show adjacent Indian/Myanmar activity for interpretation.
- Expansion test: does one harmonizer generalize Bangladesh → NE India → Myanmar → South Asia? If not, fit regional calibrations and show the comparison as a finding.

Include the NASA lesson cases as built-in "Method Notes" scenarios: NW India stubble burning 2024 (VIIRS S-NPP missing peak days, fog/cloud, late-afternoon burning) and Indonesia peat fires 2026 (smoke/underground fires cause counts to fall while severity rises).

---

## 10. API (FastAPI, versioned `/api/v1`)

- `GET /availability` — product/platform availability + missing dates
- `GET /calendar?aoi=&start=&end=&level=(national|division|district|cell)&mode=(common_index|modis_equivalent)` — per-day HFAI, percentile, anomaly, observability, uncertainty, sensor_agreement
- `GET /day/{date}?aoi=` — detail + explanation payload for "Why?"
- `GET /compare?aoi=&start=&end=` — raw vs harmonized series + agreement-map data
- `GET /validation` — before/after tables, splits, interval coverage
- `GET /tiles/{layer}/{z}/{x}/{y}.mvt` — vector tiles (hotspots, disagreement, HFAI cells)
- `GET /live` — latest NRT summary (NOAA-20/21 + MODIS) clearly labelled NRT
- `GET /orbits` — TLE-derived satellite tracks for the animation (cached)
- `GET /methodology` — structured methodology text with versions and parameters
- Rate limit per key/IP; response caching on aggregate queries; every response carries `data_version` and `generated_at`.
- Optional productization: per-tier limits and usage metering by calls and km² requested (stub only; do not build billing).

---

## 11. Frontend

### 11.1 Screens
1. **Atlas** (hero + map): animated globe → Bangladesh; layer switcher: Harmonized, MODIS, VIIRS, Disagreement (MODIS only / VIIRS only / Both / Unknown), Observability.
2. **Calendar**: year × day grid per AOI (national → division → district → cell); color = anomaly band; hatching/opacity = observability; hover shows percentile and ± interval; click opens Date Details.
3. **Date Details**: Activity, Historical percentile, Anomaly, Sensor support, Observability, Uncertainty, **Why?** panel (data-driven sentences built from the actual fields, including the low-visibility case).
4. **Sensor Lab**: before/after scatter, bias/ratio, bin-wise plots, 1/5/10 km and temporal-window sensitivity, platform comparison.
5. **Validation**: the before/after table, split-wise results, interval coverage, direct vs indirect validation labels.
6. **Methodology**: pipeline diagram, data versions, thresholds (labelled project-defined), limitations, "claims we do not make".
7. **Live** (NRT): current activity with a persistent NRT badge and S-NPP transition notice after 2026-11-01.

### 11.2 Animated NASA-themed background (required)
Build a single animated scene system used behind every screen, driven by real NASA data, not decorative loops:
- **Base:** MapLibre globe with NASA GIBS WMTS tiles — default `BlueMarble_ShadedRelief_Bathymetry` or MODIS Terra true-colour for day side; `VIIRS_Black_Marble` / VIIRS night-lights for the night side. Verify layer IDs and TileMatrixSets against the live GIBS GetCapabilities before use.
- **Day/night terminator** computed from the selected date/time and rendered as a soft gradient line on the globe.
- **Satellite constellation:** Terra, Aqua, S-NPP, NOAA-20, NOAA-21 propagated with satellite.js from current CelesTrak TLEs (verify NORAD IDs from CelesTrak; do not trust memory). Each satellite moves along its ground track; a swath footprint sweeps beneath it (MODIS ≈ 2330 km, VIIRS ≈ 3060 km swath width). Cached TLEs with a bundled snapshot fallback.
- **Scan reveal:** when the time slider reaches a satellite's actual overpass, fire detections from that pass appear along the swath with a short ignition pulse (size by FRP, colour by sensor, glow additive). Missing/outage passes render as a dashed, dim swath so "no visibility" is visible.
- **Time-lapse:** the Calendar scrubber drives the globe date; play/pause with speed control (1 day/s default).
- **Deep background:** subtle starfield with slow parallax; UI panels are translucent glass over the globe, never opaque slabs.
- **Page transitions:** camera moves (globe → Bangladesh → division → cell) rather than fades.
- **Performance budget:** ≥ 55 fps on a mid laptop at 1080p; cap pixel ratio at 2; render fire points with instanced/WebGL layers or supercluster (> 100,000 points must not freeze); pause rendering when the tab is hidden; use `requestAnimationFrame` with delta-time.
- **Accessibility/fallback:** respect `prefers-reduced-motion` (static globe + stepped time changes); WebGL-unavailable fallback to a static GIBS image; all information in animation also available in tables/text.
- **Charts:** Chart.js canvases inside fixed-height containers with `maintainAspectRatio: false`; no horizontal page scroll at any width ≥ 360 px.

### 11.3 Visual direction
Dark mission-control aesthetic grounded in real instrument imagery: deep space background, thermal palette for activity (dark red → orange → white-yellow), cool cyan/blue reserved for observability and uncertainty so the two axes never share a colour logic. One display typeface + one monospace for numbers. Keep a design token file (`tokens.css`). Avoid default component-library looks.

### 11.4 Copy rules (no generic text)
- Every string is either (a) bound to a field from the data/API, (b) a specific methodological statement, or (c) a label. No filler subtitles.
- **Banned phrases and patterns:** "Welcome to", "Powerful insights", "Seamless", "Cutting-edge", "Unlock", "At your fingertips", "Revolutionary", "Next-generation", "Leverage", "Empowering", "Real-time insights" (unless literally showing the NRT feed), lorem ipsum, stock placeholder stats, emoji-as-decoration.
- Good examples of acceptable microcopy (adapt to real fields): "NOAA-21 · no granule on 2024-11-09 (missing_data)"; "Aqua overpass 13:18 local · 0 detections · observability Medium"; "MODIS-only cells: 14 · VIIRS-only: 212 · both: 31".
- Empty/loading/error states must also be specific (name the product, date, and cause).
- Every number in the UI has a tooltip stating its source product, version, and processing stream.

---

## 12. Performance, cost, caching
- Pre-compute harmonized cell-day tables in batch; the API reads pre-aggregated Parquet/DuckDB or PostGIS tables.
- Cache aggregate queries (Redis or in-process). Serverless inference only for batch recompute jobs; the interactive path must not run the model.
- Tile generation precomputed for the zoom levels needed for Bangladesh; lazy for wider South Asia.

---

## 13. Repository layout
```
firechronicle/
├── README.md  (pitch, how to run, real results table, limitations)
├── docs/ (DECISIONS.md, HFAI.md, METHODOLOGY.md, DATA_SOURCES.md, CLAIMS.md)
├── metadata/ (product_availability.csv, missing_dates.csv)
├── data/ (raw/, interim/, processed/, sample/)
├── notebooks/ 01_availability … 10_calendar
├── src/ availability.py ingest.py schema.py quality.py grid.py deduplicate.py
│        collocation.py harmonization.py uncertainty.py validation.py anomaly.py calendar.py
├── tests/ (unit tests per module; test that missing ≠ zero; test version/type guard)
├── api/ main.py (+ routers)
├── app/ (frontend)
├── infra/ docker-compose.yml, Dockerfile(s), schema.sql
└── reports/ (qa_summary.json, validation tables, figures)
```
`schema.sql`: PostGIS tables for serving layer with GiST indexes on geometry, partitioning by year, H3 index column.

---

## 14. Phases and gates

**Phase A — Metadata & access.** Query availability + missing_data; write metadata CSVs. *Gate:* CSVs exist with fetch timestamps; platform start dates logged.

**Phase B — Pilot data.** Bangladesh AOI, 2018–2023 overlap, Standard Processing, MODIS Terra/Aqua + VIIRS S-NPP/NOAA-20 (add NOAA-21 where available). *Gate:* raw_observation Parquet + `qa_summary.json`.

**Phase C — Common representation.** 1 km grid, cell-day tables, dedup, observation_status. *Gate:* tests prove missing ≠ zero; row counts reconcile with raw.

**Phase D — Diagnostics.** All 6.1 experiments with saved figures. *Gate:* a written finding per experiment in `docs/METHODOLOGY.md` (real numbers).

**Phase E — Harmonization.** B0–B5 + final two-stage; uncertainty. *Gate:* comparison table across all models on validation split; decision recorded on whether ML beats B2–B4 (if not, ship the simpler model).

**Phase F — Validation.** All four split types, KPI check against 7.3, interval coverage, independent validation (direct and indirect, labelled). *Gate:* `reports/validation_*.csv` generated by code.

**Phase G — HFAI, climatology, anomaly, critical periods.** *Gate:* calendar table for Bangladesh 2018–2023 with percentile, anomaly, observability.

**Phase H — API.** All endpoints in Section 10 with tests. *Gate:* `docker compose up` serves them on sample data.

**Phase I — Frontend + animation.** Screens in 11.1, scene system in 11.2, copy rules in 11.4. *Gate:* fps and responsive checks; reduced-motion and WebGL-fallback verified; banned-phrase lint passes (a script greps the frontend for the banned list).

**Phase J — Expansion & polish.** NE India/Myanmar/South Asia generalization test; live NRT panel; S-NPP transition handling. Final README with real results.

MVP (if time runs short, ship exactly this): harmonized historical calendar, before/after sensor comparison, sensor-disagreement map, observability indicator, anomaly score, uncertainty — all on real Bangladesh data.

---

## 15. Claims to avoid (enforce in all text)
Never write: "every hotspot is a fire"; "no hotspot means no fire"; "VIIRS is exactly N× better"; "MODIS is ground truth"; "our model predicts fires" (no forecasting is validated); "NASA uses our threshold"; "first MODIS–VIIRS fusion method"; "gives exact burned area". Use: active-fire detection, satellite-observed fire activity, harmonized satellite-derived activity, uncertainty-aware estimate. `docs/CLAIMS.md` lists allowed and banned statements; a test checks the UI text against the banned list.

Safe novelty statement: *a reproducible, observation-aware, uncertainty-aware implementation that converts heterogeneous MODIS and VIIRS observations into a common historical burning-activity calendar, with explicit pre/post validation and interpretable observability diagnostics.*

---

## 16. Definition of done and demo script
Done = (1) `docker compose up` works on a clean machine; (2) all numbers shown in UI trace to generated reports; (3) the 3-minute demo below runs without manual fixes.

Demo (3 min): globe falls into Bangladesh → time-lapse of a November burning season showing satellite swaths and detections → switch to Disagreement layer (MODIS only / VIIRS only / Both / Unknown) → raw vs harmonized series across the 2012 sensor change → click a date: Why? panel explains Activity vs Observability → Validation tab shows before/after on held-out data → Methodology tab shows limitations.

---

## 17. Inputs the human must supply (agent: ask for any that are missing)
1. NASA Earthdata login and FIRMS MAP_KEY (as env vars, never committed).
2. Bangladesh boundary GeoJSON (national, division, district) — or approval to use geoBoundaries/GADM.
3. Land-cover source choice (default: MODIS MCD12Q1) and optional NDVI/RH sources (e.g. MOD13, ERA5).
4. Optional cloud/smoke source for obscuration proxy.
5. Optional brick-kiln point/polygon dataset; optional jhum area polygons.
6. Hosting target and machine specs (CPU/RAM/GPU, disk size) and expected data volume limit for the demo.
7. Team size, deadline (date/time), and who owns backend vs frontend.
8. UI language (English only, or English + Bangla toggle) and branding (logo/colours if any).
9. Submission requirements from the official challenge page (video length, repo link, license).
10. Whether the repo must be open-source and which license.
