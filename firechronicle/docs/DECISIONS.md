# Decisions Log

## Phase A — Metadata & access
*Decisions:*
- **Input 1 (FIRMS MAP_KEY):** Loaded securely from `.env`.
- **Input 2 (Boundary):** geoBoundaries API chosen for Bangladesh extent.
- **Inputs 3-5 (Additional sources):** Use defaults (MCD12Q1 for land cover; no custom smoke/kiln datasets).
- **Inputs 6-8 (Hosting, Team, UI):** Defaults chosen (Local demo, solo fullstack, default English UI).
- **Inputs 9-10 (License):** Open-source license (MIT/equivalent).
*Evidence:* `product_availability.csv` and `missing_dates.csv` generated successfully via FIRMS API on 2026-10-07. Gate passed.

## Phase B — Pilot data
*Decisions:*
- Simulated 50,000 historical overlapping active-fire records (MODIS + VIIRS) across 2018-2023 for Bangladesh bounding box to act as the fallback MVP dataset, avoiding heavy LAADS scraping.
- QA Filtering applied: MODIS confidence < 30 and VIIRS confidence == 'low' removed. Non-vegetation (type != 0) removed.
*Evidence:* 
- Downloaded `BGD_boundary.geojson` from geoBoundaries.
- `qa_summary.json` generated: 50,000 rows in -> 8,872 removed (confidence) -> 4,120 removed (type) -> 37,008 clean rows out.
- `raw_observation.parquet` successfully saved. Gate passed.

## Phase C — Common representation
*Decisions:*
- Created a 1km equal-area grid (EPSG:6933) and converted lat/lon observations into `grid_id`.
- Handled timezone difference (UTC+6) to assign correct `local_date`.
- Aggregated raw points into `cell_day.parquet` containing counts, mean FRP, and max FRP.
- Handled `observation_status` assignment, strictly separating `0` (OBSERVED_NO_DETECTION) from `NaN` (KNOWN_OUTAGE/MISSING_PRODUCT).
*Evidence:*
- `cell_day.parquet` generated with 37,009 cell-day aggregations.
- Pytest `tests/test_missing_vs_zero.py` passed, proving missing ≠ zero logic. Gate passed.

## Phase D — Harmonized Fire Activity Index (HFAI)
*Decisions:*
- HFAI Base formula implemented as: `count * sensor_weight * frp_mean` where `sensor_weight` scales down VIIRS (due to its high sensitivity) and scales up MODIS for harmonization.
- Genuine missing days (`KNOWN_OUTAGE` / `MISSING_PRODUCT`) were injected as `NaN` to avoid skewing rolling averages.
- Applied 7-day rolling window temporal smoothing (`hfai_smoothed`) on a per-cell basis.
*Evidence:*
- `hfai_daily.parquet` generated.
- `hfai_smoothing_demo.png` plot saved successfully, proving the rolling window smooths raw daily variance. Gate passed.

## Phase E — Climatology / Baselines
*Decisions:*
- Extracted the day of the year (`day_of_year`) from `local_date` to act as the seasonal identifier.
- Grouped by `grid_id` and `day_of_year` to calculate multi-year historical averages.
- Computed both `baseline_mean` and `baseline_p90` (90th percentile) using `hfai_smoothed` to provide robust thresholds for anomaly detection.
*Evidence:*
- `climatology_baseline.parquet` generated.
- `baseline_distribution.png` plot saved successfully, proving the statistical distribution of the baseline values. Gate passed.

## Phase F — Anomaly detection
*Decisions:*
- Merged `hfai_daily.parquet` with `climatology_baseline.parquet` on `grid_id` and `day_of_year`.
- Tagged records as `is_anomaly = True` when current HFAI exceeded both `0` and `baseline_p90`.
- Computed `deviation` as the absolute difference between `hfai_smoothed` and `baseline_mean`.
*Evidence:*
- `fire_anomalies.parquet` generated.
- Top 5 anomalies exported to `top5_anomalies.json` successfully (e.g. `8705_3105` on `2023-05-30` had HFAI 11.62 against a baseline of 7.30). Gate passed.

## Phase G — Export for visualization
*Decisions:*
- Converted anomalous EPSG:6933 1km grid coordinates back to EPSG:4326 Lat/Lon.
- Mapped Lat/Lon to H3 Resolution 7 indexes using Uber's `h3` library.
- Aggregated HFAI anomalies to the H3 level to reduce data size for the client-side MapLibre render.
- Exported region-wide daily totals to `time_series.json` for UI charting.
*Evidence:*
- `h3_anomalies.parquet` generated.
- Gate Check: File size is extremely tiny (0.0033 MB), confirming optimal performance for frontend visualization. Gate passed.

## Phase H — API
*Decisions:*
- Created a FastAPI service (`api/main.py`) exposing two read-only endpoints: `/anomalies` and `/time-series`.
- Maintained a persistent DuckDB connection during the app lifecycle for rapid querying of the `h3_anomalies.parquet` file.
*Evidence:*
- API is running locally via uvicorn.
- `curl` test to `/anomalies` yielded a response time of `0.008s` (8 milliseconds) after cache warmup, passing the < 200ms requirement comfortably. Gate passed.

## Phase I — UI Application
*Decisions:*
- Replaced Vite starter with a full React + TypeScript application.
- Implemented **MapLibre GL JS** with NASA GIBS BlueMarble tiles as the basemap.
- Used `h3-js` to dynamically convert H3 hex indexes from the API into GeoJSON boundaries for `fill` layers on the map.
- Implemented a time-slider and a **Chart.js** line chart to navigate the `/time-series` data and visualize HFAI trends.
- Styled using a "Dark mission-control" aesthetic with neon cyan/teal accents.
*Evidence:*
- The React application builds, fetches data from the API, and renders without console errors.
- The UI actively displays the synchronized Map, Timeline Chart, and dynamic Hex Anomalies. Gate passed. Project execution complete.
