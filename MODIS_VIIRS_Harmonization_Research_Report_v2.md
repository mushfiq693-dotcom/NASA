# NASA Space Apps Challenge 2026
# Harmonization of MODIS & VIIRS Hot Spots
## Updated Deep-Research & Implementation Report — v2

**Revision:** 7 October 2026  
**Purpose:** Implementation-ready scientific and engineering blueprint for the NASA Space Apps 2026 challenge.

---

## 0. What Changed in v2

This version updates the earlier roadmap/report using the NASA.gov search page supplied by the team, the current NASA Space Apps 2026 challenge page, current NASA FIRMS/Earthdata documentation, recent NASA fire-science articles, and recent literature.

The supplied NASA.gov URL is a **site-wide search page**, not the challenge specification itself. The query currently returns 15,344 broad NASA results and surfaces several relevant NASA Science pages. The actual challenge page is hosted on the NASA Space Apps Challenge site. Therefore, challenge-specific requirements should be taken from the official Space Apps challenge page, while NASA.gov/NASA Science/FIRMS/Earthdata pages should be used for scientific and data documentation.

### Key v2 upgrades

1. **Observation opportunity becomes a first-class variable.** A missing hotspot is not equivalent to zero fire activity. NASA documents clouds, fog, smoke, viewing geometry, processing gaps, and fires occurring between satellite passes as causes of under-detection.
2. **Platform-aware VIIRS processing is mandatory.** Treat S-NPP, NOAA-20, and NOAA-21 separately.
3. **The S-NPP transition must be built into the architecture.** NASA says S-NPP science-product delivery will cease on **1 November 2026**; current monitoring should therefore not depend on S-NPP alone.
4. **NOAA-20 historical availability must be queried dynamically.** NASA's general FIRMS active-fire page lists standard NOAA-20 VIIRS from 1 April 2018, and the LAADS archive contains 2018 data; a separate descriptive page gives a different summary start date. Use `data_availability` as the runtime authority.
5. **Standard Processing is the scientific dataset.** NRT should mainly serve live/demo functionality; NASA explicitly advises scientific users to use Standard Processing data.
6. **Use the FIRMS `missing_data` service.** A date with missing satellite/product data must be distinguished from a legitimately observed date with zero detections.
7. **Raw detection count is not enough.** The final Harmonized Fire Activity Index should use occurrence, intensity, quality, and uncertainty rather than a single hotspot count.
8. **The harmonization target should not automatically be MODIS.** The stronger formulation is a common latent/standardized activity representation estimated from both sensors during overlap.
9. **Recent NASA examples show non-monotonic detection bias.** During extremely smoky/cloudy conditions, reported active-fire counts can decline even while actual fire impact is severe.
10. **Recent research strengthens an observation-operator approach.** A 2026 preprint explicitly models MODIS/VIIRS detection limits and an observation operator for cross-mapping FRP. Treat it as emerging research, not an established NASA standard.

---

# 1. Official Challenge Interpretation

NASA's 2026 challenge asks teams to build a web application that harmonizes active-fire hotspot records into a **burning activity calendar**. The challenge description explains that active-fire records spanning more than two decades are split across sensors whose observations cannot be directly compared, leaving users without a consistent picture of historical burning. The intended users include early-warning and emergency-response stakeholders, scientists, and land managers.

### Scientific interpretation

The project is therefore not primarily a visualization task.

It is:

> A cross-sensor observation harmonization problem followed by historical fire-activity analysis and decision-support visualization.

### Engineering interpretation

The software is the delivery mechanism for a scientific result:

```text
NASA MODIS + VIIRS
        ↓
Data quality / observation opportunity
        ↓
Spatial + temporal normalization
        ↓
Cross-sensor comparison
        ↓
Harmonization
        ↓
Uncertainty
        ↓
Historical baseline
        ↓
Anomaly / critical period
        ↓
Burning Activity Calendar
```

NASA Space Apps challenge page:  
https://www.spaceappschallenge.org/2026/challenges/harmonization-of-modis-and-viirs-hot-spots/

---

# 2. NASA.gov Search Audit

The supplied URL:

https://www.nasa.gov/?search=Harmonization+of+MODIS+and+VIIRS+Hot+Spots

is useful mainly as a discovery layer. NASA's search currently returns a very broad result set. Among the results most relevant to this project are:

- **A Clearer View of Fire** — NASA Earth Observatory, explaining the MODIS/VIIRS spatial-resolution difference and small-fire sensitivity.
- **Is Fire Activity Declining in Northwestern India?** — NASA Earth Observatory, especially valuable because it documents overpass timing, clouds/fog, missing VIIRS observations, and interpretation of year-to-year fire counts.
- **NASA covers wildfires from many sources** — NASA Science, summarizing MODIS and VIIRS capabilities and complementary data sources.
- **Peatland Fires Darken Skies in Indonesia** — NASA Science, a 2026 example showing that thick smoke/clouds and understory/underground fires can make satellite hotspot counts misleading.
- **A Harmonious New Dataset** — NASA Science, a useful analogy for the principle of sensor harmonization, although it concerns Landsat/Sentinel-2 rather than active-fire data.

The search page itself does not add a hidden technical requirement to the Space Apps challenge. Instead, it reinforces the scientific assumptions that should be built into the implementation.

---

# 3. Most Important NASA Finding: Absence of Detections Is Not Zero Activity

