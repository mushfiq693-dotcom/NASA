# BengalFlare — Flaws, Master Prompt Gap Analysis & Production Roadmap
### বেঙ্গলফ্লেয়ার — বর্তমান ত্রুটিসমূহ, মাস্টার প্রম্পটের অমিল ও প্রডাকশন রোডম্যাপ

**Project:** BengalFlare · NASA Space Apps Challenge (MODIS–VIIRS Harmonization)  
**Team:** Zen’in Clan · Gopalganj Science & Technology University (GSTU), Bangladesh 🇧🇩  
**Document Goal:** Identify all existing flaws, analyze missing items from the original Master Blueprint, and provide an actionable upgrade guide to make BengalFlare a true production-grade, award-winning NASA project **without adding any new features**.  
**Auditor:** Senior Geospatial Data Scientist & Systems Architect  

---

## Table of Contents / সূচিপত্র

1. [Section 1: Master Prompt vs. Codebase Gap Analysis / মূল পরিকল্পনার সাথে বর্তমান কোডের অমিল](#section-1-master-prompt-vs-codebase-gap-analysis--মূল-পরিকল্পনার-সাথে-বর্তমান-কোডের-অমিল)
2. [Section 2: Comprehensive Flaw Inventory (10 Existing Components) / বর্তমান ১০টি ফিচারের খুঁটিনাটি ত্রুটি](#section-2-comprehensive-flaw-inventory-10-existing-components--বর্তমান-১০টি-ফিচারের-খুঁটিনাটি-ত্রুটি)
   - [Flaw 1: Data Ingestion & Missing Constellation Archives](#flaw-1-data-ingestion--missing-constellation-archives)
   - [Flaw 2: 1 km Spatial Gridding & Zero-Fire Absence](#flaw-2-1-km-spatial-gridding--zero-fire-absence)
   - [Flaw 3: Coincident Overpass Double-Counting Flaw](#flaw-3-coincident-overpass-double-counting-flaw)
   - [Flaw 4: Fake Machine Learning & The Scalar Heuristic](#flaw-4-fake-machine-learning--the-scalar-heuristic)
   - [Flaw 5: The "Sensor Disagreement" Logic Flaw](#flaw-5-the-sensor-disagreement-logic-flaw)
   - [Flaw 6: The Climatology Baseline Sparsity Bug](#flaw-6-the-climatology-baseline-sparsity-bug)
   - [Flaw 7: Fixed Thresholds in the Live API](#flaw-7-fixed-thresholds-in-the-live-api)
   - [Flaw 8: Synthetic Observability Index (No Cloud Mask)](#flaw-8-synthetic-observability-index-no-cloud-mask)
   - [Flaw 9: Hardcoded Validation Metrics](#flaw-9-hardcoded-validation-metrics)
   - [Flaw 10: Production Deployment Disconnect (Localhost Fallback)](#flaw-10-production-deployment-disconnect-localhost-fallback)
3. [Section 3: Production Upgrade Blueprint (How to Fix Existing Features) / বিদ্যমান ফিচারগুলো নিখুঁত করার উপায়](#section-3-production-upgrade-blueprint-how-to-fix-existing-features--বিদ্যমান-ফিচারগুলো-নিখুঁত-করার-উপায়)
4. [Section 4: The NASA Space Apps Winning Formula / নাসা জাজদের সন্তুষ্ট করে বিজয়ী হওয়ার কৌশল](#section-4-the-nasa-space-apps-winning-formula--নাসা-জাজদের-সন্তুষ্ট-করে-বিজয়ী-হওয়ার-কৌশল)
5. [Section 5: Step-by-Step Execution Plan / ধাপে ধাপে বাস্তবায়নের অগ্রাধিকার তালিকা](#section-5-step-by-step-execution-plan--ধাপে-ধাপে-বাস্তবায়নের-অগ্রাধিকার-তালিকা)

---

## Section 1: Master Prompt vs. Codebase Gap Analysis / মূল পরিকল্পনার সাথে বর্তমান কোডের অমিল

When comparing the original blueprint in `master_prompt_firechronicle_v3.md` and `MODIS_VIIRS_Harmonization_Research_Report_v2.md` against what was actually coded in the repository, several critical promises were left unfulfilled:

| Master Blueprint Rule / Feature | Original Plan Requirement (কী করার কথা ছিল) | Current Reality in Code (বাস্তবে যা আছে) | Gap Severity (গুরুত্ব) |
| :--- | :--- | :--- | :---: |
| **Principle P1 (Missing $\ne$ 0)** | Every grid-cell-day carries an explicit observation status (`OBSERVED_DETECTION`, `OBSERVED_NO_DETECTION`, `KNOWN_OUTAGE`, `MISSING_PRODUCT`). | Only 1 hardcoded dummy outage row (`2024-11-09`) was added in `grid.py`. `missing_dates.csv` is completely empty. | **HIGH** |
| **Principle P4 (Platform-Aware)** | Treat Terra, Aqua, Suomi-NPP, NOAA-20, NOAA-21 separately. | NOAA-20 and NOAA-21 historical archives were never downloaded. Historical data only has Terra, Aqua, and S-NPP. | **HIGH** |
| **Principle P8 (No Hardcoded Corrections)** | *"Do not hard-code 'scale VIIRS by 65%'... Learn adjustments from overlap data per context."* | `src/hfai.py` literally hardcoded `sensor_weight = 1.0 if MODIS else 0.2`. It completely violated Principle P8. | **CRITICAL** |
| **Models B0 to B5 Benchmarking** | Implement 6 models (Raw, Global Ratio, Context Ratio, Log-Linear, Quantile Mapping, Two-Stage QRF). | Zero models were implemented in Python. B0 to B5 exist only as static JavaScript dictionary objects in `Lab.tsx`. | **CRITICAL** |
| **Validation KPIs (Section 7.3)** | Target KPIs ($r \ge 0.92, \text{RMSE} \le 4.1$) were goals to test against, not numbers to claim. | Coder copied the target goals directly into `src/validation.py` as hardcoded output constants without training anything. | **CRITICAL** |
| **Climatology Baseline (Section 8)** | Climatology window of $\pm 5$ days (11-day window) including zero-fire days and robust z-scores. | Single-day grouping on active days only. 86.1% of cells have only 1 fire, causing 90th percentile to collapse. | **HIGH** |
| **Observability Index** | Physical obscuration proxy using cloud mask granules or satellite swath coverage. | Synthetic date math formula: `0.88 + (day % 7) * 0.01`. No real satellite cloud data is used. | **HIGH** |
| **DuckDB Analytics (Section 4)** | Persistent DuckDB backend connection for fast spatial/Parquet querying. | `duckdb` is never imported in `api/main.py`. Pandas reads Parquet directly from disk. | **MEDIUM** |
| **Production Architecture** | Full-stack deployment with live API serving. | Vercel hosts only static frontend; backend API is offline, forcing UI to run on fallback static JSON files. | **HIGH** |

> 🇧🇩 **বাংলা সারসংক্ষেপ:** আমাদের মাস্টার প্রম্পটে খুব চমৎকার একটি বৈজ্ঞানিক পরিকল্পনা ছিল। কিন্তু হ্যাকাতনের সময়ের অভাবে কোডে অনেক শর্টকাট নেওয়া হয়েছে। সবচেয়ে বড় অমিল হলো—আমরা বলেছিলাম কোনো সংখ্যা হার্ডকোড করব না এবং মেশিন লার্নিং ব্যবহার করব; কিন্তু বাস্তবে কোডে হার্ডকোড করা স্কেলিং ফর্মুলা (MODIS = ১.০, VIIRS = ০.২) বসানো হয়েছে এবং ভ্যালিডেশনের ৯৪% এক্যুরেসির মানটি হাত দিয়ে লিখে দেওয়া হয়েছে।

---

## Section 2: Comprehensive Flaw Inventory (10 Existing Components) / বর্তমান ১০টি ফিচারের খুঁটিনাটি ত্রুটি

Here is the exact technical breakdown of what is broken, mocked, or flawed in our **existing 10 components**:

---

### Flaw 1: Data Ingestion & Missing Constellation Archives
* **What's broken:** We claim a 5-satellite constellation (Terra, Aqua, S-NPP, NOAA-20, NOAA-21). In reality, our ingestion pipeline (`src/ingest.py`) only loaded files from `DL_FIRE_M-C61_820366` (Terra/Aqua) and `DL_FIRE_SV-C2_820367` (Suomi-NPP). NOAA-20 and NOAA-21 were never downloaded from NASA FIRMS.
* **Geographic Boundary Flaw:** Data is filtered using a simple bounding box (`Lat 20.73–26.63, Lon 88.01–92.67`). It was never clipped against the official Bangladesh national border polygon (`BGD_boundary.geojson`), meaning fires in adjacent border areas of India (West Bengal, Tripura, Meghalaya, Assam) and Myanmar (Rakhine/Chin) are falsely included as Bangladesh fires.
> 🇧🇩 **বাংলা ব্যাখ্যা:** আমরা বলেছি ৫টি স্যাটেলাইটের ডেটা নিয়েছি, কিন্তু আসলে NOAA-20 ও NOAA-21 নামানোই হয়নি। এছাড়া বাংলাদেশের বর্ডার দিয়ে ডেটা কাটা হয়নি, চারকোণা বক্স দিয়ে কাটা হয়েছে; ফলে ভারত ও মিয়ানমারের বর্ডারের আগুনও বাংলাদেশের ভেতর ঢুকে গেছে।

---

### Flaw 2: 1 km Spatial Gridding & Zero-Fire Absence
* **What's broken:** In `src/grid.py`, points are projected to EPSG:6933 (1 km equal-area) and grouped into cell-days. However, the pipeline **only stores cells where fires were detected**.
* **The Scientific Flaw:** In Earth observation, proving "where there was NO fire" is just as important as proving "where there WAS fire". Because zero-detection cells were never created, the dataset cannot distinguish between an unburned farm and an area that the satellite could not see due to clouds.
> 🇧🇩 **বাংলা ব্যাখ্যা:** আমাদের কোড শুধু যেসব ১ কিমি জায়গায় আগুন লেগেছে তাদের সেভ করেছে। কিন্তু যে জায়গায় আগুন লাগেনি বা বৃষ্টি/মেঘের কারণে স্যাটেলাইট দেখতে পারেনি, সেগুলোর কোনো হিসেব ডেটাবেজে নেই। ফলে ব্যাকগ্রাউন্ড অনুপস্থিতির কোনো তথ্য নেই।

---

### Flaw 3: Coincident Overpass Double-Counting Flaw
* **What's broken:** In `src/hfai.py` (lines 34–37):
  ```python
  grid_day = calc_df.groupby(['grid_id', 'local_date']).agg(
      total_raw_count=('calc_count', 'sum'),
      hfai_base=('hfai_base', 'sum')
  ).reset_index()
  ```
* **The Scientific Flaw:** On days when both Aqua (1:30 PM) and Suomi-NPP (2:15 PM) pass over the same fire in the same 1 km cell, the code **adds their HFAI values together**. Instead of cross-calibrating them, it reports double the true fire activity.
> 🇧🇩 **বাংলা ব্যাখ্যা:** একই ১ কিমি সেলে একই দিনে যদি অ্যাকোয়া এবং সুওমি-এনপিপি দুটোই একই আগুন দেখতে পায়, কোড তাদের শক্তিকে যোগ করে দ্বিগুণ বানিয়ে ফেলে! এটি ফিউশন নয়, বরং ডাবল-কাউন্টিং।

---

### Flaw 4: Fake Machine Learning & The Scalar Heuristic
* **What's broken:** Our README, video pitch, and UI (`/lab`) prominently claim a "Champion Two-Stage Quantile Regression Forest (B5)" that eliminates 72% of the sensor jump and outputs Bayesian credible intervals.
* **The Reality:** Not a single line of machine learning code exists in `src/`. The actual calculation is:
  $$\text{HFAI} = \text{Count} \times \text{Weight} \times \overline{\text{FRP}}$$
  with static weights ($1.0$ for MODIS, $0.2$ for VIIRS). The scatter plot in `/lab` is generated from 20 hardcoded dummy points morphed by an algebraic formula in JavaScript.
> 🇧🇩 **বাংলা ব্যাখ্যা:** আমরা ভিডিও এবং সাইটে দাবি করেছি আমাদের মেশিন লার্নিং মডেল আছে। কিন্তু আসল কোডে কোনো মডেল নেই; শুধুমাত্র ০.২ এবং ১.০ দিয়ে গুণ করার একটি সাধারণ সূত্র আছে। ল্যাবের গ্রাফটিও ২০টি ফেক পয়েন্ট দিয়ে ব্রাউজারে বানানো।

---

### Flaw 5: The "Sensor Disagreement" Logic Flaw
* **What's broken:** In `scripts/make_points_fixture.py` (line 33), the code decides which points are labeled "Both Sensors Detected" on the map using this rule:
  ```python
  cat = 'both' if f > 60 else ('modis-only' if s == 'MODIS' else 'viirs-only')
  ```
* **The Reality:** If Fire Radiative Power (FRP) is greater than 60 MW, it labels it as `both` (consensus detection)! If FRP $\le 60$, it labels it as single-sensor! It **never checks** whether both sensors actually observed that spot. A single MODIS detection with 65 MW is falsely labeled as "Both Sensors Detected (Consensus)".
> 🇧🇩 **বাংলা ব্যাখ্যা:** ম্যাপে কোন আগুন দুটো স্যাটেলাইটই দেখেছে তা বোঝানোর জন্য কোডে কোনো আসল ক্রস-ম্যাচিং করা হয়নি। কোডে লিখে দেওয়া হয়েছে—আগুনের তাপশক্তি ৬০-এর বেশি হলেই তাকে "Both" বলে দাও! এটি মারাত্মক একটি ভুল লজিক।

---

### Flaw 6: The Climatology Baseline Sparsity Bug
* **What's broken:** In `src/climatology.py`, baseline statistics are calculated by grouping active detections by `grid_id` and `day_of_year`:
  ```python
  climatology = df.groupby(['grid_id', 'day_of_year']).agg(
      baseline_mean=('hfai_smoothed', 'mean'),
      baseline_p90=('hfai_smoothed', q90)
  ).reset_index()
  ```
* **The Reality:** Because non-fire days were not included, for **106,672 out of 123,901 cell-day pairs (86.1%)**, the cell only burned on that exact calendar day **once in 24 years**. For all these cells, $\text{Mean} = \text{90th Percentile} = \text{current value}$. When `src/anomaly.py` checks `HFAI > baseline_p90`, it evaluates to `False`. 86% of cells can **never be flagged as an anomaly**.
> 🇧🇩 **বাংলা ব্যাখ্যা:** হিস্টোরিক্যাল গড় করার সময় আগুনহীন বছরগুলোকে (০ মান) হিসেবে নেওয়া হয়নি। ফলে ৮৬% জায়গায় ২৪ বছরে মাত্র ১ বার আগুন লাগায় ওই ১ দিনের মানটাই গড় ও ৯০তম পার্সেন্টাইল হয়ে গেছে। ফলে কোড কখনোই সেগুলোতে অ্যানোমালি ধরতে পারে না।

---

### Flaw 7: Fixed Thresholds in the Live API
* **What's broken:** The live API `/calendar` endpoint completely ignores the baseline Parquet files. In `api/main.py` (lines 117–128):
  * `HFAI > 400` $\implies$ Extreme (Percentile: 98.5%)
  * `HFAI > 200` $\implies$ High (Percentile: 88.0%)
  * `HFAI > 80` $\implies$ Elevated (Percentile: 65.0%)
  * Otherwise $\implies$ Normal (Percentile: 35.0%)
* **The Reality:** These are static, national arbitrary cutoffs. They do not account for seasons. An HFAI of 250 in March (normal burning season) is called "High", and an HFAI of 70 in July (monsoon season, where zero fires is normal) is called "Normal". It is not seasonality-aware.
> 🇧🇩 **বাংলা ব্যাখ্যা:** আমাদের লাইভ ব্যাকএন্ড হিস্টোরিক্যাল ডেটা ব্যবহারই করছে না। সে সরাসরি ফিক্সড নাম্বার দিয়ে চেক করছে (যেমন ৪০০-এর বেশি হলে এক্সট্রিম)। এটা ঋতুভিত্তিক কোনো অ্যালগরিদম নয়।

---

### Flaw 8: Synthetic Observability Index (No Cloud Mask)
* **What's broken:** In `api/main.py` (lines 228–237) and `DayDetail.tsx` (lines 88–94), observability is computed via date modulo math:
  ```python
  if month in [11, 12, 1, 2]:
      base_obs = 0.88 + ((day_num % 7) * 0.01)
  elif month in [3, 4]:
      base_obs = 0.82 + ((day_num % 6) * 0.01)
  elif month in [5, 10]:
      base_obs = 0.70 + ((day_num % 5) * 0.01)
  else:
      base_obs = 0.42 + ((day_num % 8) * 0.02)
  ```
* **The Reality:** We claim to detect cloud-cover blindspots to prevent false negatives. But we never downloaded NASA MOD35 or VNP06 cloud masks. The score is literally generated from the day number.
> 🇧🇩 **বাংলা ব্যাখ্যা:** আমরা দাবি করেছি যে মেঘের কারণে স্যাটেলাইট না দেখতে পেলে আমরা তা ধরতে পারি। কিন্তু কোডে মেঘের কোনো স্যাটেলাইট ডেটাই নেই! ক্যালেন্ডারের তারিখ দিয়ে একটি গাণিতিক সূত্র বানিয়ে এটি দেখানো হচ্ছে।

---

### Flaw 9: Hardcoded Validation Metrics
* **What's broken:** `src/validation.py` lines 53–57:
  ```python
  harm_pearson = 0.942
  harm_rmse = 3.82
  harm_pbias = 1.84
  harm_willmott = 0.968
  interval_coverage = 94.8
  ```
* **The Reality:** These are hardcoded numbers. When evaluated on the real 7,694 overlapping 1 km cell-days, the actual cross-sensor Pearson correlation is only **$r = 0.035$**! Furthermore, `Validation.tsx` displays a fabricated sample count of 340 for the Sundarbans Mangrove, where only 15 fires exist in the entire 24-year archive.
> 🇧🇩 **বাংলা ব্যাখ্যা:** ভ্যালিডেশন পেজের সংখ্যাগুলো কোডে ফিক্সড করা। বাস্তবে একই দিনে একই ১ কিমিতে দুটো স্যাটেলাইটের ডেটার কোরিলেশন মাত্র ০.০৩৫। এছাড়া সুন্দরবনে ২৪ বছরে মাত্র ১৫টি আগুন লাগলেও সাইটে ৩৪০টি স্যাম্পল দেখানো হচ্ছে।

---

### Flaw 10: Production Deployment Disconnect (Localhost Fallback)
* **What's broken:** The React app on Vercel (`bengalflare.vercel.app`) calls `http://127.0.0.1:8000/...`.
* **The Reality:** When a mentor or judge visits Vercel, `127.0.0.1` tries to reach the judge's own local computer, which has no backend running. Every single API request fails instantly and falls back to static JSON fixtures in `public/fixtures/`. The live webapp is running 100% on static demo files, not a live backend.
> 🇧🇩 **বাংলা ব্যাখ্যা:** Vercel-এ কোনো পাইথন ব্যাকএন্ড নেই। ইউজার বা জাজ যখন ওয়েবসাইট ভিজিট করে, ব্রাউজার লোকালহোস্টে রিকোয়েস্ট পাঠিয়ে ফেইল করে এবং ফোল্ডারের ভেতর থাকা স্ট্যাটিক JSON ফাইল লোড করে সাইট চালায়।

---

## Section 3: Production Upgrade Blueprint (How to Fix Existing Features) / বিদ্যমান ফিচারগুলো নিখুঁত করার উপায়

> [!IMPORTANT]
> **No New Features Needed!**  
> We do NOT need to build new dashboards or add new external topics. We simply need to make our **existing 10 components REAL, robust, and mathematically valid**. Here is the exact step-by-step engineering fix:

---

### Step 1: Complete Ingestion & Boundary Clipping (`src/ingest.py`)
1. **Download NOAA-20 VIIRS:** Go to NASA FIRMS download tool and download standard NOAA-20 VIIRS (VJ114IMG) for Bangladesh (2018–2026). Add it to `src/ingest.py` under `load_real_firms_data()`.
2. **Clip to Bangladesh Polygon:** Load `metadata/BGD_boundary.geojson` into GeoPandas and perform a spatial join (`gpd.sjoin(gdf, boundary, predicate='within')`). This cleanly removes all Indian and Myanmar border detections.
> 🇧🇩 **করণীয়:** নাসা থেকে NOAA-20 এর ডেটা নামিয়ে কোডে যোগ করতে হবে এবং জিওপ্যান্ডাস দিয়ে বাংলাদেশের বর্ডার ফাইলের ভেতরে পয়েন্টগুলোকে ক্লিপ করতে হবে যাতে ভারতের আগুন বাদ পড়ে।

---

### Step 2: Fix the Coincident Double-Counting Bug (`src/hfai.py`)
Replace the simple `sum()` on overlapping cell-days with a **weighted sensor consensus**:
```python
# Instead of summing MODIS and VIIRS:
# If both sensors detected fire in the same 1 km cell on the same day:
# Compute weighted consensus:
def fuse_coincident(group):
    if len(group) == 1:
        return group['hfai_base'].iloc[0]
    # Coincident overpass: Take maximum energy or weighted average
    modis_part = group[group['sensor'] == 'MODIS']
    viirs_part = group[group['sensor'] == 'VIIRS']
    if len(modis_part) > 0 and len(viirs_part) > 0:
        # Consensus: 60% weight to VIIRS (finer resolution), 40% to MODIS
        return 0.6 * viirs_part['hfai_base'].sum() + 0.4 * modis_part['hfai_base'].sum()
    return group['hfai_base'].sum()
```
> 🇧🇩 **করণীয়:** একই সেলে দুটো স্যাটেলাইট আগুন দেখলে সরাসরি যোগ না করে একটি ওয়েটেড কনসেনসাস (যেমন ৬০% VIIRS + ৪০% MODIS) বের করতে হবে। এতে আগুনের মান অযথা দ্বিগুণ হবে না।

---

### Step 3: Fix the "Sensor Disagreement" Logic (`scripts/make_points_fixture.py`)
Replace the `f > 60` bug with **true spatial-temporal collocation**:
1. Check if a point has a detection from the *other* sensor within **1.5 km and within $\pm 2$ hours**.
2. If yes $\implies$ Label as `'both'` (Consensus).
3. If only MODIS detected it $\implies$ Label as `'modis-only'`.
4. If only VIIRS detected it $\implies$ Label as `'viirs-only'`.
> 🇧🇩 **করণীয়:** ৬০ মেগাওয়াটের ফালতু লজিক বাদ দিয়ে, যদি সত্যিই ১.৫ কিমির মধ্যে এবং ২ ঘণ্টার ব্যবধানে অন্য স্যাটেলাইটটিও আগুন দেখে থাকে, শুধুমাত্র তখনই তাকে 'Both' হিসেবে ট্যাগ করতে হবে।

---

### Step 4: Fix the Climatology Baseline & Seasonality Engine (`src/climatology.py`)
To make anomaly detection mathematically valid:
1. **Move from 1-day to 15-day moving window:** For any day of the year $d$, pool all observations from $d-7$ to $d+7$ across all baseline years (2001–2020).
2. **Spatial Aggregation:** Aggregate to the **Upazila (sub-district) or Division level** rather than sparse 1 km cells.
3. **Zero-Filling:** Include zero-fire days in the distribution so that absence of fire is reflected in the median and standard deviation.
4. **Compute Standardized Anomaly Score (Z-Score):**
   $$\text{Z-Score} = \frac{\text{Current HFAI} - \text{Seasonal Median}}{\text{Interquartile Range (IQR)}}$$
> 🇧🇩 **করণীয়:** একদিনের পরিবর্তে ১৫ দিনের মুভিং উইন্ডো নিতে হবে এবং জেলা/উপজেলা পর্যায়ে নিয়ে আগুনহীন দিনগুলোর মান ০ ধরে হিসেব করতে হবে। তাহলে সত্যিকার অর্থে ঋতুভিত্তিক অ্যানোমালি কাজ করবে।

---

### Step 5: Connect the Live API to Real Parquet Baselines (`api/main.py`)
Remove the arbitrary cutoffs (`HFAI > 400`) from `api/main.py`. Instead:
1. Connect `/calendar` directly to the `climatology_baseline.parquet` table.
2. Anomaly bands should be assigned dynamically:
   * $\text{Z-Score} > 3.0$ or $\text{Percentile} \ge 95\% \implies \text{Extreme Anomaly}$
   * $\text{Z-Score} > 2.0$ or $\text{Percentile} \ge 80\% \implies \text{High Anomaly}$
   * $\text{Z-Score} > 1.0$ or $\text{Percentile} \ge 60\% \implies \text{Elevated Anomaly}$
   * Otherwise $\implies \text{Normal}$
> 🇧🇩 **করণীয়:** এপিআই-তে ফিক্সড ৪০০ বা ২০০ সংখ্যা বাদ দিয়ে হিস্টোরিক্যাল z-score এর ভিত্তিতে ক্যালেন্ডারের কালার ও অ্যানোমালি ব্যান্ড সেট করতে হবে।

---

### Step 6: Upgrade Observability to Real Cloud Fractions
Instead of the modulo formula (`0.88 + (day % 7) * 0.01`):
1. Download monthly cloud fraction averages for Bangladesh from NASA NEO (NASA Earth Observations) or MODIS MOD08_M3 atmosphere monthly product (freely available as low-resolution GeoTIFF).
2. Read the cloud fraction $C \in [0, 1]$ for that month and cell.
3. Set:
   $$\text{Observability Score} = 1.0 - C$$
   * If $C > 0.70$ (70% cloud cover during monsoon) $\implies \text{Observability = Low (0.30)}$.
> 🇧🇩 **করণীয়:** তারিখের কাল্পনিক সূত্র বাদ দিয়ে নাসার ফ্রি MOD08 মাসিক ক্লাউড ফ্র্যাকশন ডেটা ব্যবহার করে Observability = (১ - মেঘের হার) হিসেবে হিসাব করতে হবে।

---

### Step 7: Perform Real Empirical Validation with GEE (MCD64A1)
To replace the hardcoded $0.942$ correlation with real science:
1. Open Google Earth Engine (GEE).
2. Load `MODIS/006/MCD64A1` (Burned Area Monthly) for Bangladesh from 2001 to 2022.
3. Calculate monthly burned area ($\text{km}^2$) for each of Bangladesh's 8 divisions.
4. Calculate monthly sum of our harmonized HFAI for the same divisions.
5. Compute Pearson/Spearman correlation between monthly HFAI and monthly Burned Area in Python.
6. Display the **actual measured correlation** (even if it is $r = 0.75$ or $0.82$, real science always wins over fabricated 0.94!).
> 🇧🇩 **করণীয়:** গুগল আর্থ ইঞ্জিন থেকে নাসার ৫০0 মিটার Burned Area ডাটা নামিয়ে আমাদের HFAI-এর সাথে বিভাগের ভিত্তিতে আসল কোরিলেশন বের করে রিপোর্টে বসাতে হবে। আসল সংখ্যা ০.৭৫ হলেও তা জাজদের কাছে ১০০ গুণ বেশি গ্রহণযোগ্য!

---

### Step 8: Deploy Backend to Free Cloud Tier (Render / Fly.io)
1. Create a free account on [Render.com](https://render.com) or [Fly.io](https://fly.io).
2. Create a Web Service pointing to `firechronicle/api/main.py`.
3. In `firechronicle/app/src/`, change all `http://127.0.0.1:8000` URLs to `https://bengalflare-api.onrender.com`.
4. Now, the live web app on Vercel will talk to the real live backend API with zero fallback errors!
> 🇧🇩 **করণীয়:** FastAPI ব্যাকএন্ডকে Render বা Fly.io-তে ডিপ্লয় করে ফ্রন্টএন্ডের লোকালহোস্ট লিংক পরিবর্তন করে ক্লাউড লিংক দিয়ে দিতে হবে। এতে সাইটটি সত্যিকার অর্থেই ফুল-স্ট্যাক লাইভ হয়ে যাবে।

---

## Section 4: The NASA Space Apps Winning Formula / নাসা জাজদের সন্তুষ্ট করে বিজয়ী হওয়ার কৌশল

NASA Space Apps Challenge evaluates projects on **five official criteria**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        NASA SPACE APPS GLOBAL JUDGING CRITERIA                         │
├──────────────────────────┬───────┬─────────────────────────────────────────────────────┤
│ CRITERIA                 │ WEIGHT│ HOW BENGALFLARE CAN SCORE 10/10                     │
├──────────────────────────┼───────┼─────────────────────────────────────────────────────┤
│ 1. Relevance to NASA     │ 20%   │ Uses real NASA FIRMS data, addresses S-NPP handover,│
│    Mission               │       │ and models official Terra/Aqua/VIIRS sensors.       │
├──────────────────────────┼───────┼─────────────────────────────────────────────────────┤
│ 2. Scientific & Math     │ 20%   │ ELIMINATE FAKE ML CLAIMS. Present the physical      │
│    Rigor                 │       │ energy scaling, explain overpass geometry & bowtie  │
│                          │       │ physics, and show real GEE validation.              │
├──────────────────────────┼───────┼─────────────────────────────────────────────────────┤
│ 3. Technical Execution   │ 20%   │ Clean full-stack integration (FastAPI on Render +   │
│                          │       │ React 19 on Vercel + Parquet columnar storage).     │
├──────────────────────────┼───────┼─────────────────────────────────────────────────────┤
│ 4. User Experience &     │ 20%   │ We already have 10/10 here! The MapLibre GL UI,     │
│    Design                │       │ glassmorphism design, and scrollytelling are elite. │
├──────────────────────────┼───────┼─────────────────────────────────────────────────────┤
│ 5. Future Impact &       │ 20%   │ Addresses the November 2026 Suomi-NPP retirement    │
│    Continuity            │       │ with a clear open-source roadmap for South Asia.    │
└──────────────────────────┴───────┴─────────────────────────────────────────────────────┘
```

> 🇧🇩 **জয়ের মূল রহস্য:** আমাদের ইউজার ইন্টারফেস এবং ভিজ্যুয়াল ডিজাইন অলরেডি বিশ্বমানের (১০ এ ১০ পাওয়ার মতো)। আমরা যদি শুধু আমাদের বৈজ্ঞানিক সততা ফিরিয়ে আনি (ফেক ML বাদ দিয়ে বাস্তব ফিজিক্যাল স্কেলিং ও রিয়েল ক্লাউড কানেকশন নিশ্চিত করি), তাহলে টেকনিক্যাল জাজরা আমাদের প্রজেক্টকে টপ র‍্যাংকে রাখবে!

---

## Section 5: Step-by-Step Execution Plan / ধাপে ধাপে বাস্তবায়নের অগ্রাধিকার তালিকা

### Phase 1: Presentation Defense Preparation (Immediate / আজকেই)
* [ ] **Update Presentation Script:** Use the script from Part 5 of `BengalFlare_Technical_Audit_Report.md`. Clearly state: *"Our current deployment implements a deterministic physical sensitivity index (HFAI) with a 0.2 VIIRS scaling factor, while our long-term research roadmap develops a Two-Stage Quantile Regression Forest."*
* [ ] **Disclose Validation Honestly:** If asked about validation, state that the 0.94 in the UI is a benchmark target KPI, while our empirical 1 km pixel correlation is 0.035 due to diurnal overpass timing and off-nadir pixel growth.

### Phase 2: Core Engineering Fixes (Next 48 Hours)
* [ ] **Fix Line 36 in `src/hfai.py`:** Update coincident cell aggregation from `sum()` to weighted average to remove the double-counting bug.
* [ ] **Fix Line 33 in `scripts/make_points_fixture.py`:** Remove the `f > 60` logic and check true sensor collocation.
* [ ] **Deploy Backend to Render:** Host FastAPI on Render and update frontend fetch URLs so the site is 100% live.

### Phase 3: Scientific Validation Sprint (Next 1–2 Weeks)
* [ ] **Ingest NOAA-20 VIIRS:** Add standard NOAA-20 data to complete the 5-satellite record.
* [ ] **GEE Burned Area Validation:** Compare monthly HFAI against MCD64A1 burned area in Google Earth Engine.
* [ ] **Zero-Filled 15-Day Climatology:** Implement true seasonal z-scores in `src/climatology.py`.
