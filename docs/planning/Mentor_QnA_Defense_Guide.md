# Technical Review & Methodology Response: BengalFlare

| Metadata | Details |
| :--- | :--- |
| **Project** | **BengalFlare** — Connecting Satellite Data. Revealing Earth's Story. |
| **Challenge** | NASA Space Apps Challenge (MODIS–VIIRS Hotspot Harmonization) |
| **Team** | Team Zen’in Clan · Gopalganj Science & Technology University (GSTU), Bangladesh |
| **Live Web App** | [bengalflare.vercel.app](https://bengalflare.vercel.app) |
| **Source Repository** | [github.com/mushfiq693-dotcom/NASA](https://github.com/mushfiq693-dotcom/NASA) |
| **Document Purpose** | Evidence-Based Technical Response to Mentor Technical Inquiries |

---

## ⚡ Executive Quick-Reference Matrix (Mentor TL;DR)

| # | Mentor Inquiry | Core Technical Answer & Evidence | Status |
| :-: | :--- | :--- | :---: |
| **Q1** | **Harmonization Methodology** | Reprojects FIRMS points into uniform 1 km × 1 km equal-area cells (EPSG:6933), converts to local Bangladesh solar time (+6h), applies a 0.2 VIIRS sensitivity weight, and smooths across a 7-day rolling window (`hfai_smoothed`). | **Operational** |
| **Q2** | **Accuracy Validation** | Pixel-level 1 km coincident correlation is empirically near-zero (Pearson r = 0.035) due to orbital geometry and 45-min diurnal gap. Integration tests pass; independent NASA MCD64A1 Burned Area validation via GEE is active in our roadmap. | **In Progress** |
| **Q3** | **Seasonal Anomaly Detection** | Discovered that 86.1% of cells have fires only once in 24 years, causing baseline sparsity. We are migrating from demo thresholds to a zero-filled 15-day moving window IQR z-score at the Upazila level. | **In Progress** |
| **Q4** | **Bangladesh Case Study** | Documented the April 11, 2023 Chittagong Hill Tracts surge (1,518 hotspots; 10× seasonal baseline) during a 40°C heatwave. Directly informs Forest Department patrol deployment and DoE PM2.5 advisories. | **Validated** |
| **Q5** | **Data Pipeline & Demo** | 6-stage automated pipeline processing 191,355 historical records from raw NASA FIRMS CSVs to Uber H3 hexagons. Demonstrated via Calendar 2011/2013 sensor handover and Atlas temporal scrubber. | **Operational** |

---

## Question 1: How are we harmonizing MODIS and VIIRS datasets despite their different spatial resolutions and detection capabilities?

### Direct Takeaway
> We harmonize datasets by decoupling physical detector footprints from reporting units. We reproject all detections into uniform 1 km × 1 km equal-area cells (EPSG:6933), shift timestamps to local solar day (+6 hours), down-weight high-sensitivity VIIRS counts by a factor of 0.2, and apply a 7-day rolling window to account for satellite revisit gaps.

### 1.1 Physical Sensor Differences & The Harmonization Challenge

Reconciling active-fire observations between MODIS (Terra and Aqua) and VIIRS (Suomi-NPP) requires addressing three primary physical and orbital differences:

1. **Spatial Footprint and Geometric Distortion (The Bowtie Effect):**  
   * *MODIS (1,000 m nadir):* At nadir (directly below the satellite path), MODIS pixels cover 1 km × 1 km. As the scan angle increases toward the edge of its 2,330 km swath, optical projection geometry elongates the pixel footprint up to 4.8 km × 2.0 km (approximately a 10× area expansion). This causes successive scan swaths to overlap, creating duplicate detections of the same physical fire.  
   * *VIIRS (375 m nadir):* VIIRS employs on-board 3:1 and 2:1 pixel aggregation across its wider 3,060 km swath, constraining edge-of-swath pixel growth to approximately 800 m × 800 m.

2. **Minimum Fire Detection Thresholds:**  
   VIIRS 375 m I-band detectors possess a detection sensitivity down to approximately 1 to 3 Megawatts (MW) of Fire Radiative Power (FRP), capturing small agricultural field burns, crop residue clearing, and low-intensity smoldering. In contrast, MODIS has a higher detection threshold of approximately 8 to 10 MW, frequently missing smaller, lower-intensity fires.

3. **Diurnal Overpass Timing:**  
   Terra overpasses at approximately 10:30 AM, Aqua at 1:30 PM, and Suomi-NPP at 2:15 PM local solar time. In tropical agricultural burning regimes, fires are ignited and extinguished rapidly within 30 to 60 minutes. Aqua and Suomi-NPP are separated by a 45-minute observation gap, meaning they rarely observe the exact same instantaneous fire state.

---

### 1.2 Current Implementation in BengalFlare

In our current deployment, active-fire observations are harmonized through a four-stage deterministic physical pipeline (`src/ingest.py`, `src/grid.py`, `src/hfai.py`):

1. **Equal-Area Spatial Reprojection (`src/grid.py`):**  
   All raw FIRMS latitude/longitude points are reprojected from WGS84 into the **World Cylindrical Equal Area projection (EPSG:6933)**. Coordinates in meters are floored by 1,000 to assign uniform 1 km × 1 km equal-area spatial grid cells (`grid_id`).

2. **Local Temporal Binning (`src/grid.py`):**  
   Observation timestamps in UTC are shifted by +6 hours to reflect local Bangladesh solar time (Asia/Dhaka) and aggregated into calendar cell-days.

3. **Deterministic Sensitivity Weighting (`src/hfai.py`):**  
   To compensate for VIIRS's higher detection sensitivity (which records approximately 4 to 5 times more small fire hotspots than MODIS across South Asia), we compute a base **Harmonized Fire Activity Index (HFAI)** for each grid cell on each day:

   ```
   HFAI_base = Hotspot_Count × Sensor_Weight × Mean_FRP
   ```

   **Parameter Definitions:**
   * **Hotspot_Count:** Total number of fire detections recorded in that 1 km grid cell on that day.
   * **Sensor_Weight:** Calibration factor compensating for detection sensitivity differences:
     * `Weight_MODIS = 1.0` (standard 1 km baseline)
     * `Weight_VIIRS = 0.2` (down-weights the 5× higher detection frequency of VIIRS 375 m pixels)
   * **Mean_FRP:** Mean Fire Radiative Power across detections in the cell, measured in Megawatts (MW).

4. **Temporal Revisit Smoothing (`src/hfai.py`):**  
   To prevent orbital revisit gaps and satellite track spacing from creating artificial single-day spikes, a 7-day rolling window average is computed per grid cell (`hfai_smoothed`).

---

### 1.3 Technical Limitations & Next Engineering Steps

* **Heuristic vs. Machine Learning:** Our current live pipeline uses deterministic physical sensitivity weighting (Sensor Weight = 0.2 for VIIRS, 1.0 for MODIS) rather than a trained empirical Two-Stage Quantile Regression Forest.
* **Coincident Cell-Day Summation:** When MODIS and VIIRS observe the same 1 km cell on the exact same date, the current aggregation in `src/hfai.py` sums their HFAI values. This double-counts thermal energy instead of computing a weighted sensor consensus.
* **Bowtie and View Geometry:** Grid binning at 1 km normalizes spatial reporting units, but does not mathematically invert off-nadir pixel smearing without accounting for the scan angle and track angle metadata of each individual satellite granule.

---

## Question 2: How have we validated the accuracy of the harmonized results?

### Direct Takeaway
> Integration tests verify software correctness (non-negative outputs, schema consistency), but scientific accuracy has not yet been validated against independent ground truth. On 7,694 coincident 1 km cell-days, raw counts correlate at only r = 0.035 due to pixel smearing and a 45-minute diurnal gap. Our active validation roadmap integrates NASA's 500 m MCD64A1 Burned Area product via Google Earth Engine.

### 2.1 Scientific Validation Status

**The harmonization method has not yet been independently validated for scientific accuracy against external ground truth or high-resolution airborne imagery.**

Our test suite in `tests/test_science.py` and `tests/test_api.py` conducts software engineering integration testing—verifying that Parquet files are generated, schemas match, and values are non-negative. These are software verification tests, not scientific validation against independent reference datasets.

The high-accuracy metrics previously documented in early project materials (Pearson r = 0.942, Root Mean Square Error RMSE = 3.82 MW, Absolute Percent Bias |PBIAS| = 1.84%, Willmott Index of Agreement d = 0.968) were conceptual benchmark targets derived from academic literature, rather than empirically measured outcomes from our current codebase.

---

### 2.2 Empirical Findings on Real Overlapping Telemetry

When we evaluated actual coincident satellite overpasses across the **7,694 overlapping 1 km cell-days** in our database where both MODIS and VIIRS detected fires on the exact same date:

* **Pearson Correlation of Raw Counts (r):** **0.035** (demonstrates near-zero linear correlation at pixel scale)
* **Willmott Index of Agreement (d):** **0.066** (reflects severe point-level divergence)
* **Percent Bias (PBIAS):** **+83.5%** (VIIRS registers systematically more detections per cell due to high sensitivity)
* **Correlation of Fire Radiative Power (FRP Sum r):** **0.260** (weak positive correlation)

#### Why Pixel-Level Agreement at 1 km is Physically Near-Zero:
1. **Diurnal Time Delta:** Aqua overpasses at 1:30 PM; Suomi-NPP overpasses at 2:15 PM (a 45-minute separation). In Bangladesh, agricultural stubble burns often ignite and burn down in under 45 minutes.
2. **Pixel Smearing:** MODIS off-nadir pixels expand up to 4.8 km × 2.0 km (nearly 10 km²). A fire located near the edge of a 1 km grid cell is frequently binned into an adjacent cell by MODIS while being pinpointed with high spatial precision by VIIRS.
3. **Conclusion:** Direct cell-level point comparison at 1 km is physically inconsistent. Harmonization must be evaluated through regional aggregation (e.g., Upazila or Division level) and multi-day temporal windows.

---

### 2.3 Independent Validation Roadmap

To establish genuine scientific validation, our team is executing the following plan:

1. **Independent Reference Dataset:** Ingest the NASA MCD64A1 Collection 6 500 m Monthly Burned Area product via Google Earth Engine (GEE).
2. **Evaluation Protocol:** Aggregate monthly HFAI across Bangladesh's 8 administrative divisions from 2001 to 2022 and correlate against total monthly burned area (measured in square kilometers, km²).
3. **Discontinuity Verification:** Conduct an interrupted time-series regression and Chow structural break test across the 2012 sensor transition to quantitatively prove that HFAI eliminates the artificial 2012 step discontinuity compared to raw hotspot counts.

---

## Question 3: How does our anomaly detection distinguish unusual fire activity from normal seasonal patterns?

### Direct Takeaway
> True seasonal anomalies require evaluating deviations against the historical distribution for that exact calendar period and location. In our offline pipeline, calculating percentiles only over active days caused 86% of cells to have Mean = P90. For live demonstrations, the API uses fixed national volume thresholds. Our production upgrade introduces zero-filled 15-day moving window IQR z-scores.

### 3.1 Analysis of the Current Implementation

Seasonal anomaly detection requires evaluating whether fire activity on a given date deviates significantly from the **historical distribution for that specific calendar period and location**.

Currently, two distinct approaches exist across our pipeline:

#### 1. The Offline Baseline Pipeline (`src/climatology.py` and `src/anomaly.py`)
* Computes `baseline_mean` and `baseline_p90` (90th percentile) by grouping `hfai_smoothed` by `grid_id` and `day_of_year`.
* *Methodological Limitation (Zero-Filling Omission):* The baseline is calculated **only over days with active fire detections**. In Bangladesh, fire occurrence is sparse: for 86.1% of all active cells, a fire was recorded on that specific calendar day **only once in 24 years**. For these cells:
  ```
  Baseline_Mean = Baseline_90th_Percentile = Observed_Value
  ```
  This zero-inflation omission mathematically prevents the anomaly condition `HFAI > baseline_p90` from evaluating to `True`.

#### 2. The Serving Layer API (`api/main.py`)
* To ensure responsive performance during live demonstrations, the API `/calendar` endpoint assigns anomaly severity using fixed national activity thresholds:
  * **HFAI > 400:** Categorized as **Extreme Anomaly** (national 98.5th percentile)
  * **HFAI > 200:** Categorized as **High Anomaly** (national 88.0th percentile)
  * **HFAI > 80:** Categorized as **Elevated Anomaly** (national 65.0th percentile)
  * **HFAI ≤ 80:** Categorized as **Normal**
* *Limitation:* These fixed thresholds reflect absolute thermal intensity rather than true seasonal adjustment. High activity during peak dry season (March) is labeled "High" even though it is climatically typical, while moderate burning during the wet monsoon (July) would be labeled "Normal" even though it represents an unusual ecological anomaly.

---

### 3.2 Production Refinement Plan

To transition from fixed volume thresholds to true seasonal normalization:

1. **15-Day Moving Window:** Expand the single day-of-year baseline to a ±7 day moving window pooled across baseline years (2001–2020).
2. **Zero-Filling:** Construct a complete spatial-temporal grid panel where non-fire days are explicitly populated with zeros, ensuring true fire absence informs the seasonal median and percentiles.
3. **Standardized Seasonal Anomaly Score (Z-Score):**

   ```
   Z(cell, date) = [ HFAI(cell, date) - Seasonal_Median(cell, date) ] / Seasonal_IQR(cell, date)
   ```

   **Parameter Definitions:**
   * **HFAI(cell, date):** The observed smoothed Harmonized Fire Activity Index for that grid cell on that date.
   * **Seasonal_Median(cell, date):** The median HFAI value across all years in the baseline period (2001–2020) within a ±7 day calendar window for that location.
   * **Seasonal_IQR(cell, date):** The Interquartile Range (75th percentile minus 25th percentile). Using the IQR rather than standard deviation provides robust normalization that resists distortion from zero-inflation and extreme episodic outliers.

---

## Question 4: Can we demonstrate a real-world case study, preferably from Bangladesh, showing how the application could support an informed decision?

### Direct Takeaway
> Over 80% of Bangladesh's fires occur in the Chittagong Hill Tracts (CHT) during March–April Jhum clearing. On April 11, 2023, during an extreme 40°C heatwave, 1,518 hotspots were detected—10× the 10-year April daily baseline (~140). BengalFlare enables the Forest Department to dispatch patrols to vulnerable reserve boundaries and allows the DoE to issue timely PM2.5 smoke advisories for Chattogram and Cox's Bazar.

### 4.1 Geographic Profile of Fire Activity in Bangladesh

Our analysis of 191,355 verified observations in `data/interim/raw_observation.parquet` demonstrates that fire activity in Bangladesh follows distinct geographic regimes:

* **Chittagong Hill Tracts (CHT - Bandarban, Rangamati, Khagrachhari):**  
  Accounts for **80.2% of all active-fire detections** in Bangladesh (153,382 detections). Over 96% of CHT fires occur in **March and April** during annual pre-monsoon *Jhum* (slash-and-burn) agricultural clearing.
* **Northwest Agricultural Plains (Rajshahi, Rangpur):**  
  Accounts for **3.5% of detections** (6,742 detections), peaking in **December–January** (Aman rice residue burning) and **April** (Boro field preparation).
* **Sundarbans Mangrove Reserve Forest:**  
  Fires are extraordinarily rare: **only 15 satellite detections exist across the entire 24-year archive**.

---

### 4.2 Real-World Case Study: The April 2023 CHT Extreme Fire Surge

* **Location:** Chittagong Hill Tracts (Latitude 21.4°N to 23.8°N, Longitude 91.8°E to 92.7°E).
* **Date Range:** **April 10 – April 13, 2023** (Historical Peak: **April 11, 2023**).
* **Observed Data:** **1,518 verified hotspots on April 11 alone** (194 MODIS, 1,324 VIIRS)—the highest single-day active-fire count recorded in Bangladesh's history.
* **Ecological Context:** The 10-year April daily baseline for Bangladesh is approximately 140 detections. On April 11, fire activity surged to **10× normal seasonal levels**. A prolonged 40°C pre-monsoon heatwave and delayed seasonal rainfall caused controlled agricultural clearing fires to escape control, igniting adjacent reserve forest edges in Bandarban and Rangamati.

---

### 4.3 Operational Decision Support & Stakeholder Applications

1. **Forest Department (Chattogram Hill Tracts Circle):**  
   * *Decision Supported:* Targeted deployment of ranger patrols and community fire wardens to vulnerable protected forest boundaries (such as the Kassalong and Rema-Kalenga corridors) when daily CHT fire activity exceeds 500% of the seasonal Jhum baseline.
2. **Department of Environment (Air Quality Management Division):**  
   * *Decision Supported:* Issuance of regional fine particulate matter (PM2.5) health advisories in downstream population centers (Chattogram City and Cox's Bazar) impacted by smoke transport blowing westward from the burning hill tracts.

---

### 4.4 Critical Ground-Truth Limitations

Satellite active-fire detections provide thermal anomaly pixel centers at the time of overpass. They cannot independently determine:
1. Whether a fire is an authorized, controlled burn on community farmland or an uncontrolled wildfire within a protected government forest reserve.
2. Sub-canopy smoldering fires that do not emit sufficient upward radiance through dense vegetative canopies.

*Ground-level ranger verification and high-resolution optical confirmation (e.g., 10 m Sentinel-2) remain mandatory before deploying suppression assets.*

---

## Question 5: Can we provide a short walkthrough of the data pipeline, harmonization methodology, and one example from the application?

### Direct Takeaway
> The pipeline ingests 24 years of NASA FIRMS CSVs, filters by QA flags, reprojects to 1 km equal-area cells, applies the 0.2 VIIRS weighting factor, indexes to Uber H3 hexagons, and serves an interactive React 19 UI. Users can visually confirm continuous activity scales across the 2011 (MODIS) to 2013 (VIIRS) transition on the Calendar tab.

### 5.1 End-to-End Data Pipeline Architecture

```
1. NASA FIRMS Downlink (Raw CSVs)
   │  • MODIS Collection 6.1 (Terra / Aqua)
   │  • VIIRS Collection 2 (Suomi-NPP)
   ▼
2. Ingestion & QA Filtering (src/ingest.py)
   │  • Drop MODIS Confidence < 30; drop VIIRS Confidence == 'low'
   │  • Filter Type == 0 (presumed vegetation fire)
   │  • Parse UTC acquisition timestamps (191,355 rows clean Parquet output)
   ▼
3. Spatial Gridding & Local Date (src/grid.py)
   │  • Reproject EPSG:4326 ──> EPSG:6933 (1 km Equal-Area Grid)
   │  • Compute 1 km grid coordinates: grid_x = floor(x/1000), grid_y = floor(y/1000)
   │  • Convert UTC to Local Bangladesh Solar Time (+6 hours)
   ▼
4. Harmonization & Rolling Average (src/hfai.py)
   │  • Apply sensitivity weights: MODIS = 1.0, VIIRS = 0.2
   │  • Calculate HFAI_base = Count × Weight × FRP_mean
   │  • Apply 7-day rolling window temporal smoothing (hfai_smoothed)
   ▼
5. Spatial Indexing & Serving Export (src/export_h3.py & scripts)
   │  • Aggregate to Uber H3 Resolution 7 hexagons (approximately 5.16 km² area)
   │  • Export static GeoJSON point samples and daily national time-series
   ▼
6. Presentation Layer (React 19 + MapLibre GL)
   │  • Atlas Explorer 60 FPS temporal scrubber
   │  • 24-Year multi-decadal activity calendar matrix
   │  • Forensic Day Detail breakdown view
```

---

### 5.2 Concrete Demonstration in the Application

To inspect the pipeline's behavior in the live application at [bengalflare.vercel.app](https://bengalflare.vercel.app):

1. **Step 1 — Verify the 2012 Sensor Transition:**  
   Navigate to the **Calendar** tab (`/calendar`). Select **2011** from the year dropdown (MODIS-only era). Daily counts range between 5 and 40 hotspots, with annual HFAI around 121,800. Switch to **2013** (VIIRS era). Raw detections jump by approximately 400%, but our Harmonized Activity scale remains continuous (~178,700) due to the 0.2 VIIRS sensitivity weighting factor.

2. **Step 2 — Inspect Spatial Clustering:**  
   Navigate to the **Atlas Explorer** (`/atlas`). Scrub the timeline to **March 21, 2022**. Observe the dense spatial clustering in the Chittagong Hill Tracts. Toggle the layer to **Sensor Disagreement** to visualize the spatial distribution of MODIS detections versus high-sensitivity VIIRS detections.

3. **Step 3 — Forensic Overpass Analysis:**  
   Navigate to `/day/2022-03-21` (or click on March 21 in the Calendar). Review the **Satellite Pass Breakdown**, which decomposes daily detections into Terra (10:30 AM), Aqua (1:30 PM), and Suomi-NPP (2:15 PM) overpasses.

---

## Summary of Technical Maturity

| Capability | Current Status | Scientific Integrity Note |
| :--- | :---: | :--- |
| **NASA FIRMS 26-Year Ingestion** | **VERIFIED** | 191,355 real observations (Terra, Aqua, Suomi-NPP) correctly filtered and processed. |
| **EPSG:6933 1 km Equal-Area Gridding** | **VERIFIED** | True equal-area projection and local Bangladesh solar date conversion (+6 hours). |
| **Deterministic Sensitivity Scaling (HFAI)** | **OPERATIONAL** | Functional 0.2 VIIRS scaling factor; replaces fictitious machine learning claims. |
| **Independent Burned Area Validation** | **IN PROGRESS** | Real 1 km overlap baseline (r = 0.035) established; GEE MCD64A1 validation roadmap active. |
| **Seasonally Adjusted Anomaly Engine** | **IN PROGRESS** | Moving from fixed API cutoffs to zero-filled 15-day moving window Upazila z-scores. |
| **Observability & Cloud Mask** | **PLANNED** | Transitioning from synthetic date modulo math to real NASA MOD08/VNP35 cloud fraction data. |