This is the most important v2 addition.

NASA's 2024 analysis of fire activity in Punjab and Haryana explicitly warns that MODIS and VIIRS only observe the region during limited satellite passes, meaning fires that start and end between observations can be missed. NASA also identifies clouds, fog, thick smoke, viewing angle, and processing issues as important causes of undercounting. Several peak burning days in November 2024 were missing from the S-NPP VIIRS record because of a data-processing problem.

NASA further reports that observed fire activity can decrease while smoke remains severe because some burning can occur later than the satellite afternoon overpass.

Therefore the model must distinguish:

```text
Observed zero
≠
No fire
```

More precisely:

```text
Observed + no detection
→ zero detected activity

Not observed / missing / obscured
→ unknown activity
```

This changes the data model.

Every grid-cell/time record needs an **observation status** such as:

```text
OBSERVED_DETECTION
OBSERVED_NO_DETECTION
MISSING_PRODUCT
KNOWN_OUTAGE
POTENTIALLY_OBSCURED
UNKNOWN
```

Never silently convert missing observations to zero.

---

# 4. NASA Finding: Sensor Resolution Is a Real Source of Systematic Disagreement

NASA's comparison article states that MODIS thermal-band fire observations are at approximately 1 km while VIIRS active-fire observations are approximately 375 m. NASA explains that the finer VIIRS resolution can detect many smaller and lower-temperature fires that MODIS misses.

This creates a fundamental observation-process difference.

A simplified representation is:

\[
Y_s = f_s(F, X) + \epsilon_s
\]

where:

- \(F\) = underlying fire activity
- \(s\) = sensor/platform
- \(X\) = observation/environmental context
- \(Y_s\) = observed hotspot/activity
- \(f_s\) = sensor-specific detection process
- \(\epsilon_s\) = uncertainty

Therefore the project should estimate a common activity representation:

\[
H = g(Y_{MODIS}, Y_{VIIRS}, X)
\]

rather than simply concatenating records.

---

# 5. MODIS Data Specification

For this challenge, use the NASA FIRMS MODIS Collection 6.1 active-fire record.

Current FIRMS documentation lists:

- Terra MODIS: from **1 November 2000** to present
- Aqua MODIS: from **3 July 2002** to present
- nominal sensor resolution: about **1 km** for the fire product
- temporal characterization: daily

Important attributes include:

```text
latitude
longitude
acq_date
acq_time
satellite
instrument
confidence
brightness
bright_t31
scan
track
frp
daynight
version
type (when available in the standard product)
```

`latitude` and `longitude` are the centers of the detected fire pixels and should not be interpreted as exact physical fire locations. NASA explicitly states that one or more fires can occur inside a detected 1-km pixel.

Terra and Aqua have different equatorial crossing times, so do not collapse them without preserving the platform identity.

---

# 6. VIIRS Data Specification

Use the NASA FIRMS VIIRS **375 m active-fire products**.

Platforms:

```text
Suomi NPP
NOAA-20 / JPSS-1
NOAA-21 / JPSS-2
```

Current FIRMS documentation identifies nominal 375 m fire-pixel resolution and twice-daily equatorial observations for an individual polar-orbiting platform; when considering the multiple VIIRS platforms together, coverage opportunities can be more frequent at mid-latitudes.

Important attributes include:

```text
latitude
longitude
bright_ti4
bright_ti5
scan
track
acq_date
acq_time
satellite
instrument
confidence
version
frp
daynight
```

For standard products, a `type` classification may also be available:

```text
0 = presumed vegetation fire
1 = active volcano
2 = other static land source
3 = offshore detection
```

### Important version rule

A 2025 FIRMS processing bug affected the monthly Collection-2 `Vxx14IMGML` Type field for versions 1 and 2. NASA corrected the bug in May 2025 and reprocessed affected files to version 3.

Therefore:

```text
Never perform historical Type-based filtering without checking product version.
```

---

# 7. Critical 2026 Platform Transition

NASA FIRMS currently states:

> Delivery of Suomi NPP science data products will cease on **1 November 2026**.

Users are advised to transition to NOAA-20 and NOAA-21.

### Project consequence

Historical pipeline:

```text
MODIS Terra/Aqua
VIIRS S-NPP
VIIRS NOAA-20
VIIRS NOAA-21
```

Operational pipeline after the transition:

```text
MODIS where relevant
VIIRS NOAA-20
VIIRS NOAA-21
```

S-NPP should be preserved as a historical bridge but not be a single point of failure for live monitoring.

---

# 8. Critical Data-Availability Correction: NOAA-20

Current NASA FIRMS pages are not perfectly synchronized in their summary wording.

The general FIRMS active-fire page currently lists:

```text
VIIRS NOAA-20: 1 April 2018 → present
```

The NASA LAADS `VJ114IMG` archive contains 2018 directories and files.

However, a separate VIIRS descriptive page currently summarizes NOAA-20 temporal coverage beginning 1 January 2020.

### Implementation rule

Do not hard-code a historical start date from a static description page.

Use:

```text
/api/data_availability
```

at pipeline initialization or metadata refresh.

For scientific reproducibility, store the returned availability metadata in:

```text
metadata/product_availability.csv
```

This is a general lesson:

> NASA's dynamic availability service should be treated as more operationally authoritative than a stale summary date printed on an older descriptive page.

---

# 9. Use Standard Processing for the Research Record

NASA FIRMS states that NRT data are replaced by the corresponding standard MODIS/VIIRS observations when science-quality processing becomes available, typically after a multi-month lag.

Therefore:

### Research / historical model

```text
STANDARD PROCESSING
```

### Live demo / current-status panel

```text
NRT
```

Do not train the historical harmonization model on NRT data when Standard Processing data for the same interval are available.

---

# 10. FIRMS APIs and Services

Current FIRMS API documentation exposes services including:

```text
area
countries
country
(data availability)
missing_data
kml fire footprints
map_key
```

The current area API accepts:

```text
MAP_KEY
SOURCE
AREA_COORDINATES
DAY_RANGE
DATE (optional)
```

The area query accepts a bounding box and allows up to **5 days** per request.

The current MAP_KEY allowance is **5,000 transactions per 10-minute interval**; larger requests can count as multiple transactions.

### Correct architecture

Do not use the API as the main mechanism for downloading decades of global history.

Use:

```text
Historical:
NASA archive / LAADS / standard products

Operational:
FIRMS API / NRT
```

Use WMS/WFS primarily for interactive display or lightweight GIS access.

NASA states that FIRMS WMS is updated every 15 minutes and supports EPSG:4326 and Web Mercator.

---

# 11. Add `missing_data` to the Core Pipeline

This is a new recommended component.

Before constructing the daily historical series:

```text
product availability
        ↓
missing-data dates
        ↓
quality / outage mask
        ↓
fire observations
```

A cell-day row should carry:

```text
satellite_observation_available
product_available
known_outage
```

Then the time-series engine can distinguish:

```text
0 = observed and no detection
NA = not observable / missing
```

This prevents severe downward bias in historical activity estimates.

---

# 12. Data-Quality Model

The project should explicitly distinguish four mechanisms.

## A. Detection failure

The fire exists but is not detected because of:

- small fire size
- low temperature contrast
- sub-pixel dilution
- unfavorable viewing geometry
- canopy
- smoke
- cloud
- observation time

## B. Product/data failure

The satellite/product did not provide usable observations due to:

- processing problem
- instrument outage
- product outage
- missing data

## C. Commission error

Detected anomaly is not the target vegetation fire, e.g.:

- gas flare
- volcano
- hot surface
- other static thermal source

## D. Multiplicity / duplication

One physical event can lead to multiple detections.

These mechanisms must not be lumped together.

---

# 13. New Scientific Requirement: Observation Opportunity

This should become a formal feature.

Define for each sensor-platform-grid-time record:

\[
O_{s,g,t}
\]

where \(O\) describes whether a meaningful observation opportunity existed.

A simple first version is:

```text
1 = product available
0 = known missing/outage
```

A stronger version adds:

```text
cloud-obscured flag
viewing geometry
scan/track footprint
observation time
land/water mask
```

An even more advanced version estimates:

\[
P(\text{detect fire}\mid F,X,s)
\]

This is a detection-probability model rather than a raw-count model.

---

# 14. Cloud and Smoke Must Be Treated as a Statistical Problem

NASA's FIRMS cloud guidance shows that heavy clouds can suppress active-fire detections for several consecutive days.

NASA's 2026 Indonesia article adds a particularly important point: thick smoke/clouds, forest understory fires, and underground peat fires can make the most severe fire periods difficult to observe, and in some cases the count of MODIS/VIIRS detections can actually decrease as the event becomes more severe.

Therefore:

\[
\text{Observed count}\neq\text{monotonic proxy for actual fire severity}
\]

This is a major reason not to build the project around raw fire-count forecasting.

The application should be able to display:

```text
HIGH ACTIVITY
but
LOW OBSERVATION CONFIDENCE
```

or:

```text
LOW DETECTED ACTIVITY
but
HIGH OBSCURATION / MISSINGNESS
```

That is scientifically much better.

---

# 15. Define the Common Spatial Representation

A common analytical grid remains recommended.

Start with:

\[
\boxed{1\text{ km grid}}
\]

because the MODIS fire product is nominally approximately 1 km while VIIRS 375 m detections need to be aggregated to a common scale for fair comparison.

### Do not simply compare point counts

Instead calculate multiple cell-level variables:

```text
raw_detection_count
unique_detection_count
fire_presence
FRP_sum
FRP_mean
FRP_max
confidence_mean
```

### Better implementation

Where actual pixel footprints are available, use area-aware overlap rather than assuming every detection is exactly a square of nominal resolution.

For a first MVP, point-to-grid assignment is acceptable, provided the limitations are stated.

Then run a sensitivity analysis comparing:

```text
1 km
5 km
10 km
```

This answers whether harmonization is stable across spatial scale.

---

# 16. Spatial Deduplication

The same physical burning area can generate multiple detections.

Recommended hierarchy:

### Level 1

Same sensor + platform + acquisition time + grid cell.

### Level 2

Cluster nearby detections within a short temporal window.

### Level 3

Optionally infer event objects using DBSCAN or a spatiotemporal clustering algorithm.

Keep both:

```text
raw_count
cluster_count
```

Do not destroy the original measurements.

---

# 17. Temporal Harmonization

NASA acquisition time is UTC.

Store:

```text
acq_datetime_utc
local_datetime
local_date
```

Do not replace the UTC value.

For matching observations between MODIS and VIIRS, use a hierarchy rather than one arbitrary window:

```text
Primary: near-contemporaneous matching
Secondary: same-day common-grid aggregation
Tertiary: daily/weekly/monthly climatological comparison
```

Start with a narrow time window around contemporaneous observations, then test wider windows in a sensitivity analysis.

Do not interpret disagreement from different observation times as pure sensor bias.

---

# 18. MODIS–VIIRS Overlap Dataset

Construct one row per common spatial-temporal unit:

```text
grid_id
date

MODIS_Terra_count
MODIS_Aqua_count
MODIS_count
MODIS_FRP_sum
MODIS_confidence

VIIRS_SNPP_count
VIIRS_NOAA20_count
VIIRS_NOAA21_count
VIIRS_count
VIIRS_FRP_sum
VIIRS_confidence

platform_count
observation_available
missing_flag
obscuration_flag
month
season
daynight
scan_summary
track_summary
```

For platform-level validation, preserve the individual platform fields instead of only creating a single VIIRS total.

---

# 19. Core Comparison Experiments

Run these before any ML.

## Experiment A — counts

\[
C_M, C_V
\]

## Experiment B — FRP

\[
FRP_M, FRP_V
\]

## Experiment C — presence

```text
MODIS only
VIIRS only
Both
```

## Experiment D — spatial scale sensitivity

```text
1 km
5 km
10 km
```

## Experiment E — temporal sensitivity

```text
same overpass
same day
weekly
monthly
```

## Experiment F — context sensitivity

Stratify by:

```text
season
land cover
day/night
FRP intensity
confidence
platform
scan/track
```

---

# 20. The Four Essential Diagnostics

### 1. Scatter plot

\[
x=VIIRS,\quad y=MODIS
\]

### 2. Bias

\[
Bias=\frac{1}{n}\sum(\hat y-y)
\]

### 3. Ratio / relative difference

Use carefully because near-zero denominators are unstable.

Prefer log transforms or additive metrics when counts are sparse.

### 4. Agreement map

```text
MODIS only
VIIRS only
Both
Unknown
```

This visualization should become a signature feature of the project.

---

# 21. Recommended Activity Variables

Do not define fire activity as raw hotspot count alone.

Build at least:

### A. Detection occurrence

```text
fire_presence ∈ {0,1}
```

### B. Detection density

```text
detection_count / observed_area
```

or equivalent common-grid normalization.

### C. Thermal intensity

```text
FRP_sum
FRP_mean
FRP_max
```

### D. Recurrence

```text
number of active days in the window
```

### E. Persistence

```text
number of consecutive active periods
```

The final harmonized score can use several of these instead of one count.

---

# 22. Do Not Treat MODIS as Automatically "Truth"

A major methodological improvement is to avoid:

> VIIRS must be mathematically transformed into MODIS because MODIS is ground truth.

There is no general scientific justification for that assumption.

Instead define a standardized target:

\[
H_{g,t}
\]

representing common fire-activity intensity in grid cell \(g\) and time \(t\).

During overlap:

\[
H=f_M(Y_M,X)
\]

and

\[
H=f_V(Y_V,X)
\]

The common target can be calibrated so that both sensor streams yield comparable long-term statistics without declaring one sensor universally superior.

For the hackathon, however, a MODIS-equivalent baseline may be implemented as a transparent baseline model, explicitly labeled as such.

---

# 23. Harmonization Baselines

Use multiple baselines.

## Baseline 0 — Raw concatenation

This should intentionally perform poorly or show discontinuity.

Purpose: demonstrate the problem.

## Baseline 1 — Global ratio

\[
V_{adj}=V\times r
\]

Use only as a naive benchmark.

## Baseline 2 — Context-specific ratio

\[
r=f(season,daynight,landcover,platform)
\]

## Baseline 3 — Log-linear regression

\[
M=\beta_0+\beta_1\log(1+V)+\beta_2\log(1+FRP)+\beta_3X+\epsilon
\]

## Baseline 4 — Quantile mapping

Useful for distributional harmonization.

## Baseline 5 — Gradient boosting / Random Forest

Useful when relationships are nonlinear.

Do not jump directly to neural networks.

---

# 24. Recommended Final Harmonization Strategy

The strongest hackathon-ready model is a **two-stage observation-aware harmonizer**.

### Stage 1 — Sensor adjustment

Estimate expected common activity from sensor-specific measurements and context:

\[
\hat H_s=f_s(Y_s,X)
\]

### Stage 2 — Uncertainty weighting

Combine the available sensor estimates:

\[
H = \frac{\sum_s w_s\hat H_s}{\sum_s w_s}
\]

with weights based on a documented reliability function, for example:

\[
w_s=f(availability,confidence,obscuration,platform,geometry,validation)
\]

The exact function should be fitted/validated rather than invented.

This is conceptually stronger than:

```text
MODIS + VIIRS = average
```

---

# 25. Optional Advanced Model — Detection Probability / Observation Operator

Recent 2026 research proposes analytical observation operators for MODIS and VIIRS FRP and explicitly models detection limits as functions of pixel area and observation conditions.

The preprint reports much lower detection limits for VIIRS than MODIS under some conditions and substantial regional variability in detection probability.

Because the work is still a preprint, it should be treated as:

```text
EMERGING RESEARCH
```

not NASA policy or a required project algorithm.

Nevertheless, it suggests an excellent advanced direction:

\[
P(D=1\mid F,X,s)
\]

Then estimate latent activity from observed detections by accounting for expected detection probability.

This is the research-heavy version of your project.

---

# 26. Uncertainty

Every harmonized output should include uncertainty.

Possible sources:

```text
sensor disagreement
model residual
missing observations
cloud/smoke obscuration
platform differences
spatial mismatch
temporal mismatch
```

A simple first implementation is bootstrap-based prediction intervals.

For each prediction:

```text
activity
lower_bound
upper_bound
quality_score
```

Do not confuse model prediction uncertainty with the total physical uncertainty of wildfire activity.

Label the output honestly as:

> model/data uncertainty in the harmonized satellite-derived activity estimate.

---

# 27. Validation — Major Upgrade

The most important judging result should be:

```text
BEFORE vs AFTER
```

But validation must avoid leakage.

Use:

### Temporal block validation

Example:

```text
Train: 2012–2019
Validation: 2020–2021
Test: 2022–2023
```

### Spatial holdout

Hold out geographical regions.

### Platform holdout

Where possible, test generalization to a later platform.

### Seasonal holdout

Train on all months except one seasonal block and test on the held-out season.

Never rely only on random row-wise 80/20 splitting.

---

# 28. Metrics

Use:

\[
MAE=\frac1n\sum |y-\hat y|
\]

\[
RMSE=\sqrt{\frac1n\sum(y-\hat y)^2}
\]

\[
Bias=\frac1n\sum(\hat y-y)
\]

and:

```text
Pearson/Spearman correlation
R² where appropriate
distributional distance
calibration / coverage of uncertainty intervals
```

For occurrence probabilities, also use:

```text
Brier score
precision / recall
ROC-AUC or PR-AUC where meaningful
```

Do not use only RMSE for a zero-inflated fire-activity series.

---

# 29. Validation Target: What Does "Better" Mean?

The harmonized product is better only if it demonstrates measurable improvement.

Recommended table:

| Metric | Raw sensor disagreement | Harmonized | Improvement |
|---|---:|---:|---:|
| MAE | X | Y | % |
| RMSE | X | Y | % |
| Bias | X | Y | % |
| Correlation | X | Y | % |
| Distribution gap | X | Y | % |
| Interval coverage | X | Y | % |

Only report numbers actually calculated.

---

# 30. Independent Validation Options

The ideal reference should be independent of both MODIS and VIIRS.

Possible options:

```text
Sentinel-2
Landsat 8/9
field/airborne observations
geostationary satellite information
burned-area products
```

### Important limitation

A high-resolution optical image acquired on a different date/time is not direct validation of an instantaneous active-fire detection.

Use two separate labels:

```text
DIRECT ACTIVE-FIRE VALIDATION
```

and:

```text
INDIRECT SPATIAL / BURNED-AREA VALIDATION
```

NASA's current ecosystem also includes Landsat 30-m active-fire products in FIRMS, which can be explored as a higher-resolution complementary source where coverage and latency permit.

---

# 31. Burned-Area Products as an Independent Context Layer

A 2025 Remote Sensing of Environment paper describing NASA's VIIRS VNP64A1 burned-area product reports that it adapts the MODIS MCD64A1 burned-area algorithm to VIIRS and is designed to provide continuity of the MODIS burned-area record.

This does not make burned area equivalent to active fire.

However, it suggests a useful validation experiment:

```text
Active-fire harmonized activity
              ↓
      predicted active/burning period
              ↓
Compare with subsequent burned-area signal
```

Use this as an independent supporting analysis, not as the target variable for the active-fire harmonization itself.

---

# 32. NASA Example: Northwestern India

This is an especially useful methodological case for the project.

NASA's article on Punjab and Haryana shows that:

- MODIS and VIIRS both detect seasonal stubble-burning patterns.
- VIIRS detects smaller fires than MODIS.
- year-to-year hotspot counts can be misleading.
- a VIIRS processing outage removed observations during important burning days in 2024.
- cloud and fog suppressed observations.
- some fire activity may happen later in the day than the satellite passes.

### Project lesson

Your burning calendar needs an explanatory dimension:

```text
LOW DETECTIONS
```

should sometimes resolve to:

```text
LOW OBSERVED ACTIVITY

or

LOW OBSERVABILITY
```

This is more useful than simply showing a low count.

---

# 33. NASA Example: Indonesian Peat Fires, 2026

NASA's September 2026 article gives another critical lesson.

MODIS and VIIRS can have difficulty detecting:

- thick smoke
- cloud cover
- understory fires
- underground peat fires

During severe events, fire counts can paradoxically decline because the satellite cannot see the fire reliably.

NASA also notes current use of MODIS and VIIRS observations by Indonesia's monitoring system.

### Project lesson

Add:

```text
OBSERVABILITY
```

as a separate indicator from:

```text
ACTIVITY
```

For example:

```text
Activity:        HIGH
Observability:   LOW
Confidence:      MODERATE
```

That is a powerful decision-support design.

---

# 34. FIRMS vs Your Project

The most dangerous judge question remains:

> Why not just use FIRMS?

Answer:

```text
FIRMS
→ provides the observations and operational access

OUR ENGINE
→ estimates a comparable historical activity representation
   across sensors/platforms
→ explicitly models missingness/observability
→ quantifies uncertainty
→ builds a temporal baseline
→ detects anomalies
→ produces a burning activity calendar
```

The novelty should therefore be in:

```text
scientific harmonization
+
observability-aware historical analysis
+
uncertainty
+
calendar interpretation
```

not in copying FIRMS maps.

---

# 35. Burning Activity Calendar Design

For each region and time unit, display:

```text
Harmonized Activity
Historical Percentile
Anomaly Score
Observability
Uncertainty
Sensor Agreement
```

Example:

```text
15 November

Harmonized activity      82
Historical percentile    96th
Anomaly                  +2.4σ
Sensor agreement         High
Observability            Medium
Uncertainty              ±14
Status                   Unusually High
```

Thresholds such as P90/P95 or z-scores should be presented as **project-defined statistical thresholds**, not NASA thresholds.

---

# 36. "Why Is This High?" Explainability Panel

This should be a core feature.

Example:

```text
WHY IS ACTIVITY UNUSUALLY HIGH?

• Harmonized activity is 62% above historical median
• Both MODIS and VIIRS support the increase
• Multiple grid cells are persistent across consecutive dates
• FRP is elevated
• Observability is high
• Confidence interval is relatively narrow
```

Or:

```text
WHY IS ACTIVITY LOW?

• Low observed detections
• Heavy cloud cover / low observability
• One satellite product has missing data
• Sensor agreement is poor

Interpretation: low satellite-observed activity,
not necessarily low physical fire activity.
```

---

# 37. Bangladesh Case Study

Bangladesh should remain the primary demonstration region unless exploratory results show that another region produces a scientifically stronger case.

Start at national level.

Then:

```text
Bangladesh
↓
division
↓
district
↓
1-km grid
```

Investigate empirically:

```text
agricultural burning
forest/vegetation burning
grassland/wetland burning
persistent thermal sources
seasonality
spatial recurrence
transboundary context
```

Do not begin by assuming which category dominates.

Let the data establish the patterns, then use external evidence to interpret them.

---

# 38. South Asia Expansion

After Bangladesh works:

```text
Bangladesh
↓
Eastern / Northeastern India
↓
Myanmar
↓
South Asia
```

This offers an important test:

> Does one harmonization model generalize geographically?

If not, regional calibration may be necessary.

This is scientifically interesting rather than being a weakness.

---

# 39. Research Frontier: Sensor Harmonization Is Not Automatically Global

Existing research has already demonstrated that MODIS–VIIRS disagreement can depend on:

```text
land cover
fire size
FRP
season
observation geometry
time of day
platform
```

Therefore a single global correction coefficient is not defensible unless experiments demonstrate it.

A better formulation is:

\[
H=f(sensor,platform,season,landcover,FRP,confidence,geometry,observability)
\]

The final model should be as simple as possible while preserving statistically important context.

---

# 40. Research Novelty Positioning

Do NOT claim:

> First MODIS–VIIRS fusion system.

That would be unsafe because substantial prior research already compares and fuses these records.

Instead claim:

> A reproducible, observation-aware, uncertainty-aware implementation that converts heterogeneous MODIS and VIIRS active-fire observations into a common historical burning-activity calendar, with explicit pre/post harmonization validation and interpretable observability diagnostics.

This is a much stronger and safer novelty claim.

---

# 41. Recommended HFAI Architecture

Call the core analytical layer:

# HFAI — Harmonized Fire Activity Index

For a grid cell \(g\) and time \(t\):

\[
HFAI_{g,t}=f(
occurrence,
intensity,
persistence,
observability,
quality,
sensor agreement
)
\]

The exact formula should be selected after exploratory analysis.

Do not make an arbitrary weighted sum before examining the data.

A useful first version can combine standardized components:

\[
HFAI = w_1OCC+w_2INT+w_3PERS-w_4UNC
\]

with weights determined by validation rather than aesthetics.

---

# 42. Recommended Data Tables

## Raw observation table

```text
observation_id
sensor
platform
product
version
latitude
longitude
acq_datetime_utc
confidence
frp
brightness
scan
track
daynight
type
source_file
```

## Cell-day table

```text
grid_id
date
platform
sensor
raw_count
unique_count
presence
frp_sum
frp_mean
frp_max
confidence_mean
observation_available
missing_flag
obscuration_flag
```

## Harmonized table

```text
grid_id
date
hfai
harmonized_occurrence
harmonized_intensity
uncertainty
historical_percentile
anomaly_score
sensor_agreement
observability
quality_class
```

---

# 43. Recommended Repository

```text
modis-viirs-harmonization/
│
├── README.md
├── research/
│   ├── official_challenge.md
│   ├── nasa_source_audit.md
│   ├── modis_profile.md
│   ├── viirs_profile.md
│   ├── firms.md
│   ├── data_quality.md
│   ├── literature_review.md
│   ├── harmonization_methods.md
│   ├── validation.md
│   └── research_gap.md
│
├── data/
│   ├── raw/
│   ├── interim/
│   ├── processed/
│   └── metadata/
│
├── notebooks/
│   ├── 01_availability.ipynb
│   ├── 02_download.ipynb
│   ├── 03_schema_qc.ipynb
│   ├── 04_grid_aggregation.ipynb
│   ├── 05_overlap.ipynb
│   ├── 06_bias_analysis.ipynb
│   ├── 07_harmonization.ipynb
│   ├── 08_validation.ipynb
│   ├── 09_anomaly.ipynb
│   └── 10_calendar.ipynb
│
├── src/
│   ├── availability.py
│   ├── ingest.py
│   ├── schema.py
│   ├── quality.py
│   ├── grid.py
│   ├── deduplicate.py
│   ├── collocation.py
│   ├── harmonization.py
│   ├── uncertainty.py
│   ├── validation.py
│   ├── anomaly.py
│   └── calendar.py
│
└── app/
```

---

# 44. Recommended Implementation Sequence

## Phase A — NASA data access

1. Create Earthdata account.
2. Obtain FIRMS MAP_KEY.
3. Query `data_availability`.
4. Query `missing_data`.
5. Confirm actual dates for every product/platform.
6. Store availability metadata.

## Phase B — pilot dataset

7. Download 30–90 days over Bangladesh.
8. Normalize MODIS.
9. Normalize VIIRS.
10. Preserve sensor/platform/product version.

## Phase C — quality control

11. Flag missing/outage periods.
12. Inspect Type/version.
13. Separate static thermal sources where scientifically appropriate.
14. Preserve confidence.
15. Preserve scan/track.

## Phase D — common representation

16. Build 1-km grid.
17. Aggregate observations.
18. Calculate presence/count/FRP.
19. Deduplicate.
20. Generate observation-status fields.

## Phase E — scientific comparison

21. Plot sensor counts.
22. Plot FRP.
23. Compare spatial agreement.
24. Compare seasonal differences.
25. Compare platform differences.
26. quantify bias.

## Phase F — harmonization

27. Implement raw baseline.
28. Implement ratio correction.
29. Implement regression.
30. Implement quantile mapping.
31. Implement tree-based model.
32. compare them.

## Phase G — uncertainty

33. Estimate prediction intervals.
34. Create observability score.
35. Create sensor-agreement score.

## Phase H — validation

36. Temporal holdout.
37. Spatial holdout.
38. Seasonal holdout.
39. Pre/post metrics.
40. Error analysis.

## Phase I — product

41. Build HFAI.
42. Build historical climatology.
43. Build anomaly detection.
44. Build critical-period logic.
45. Build calendar.

## Phase J — application

46. API.
47. Map.
48. Calendar.
49. disagreement layer.
50. Explainability panel.
51. methodology panel.
52. validation panel.

---

# 45. Recommended MVP for Space Apps

Do not attempt every advanced feature.

The MVP should have:

### 1. Historical harmonized calendar

### 2. Before/after sensor comparison

### 3. Sensor disagreement map

### 4. Observability / data-quality indicator

### 5. Historical anomaly score

### 6. Uncertainty

If those six are scientifically sound, the project will be stronger than a much larger but shallow dashboard.

---

# 46. Final Application Structure

```text
HOME
 │
 ├── Select Area
 ├── Select Date Range
 ├── Historical Calendar
 ├── Current Activity
 └── Methodology
       │
       ├── MODIS
       ├── VIIRS
       ├── Harmonization
       ├── Uncertainty
       └── Validation

ANALYSIS
 │
 ├── Sensor Comparison
 ├── Disagreement
 ├── Spatial Patterns
 ├── Temporal Patterns
 └── Recurrence

CALENDAR
 │
 ├── Normal
 ├── Elevated
 ├── High
 └── Extreme

DATE DETAILS
 │
 ├── Activity
 ├── Historical percentile
 ├── Sensor support
 ├── Observability
 ├── Uncertainty
 └── Why?
```

---

# 47. Judge-Proof Scientific Story

The story should be:

```text
PROBLEM
MODIS and VIIRS do not produce directly comparable records.

EVIDENCE
NASA and the scientific literature demonstrate resolution,
observation-time, platform, cloud/smoke and processing differences.

METHOD
We transform both into a common spatial-temporal representation,
model cross-sensor differences, preserve missingness and quantify
uncertainty.

PROOF
Pre/post holdout validation demonstrates whether disagreement falls.

NEW INFORMATION
The harmonized record provides a historical baseline, anomaly signal,
and burning-activity calendar.

DELIVERY
A web application makes the result understandable and actionable.
```

---

# 48. Five Questions You Must Be Able to Answer

## Q1

Why can't MODIS and VIIRS hotspot counts be compared directly?

### Answer
Because the observations come from different sensors/platforms with different spatial resolution, observation geometry/timing, detection characteristics, and sensitivity to small fires and environmental conditions.

## Q2

What exactly did you harmonize?

### Answer
A standardized spatial-temporal representation of satellite-observed burning activity, not physical fire extent or exact burned area.

## Q3

How do you know it improved?

### Answer
By comparing pre- and post-harmonization error, bias, agreement and distributional metrics on held-out observations.

## Q4

What happens when satellites cannot see the fire?

### Answer
The system records reduced observability or missingness rather than treating the event as zero activity.

## Q5

What is new after harmonization?

### Answer
A continuous, interpretable historical activity baseline that supports anomaly detection and a burning-activity calendar across sensor/platform transitions.

---

# 49. Claims You Should Avoid

Never say:

- "Every hotspot is a fire."
- "No hotspot means no fire."
- "VIIRS is exactly four times better than MODIS."
- "MODIS is ground truth."
- "Our model predicts fires" unless you actually develop and validate forecasting.
- "NASA uses our threshold."
- "Our method is the first MODIS–VIIRS fusion method."
- "The harmonized record gives exact burned area."

Use:

> active-fire detection

> satellite-observed fire activity

> harmonized satellite-derived activity

> uncertainty-aware estimate

---

# 50. Strongest Research Contribution

The best project is not:

```text
MODIS
+
VIIRS
+
AI
+
Map
```

It is:

```text
Different observation systems
        ↓
Known systematic inconsistencies
        ↓
Observation-aware normalization
        ↓
Quantitative harmonization
        ↓
Uncertainty
        ↓
Held-out validation
        ↓
Continuous historical activity representation
        ↓
Anomaly + recurrence + critical periods
        ↓
Burning Activity Calendar
```

---

# 51. Final Recommended Technical Direction

### Core data

```text
MODIS C6.1
VIIRS 375m Collection 2
```

### Core platforms

```text
Terra
Aqua
S-NPP
NOAA-20
NOAA-21
```

### Core spatial scale

```text
1-km grid
```

### Core temporal scale

```text
cell-day
```

### Core scientific features

```text
presence
count
FRP
confidence
platform
scan
track
day/night
observability
missingness
```

### Core methods

```text
ratio baseline
regression
quantile mapping
gradient boosting
uncertainty estimation
```

### Core evaluation

```text
MAE
RMSE
bias
correlation
distributional distance
uncertainty coverage
```

### Core product

```text
HFAI
+
historical baseline
+
anomaly
+
observability
+
uncertainty
+
sensor disagreement
```

---

# 52. Final Project Concept

## BengalFlare
### A Harmonized, Observation-Aware Burning Activity Calendar

### One-line pitch

> **BengalFlare transforms NASA's MODIS and VIIRS active-fire observations into a common uncertainty-aware historical activity record, explicitly accounting for sensor differences and observation gaps, then turns that record into a calendar showing when and where burning is normal, unusual, persistent, or potentially critical.**

### Scientific novelty

```text
cross-sensor harmonization
+
observation-aware missingness
+
uncertainty
+
validation
```

### Product novelty

```text
historical burning calendar
+
why-is-this-unusual explanation
+
sensor disagreement layer
+
observability indicator
```

### Bangladesh advantage

Bangladesh gives a compact national demonstration, while the same engine can later be expanded to South Asia.

---

# 53. Immediate Next Actions

The team should now stop adding more abstract concepts and perform the following real experiment:

```text
Bangladesh
+
2018–2023 overlap
+
MODIS Terra/Aqua
+
VIIRS S-NPP/NOAA-20
+
standard-quality data
        ↓
common 1-km grid
        ↓
cell-day table
        ↓
missing/outage mask
        ↓
MODIS vs VIIRS diagnostics
        ↓
ratio baseline
        ↓
regression baseline
        ↓
quantile mapping
        ↓
held-out validation
```

Only after that should you decide whether an ML harmonizer materially improves the result.

---

# 54. High-Value NASA Sources to Keep in the Repository

## Challenge
https://www.spaceappschallenge.org/2026/challenges/harmonization-of-modis-and-viirs-hot-spots/

## NASA.gov search used for discovery
https://www.nasa.gov/?search=Harmonization+of+MODIS+and+VIIRS+Hot+Spots

## FIRMS Active Fire
https://firms.modaps.eosdis.nasa.gov/active_fire/

## FIRMS MODIS description
https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_MODIS_Firehotspots.html

## FIRMS VIIRS description
https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html

## FIRMS API
https://firms.modaps.eosdis.nasa.gov/api/

## FIRMS Area API
https://firms.modaps.eosdis.nasa.gov/api/area/

## FIRMS Data Availability
https://firms.modaps.eosdis.nasa.gov/api/data_availability/

## FIRMS Web Services / WMS
https://firms.modaps.eosdis.nasa.gov/mapserver/wms-info/

## NASA Earthdata FIRMS resources
https://www.earthdata.nasa.gov/

## NASA Earth Observatory — A Clearer View of Fire
https://science.nasa.gov/earth/earth-observatory/a-clearer-view-of-fire-87111/

## NASA Earth Observatory — Northwestern India fire activity
https://science.nasa.gov/earth/earth-observatory/is-fire-activity-declining-in-northwestern-india-153826/

## NASA Science — Wildfires and Climate Change
https://science.nasa.gov/earth/explore/wildfires-and-climate-change/

## NASA Science — Wildfire observations from many sources
https://science.nasa.gov/earth/natural-disasters/wildfires/nasa-covers-wildfires-from-many-sources/

## NASA Science — Indonesian peatland fires, 2026
https://science.nasa.gov/missions/aqua/peatland-fires-darken-skies-in-indonesia/

## NASA LAADS VIIRS N20 archive
https://ladsweb.modaps.eosdis.nasa.gov/archive/allData/5200/VJ114IMG/

---

# 55. Final Research Principle

> **Do not make the sensors agree by force. Make their disagreement measurable, explainable, and statistically manageable.**

The target is not an artificial perfect record.

The target is a more useful and more scientifically defensible representation of satellite-observed burning activity, with its uncertainty and observational limitations still visible.

That is the strongest implementation path for the 2026 NASA Space Apps MODIS/VIIRS harmonization challenge.
