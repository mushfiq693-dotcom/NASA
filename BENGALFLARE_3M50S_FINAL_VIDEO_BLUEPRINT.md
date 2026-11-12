# 🎬 BengalFlare — NASA Official Submission Video Master Blueprint (3m 50s / 230s)
> **Official Submission Document & Video Production Guide**  
> **Challenge:** MODIS–VIIRS Harmonization · NASA Space Apps Challenge  
> **Team:** Zen’in Clan | **Institution:** Gopalganj Science & Technology University (GSTU), Bangladesh 🇧🇩  
> **Tagline:** *“Connecting Satellite Data. Revealing Earth's Story.”*  
> **Live Web Application:** [https://bengalflare.vercel.app](https://bengalflare.vercel.app)  
> **Open Source Codebase:** [https://github.com/mushfiq693-dotcom/NASA](https://github.com/mushfiq693-dotcom/NASA)  
> **Target Video Runtime:** Exactly 3 Minutes 50 Seconds (230 Seconds)

---

## 📌 How to Use This Master Document with ChatGPT & Gemini Argon

1. **Step 1 (Copy to ChatGPT):** Copy the entire contents of this file or feed it as a prompt to **ChatGPT (GPT-4o)** using the **Ready-to-Paste Master Prompt in Part 4**.
2. **Step 2 (Voiceover & Script Polish):** ChatGPT will generate the exact word-for-word voiceover script timed to 230 seconds, including tone cues, breathing pauses, and on-screen text overlays.
3. **Step 3 (AI Video Generation with Gemini Argon / Runway / Sora):** Use the pre-engineered prompts in **Part 3** to generate cinematic photorealistic B-roll (satellites in orbit, thermal infrared scanning, atmospheric smoke plumes).
4. **Step 4 (Screen Recordings from Webapp):** Follow the checklist in **Part 3** to capture high-definition 60 FPS screen recordings and screenshots of your live webapp (`bengalflare.vercel.app`).
5. **Step 5 (Assemble & Edit in CapCut / Premiere):** Follow the **Part 2 Second-by-Second Storyboard** to assemble your screen recordings, AI-generated clips, and voiceover with impactful audio design.

---

# PART 1: COMPREHENSIVE PROJECT DOSSIER (CHATGPT CONTEXT)

### 1.1 Team Profile & Metadata
- **Team Name:** Zen’in Clan
- **Institution:** Gopalganj Science & Technology University (GSTU), Bangladesh
- **Team Identity:** A student-led research and engineering team combining Earth observation science, machine learning, and modern web systems to tackle real-world climate dilemmas.
- **Roster & Roles:**
  1. **Kazi Mushfiqur Rahman** — Team Lead + Backend & ML Engineer
  2. **Farhan Zaman Aurko** — Team Support + Frontend & MapLibre GPU Engineer
  3. **Nasir A. Efty** — Product Manager & Space Apps Challenge Alignment
  4. **Shakib Al Hasan** — Earth Observation & Sensor Physics Researcher
  5. **Anika Islam** — Lead Presenter & Voiceover Narrator
  6. **Sadhin Roy** — Video Editor & Motion Graphics Designer

---

### 1.2 The Core Problem: The 2012 Sensor Paradox & Missing Data Trap
NASA’s Earth observation program has monitored the planet’s thermal activity for over two decades across five polar-orbiting satellites:
1. **MODIS Family:** *Terra* (operational 2000–present) and *Aqua* (operational 2002–present) with a coarse **1,000-meter nadir footprint**.
2. **VIIRS Family:** *Suomi-NPP* (2012–present), *NOAA-20* (2018–present), and *NOAA-21* (2022–present) with high-resolution **375-meter I-band detectors**.

#### The Catastrophic Discontinuity
- In **2012**, when VIIRS became operational, recorded fire hotspots suddenly exploded by **nearly 400% (+380%)**.
- **The Question:** Did the Earth burn four times more? **No.**
- **The Cause:** VIIRS's 375m pixel resolution can detect tiny agricultural stubble burns, slash-and-burn clearing, and low-temperature understory fires that MODIS's 1,000m pixels average out as background noise. Naive climate analysis creates a false climate cliff, invalidating multi-decadal trend models.

#### The Second Dilemma: "Not Seen ≠ Not Burning"
- South Asia and the Bengal Basin experience severe seasonal monsoon cloud obscuration and satellite swath gaps.
- Standard fire archives record unobserved cells as "zero fires" (false negatives), blinding civil protection authorities during hazardous periods.

#### The Third Dilemma: Impending Suomi-NPP Retirement
- *Suomi-NPP* is scheduled for decommissioning in **November 2026**. Without automated calibration handovers, climate archives will suffer another discontinuity when transitioning solely to *NOAA-20* and *NOAA-21*.

---

### 1.3 BengalFlare’s Scientific & Engineering Solution
**BengalFlare** is a sensor-agnostic, uncertainty-aware Earth observation platform engineered by Team Zen’in Clan.

1. **Two-Stage Quantile Regression Forest (QRF - Champion Model B5):**
   - Benchmarked across 6 mathematical models (B0: Raw baseline, B1: Global scaling, B2: Land-cover ratio, B3: Log-linear, B4: Quantile mapping, B5: Two-Stage QRF).
   - **Eliminates 72% of the 2012 sensor step-change discontinuity** (gap reduced from +148% baseline down to -0.8%, $R^2 = 0.94$).
   - Computes full **5th to 95th percentile Bayesian credible bounds**, preserving genuine ecological anomalies while removing sensor-induced artifacts.
   - Achieves **96.4% recall** on synthetic data gap recovery.

2. **Observability Index Engine:**
   - Evaluates daily cloud fraction and orbital pass geometry.
   - Visually indicates unobserved days with diagonal hatchings on the 24-year calendar, guaranteeing missing data is never mistaken for unburned land.

3. **Physics-Coupled Early Warning & Huygens Threat Cone:**
   - Couples satellite thermal observations (Fire Radiative Power - FRP) with **real-time Open-Meteo atmospheric forecasts** (temperature, relative humidity, wind speed & direction).
   - Computes the **Fosberg Fire Danger Index (FDI)**.
   - Projects dynamic **Huygens forward spread ellipses (Threat Cones)** downwind of active fires.
   - Intersects the threat cone with geospatial population settlements, calculating **estimated time to impact (ETA in hours)** and affected population headcounts.

4. **Multi-Channel Alert Dissemination:**
   - Automated real-time polling of **NASA FIRMS NRT API** (180s downlink availability).
   - Instant broadcast to an official **Telegram Early Warning Bot & Channel** (`@pika09_bot`).
   - Native **Web Push Notification Toggle** built into the web application navbar for instantaneous browser alerts.

---

### 1.4 Technical Architecture & Stack
- **Frontend:** React 19, TypeScript, Vite, MapLibre GL (GPU-accelerated WebGL spatial rendering at 60 FPS), Chart.js, GSAP.
- **Backend:** FastAPI, Python 3.10+, DuckDB analytical columnar engine, Uber H3 hexagonal spatial indexing (Res-7/Res-8), NumPy, SciPy, scikit-learn.
- **Design System:** "Cosmic Dusk & Solar Flare" Aerospace Glassmorphism (`rgba(10, 16, 28, 0.62)`, `backdrop-filter: blur(20px)`, Solar Flare `#FF5E00`, Corona Gold `#FFB800`, Emerald Green `#10B981`).
- **Quality Assurance:** 100% test pass rate across 32 Pytest backend tests and Playwright desktop/mobile browser test suites.

---

# PART 2: SECOND-BY-SECOND MASTER STORYBOARD (230 SECONDS / 3m 50s)

| Scene | Timestamp | Duration | Page / Focus | Core Storyline & Visual Arc |
|---|---|---|---|---|
| **Scene 1** | `0:00 – 0:30` | 30s | Deep Space & Cinematic Hook | The 2012 Sensor Paradox: Did our planet burn 400% more? |
| **Scene 2** | `0:30 – 0:55` | 25s | Brand Reveal & Team Zen’in Clan | BengalFlare introduction & Team Zen'in Clan (GSTU) profile |
| **Scene 3** | `0:55 – 1:30` | 35s | Atlas Explorer (`/atlas`) | MapLibre GPU Atlas, 24-year scrubber, Sensor Disagreement |
| **Scene 4** | `1:30 – 2:05` | 35s | Calendar (`/calendar`) & Day Detail (`/day/:date`) | Observability Index (cloud mask) & March 21, 2022 orbital sweep |
| **Scene 5** | `2:05 – 2:40` | 35s | Sensor Lab (`/lab`) & Live Ingestion (`/live`) | Machine learning B0–B5 benchmark & NASA FIRMS NRT stream |
| **Scene 6** | `2:40 – 3:25` | 45s | Early Warning System (`/early-warning`) | Huygens Threat Cone, Downwind ETA, Telegram Bot & Web Push |
| **Scene 7** | `3:25 – 3:50` | 25s | Vision, Open Science & Call to Action | Global scalability, MIT Open Source, and Space Apps sign-off |

---

### SCENE 1: THE PLANETARY DILEMMA & THE 2012 SENSOR PARADOX
- **Timestamp:** `0:00 – 0:30` (30 Seconds)
- **Visuals:**
  - `[0:00 - 0:10]` **AI Video / NASA Clip:** Cinematic camera glide over Earth from orbit, dipping towards South Asia and the Bengal delta shrouded in cosmic twilight.
  - `[0:10 - 0:20]` **Data Graphic:** 24-year thermal timeline graph. Flat stable line from 2000 to 2011, then a violent upward spike in 2012 (+380% explosion).
  - `[0:20 - 0:30]` **Split-Screen:** Coarse 1,000m MODIS pixel grid beside high-resolution 375m VIIRS grid. Pulsing red text: *"WAS OUR PLANET BURNING 4 TIMES MORE?"*
- **Audio / SFX:** Deep atmospheric synth drone, ominous sub-bass drop at 0:10, subtle satellite radio telemetry beeps.
- **On-Screen Text (Lower Thirds):**
  - `THE 2012 PARADOX // 24 YEARS OF EARTH OBSERVATION AT RISK`
  - `MODIS (1,000m) VS VIIRS (375m) // STATISTICAL ILLUSION`
- **Voiceover Narration:**
  > *"For over two decades, NASA satellites have monitored our planet’s thermal heartbeat from orbit. Twenty-four years of active-fire telemetry across five polar-orbiting spacecraft. [PAUSE]*  
  > *Yet in 2012, recorded fire hotspots suddenly exploded by nearly four hundred percent. Was our planet burning four times more? No. The satellites changed — but our climate records didn't. When VIIRS introduced 375-meter resolution, it created a massive statistical cliff that corrupts multi-decadal climate analysis."*

---

### SCENE 2: SOLUTION REVEAL & TEAM ZEN’IN CLAN
- **Timestamp:** `0:30 – 0:55` (25 Seconds)
- **Visuals:**
  - `[0:30 - 0:40]` **Brandmark Ignition:** Crimson hazard resolves into radiant Corona Gold (`#FFB800`) and Solar Flare (`#FF5E00`): **BengalFlare** brandmark with orbital loop and glowing thermal flame.
  - `[0:40 - 0:50]` **Team Roster HUD Card:** Frosted aerospace glass card presenting:
    - *Team Zen’in Clan · Gopalganj Science & Technology University (GSTU), Bangladesh 🇧🇩*
    - High-tech 6-member roster grid with names and roles.
    - Tagline: *“Connecting Satellite Data. Revealing Earth's Story.”*
  - `[0:50 - 0:55]` Cursor clicks `[ Launch Atlas Explorer ]` on the landing page HUD.
- **Audio / SFX:** Inspiring, rhythmic technological synthesizer melody swells in; crisp digital chime on roster reveal.
- **On-Screen Text:**
  - `BENGALFLARE // SENSOR-AGNOSTIC THERMAL HARMONIZATION ENGINE`
  - `TEAM ZEN’IN CLAN // GOPALGANJ SCIENCE & TECHNOLOGY UNIVERSITY, BANGLADESH`
- **Voiceover Narration:**
  > *"To solve this planetary challenge, we are Team Zen’in Clan from Gopalganj Science and Technology University, Bangladesh. [PAUSE]*  
  > *We engineered BengalFlare — a full-stack, uncertainty-aware Earth observation platform that harmonizes twenty-four years of fragmented MODIS and VIIRS telemetry into one continuous, scientifically validated burning chronicle."*

---

### SCENE 3: SPATIAL TELEMETRY IN ACTION (ATLAS EXPLORER)
- **Timestamp:** `0:55 – 1:30` (35 Seconds)
- **Visuals:**
  - `[0:55 - 1:10]` **Screen Recording (`/atlas`):** Smooth transition into MapLibre GL 60 FPS GPU-accelerated Atlas. Basemap switches from satellite true color to Carto Dark Matter, highlighting thousands of fire detections across Bangladesh and the Sundarbans.
  - `[1:10 - 1:20]` **Feature Demo:** Toggle **Sensor Disagreement Mode**:
    - 🟡 **Golden Amber:** Both sensors agree (Consensus).
    - 🟠 **Solar Orange:** MODIS only.
    - 🔴 **Supernova Crimson:** VIIRS only (small agricultural fires invisible to MODIS).
    - 🔵 **Ion Cyan:** Cloud obscuration.
  - `[1:20 - 1:30]` Dragging the **24-Year Temporal Scrubber** smoothly across fire seasons, with instantaneous sub-kilometer coordinates and Fire Radiative Power (FRP) metrics updating live.
- **Audio / SFX:** Fast rhythmic electronic pulse; subtle glass clicks and telemetry whooshes on map layer toggles.
- **On-Screen Text:**
  - `GPU-ACCELERATED ATLAS // MAPLIBRE GL + UBER H3 SPATIAL INDEXING`
  - `SENSOR DISAGREEMENT MODE // SEPARATING CONSENSUS FROM RESOLUTION BIAS`
- **Voiceover Narration:**
  > *"Inside our GPU-accelerated Atlas Explorer, millions of satellite data points render seamlessly at sixty frames per second using Uber H3 hexagonal spatial indexing. [PAUSE]*  
  > *Our Sensor Disagreement Mode immediately exposes the resolution bias: Golden Amber denotes consensus, while Crimson highlights the smaller agricultural fires captured exclusively by VIIRS. With our interactive temporal scrubber, researchers can effortlessly glide across twenty-four years of fire history."*

---

### SCENE 4: 24-YEAR ACTIVITY CALENDAR & FORENSIC DAY DEEP-DIVE
- **Timestamp:** `1:30 – 2:05` (35 Seconds)
- **Visuals:**
  - `[1:30 - 1:45]` **Screen Recording (`/calendar`):** The 24-Year Burning Activity Calendar heatmap matrix.
    - Cursor points to diagonal hatch-marked cells — **The Observability Index**.
    - Toggle between *Raw MODIS*, *Raw VIIRS*, and *Harmonized Burning Activity Index (BAI)*, visually showing the 2012 jump smoothing out.
  - `[1:45 - 2:05]` **Screen Recording (`/day/2022-03-21`):** Deep-dive into March 21, 2022 (a massive burning event).
    - Replay Overpass Sweep: animated radar beam sweeps across the delta, showing satellite overpasses (Terra 10:30 AM, Aqua 1:30 PM, Suomi-NPP 2:15 PM).
    - Bayesian Credible Interval whiskers (5th–95th percentile).
- **Audio / SFX:** Digital scanner sounds, subtle clock ticking, gentle radar ping.
- **On-Screen Text:**
  - `OBSERVABILITY INDEX // SOLVING THE 'NOT SEEN ≠ NOT BURNING' TRAP`
  - `ORBITAL SWEEP FORENSICS // 5 DAILY PASSES & BAYESIAN CREDIBLE BOUNDS`
- **Voiceover Narration:**
  > *"Historical analysis often falls into another trap: monsoon cloud cover blinds optical sensors, causing naive models to report zero fires. BengalFlare’s Observability Index explicitly accounts for cloud obscuration and swath gaps with diagonal confidence markers — because not seen does not mean not burning. [PAUSE]*  
  > *In our Day Detail forensic view, we reconstruct orbital passes across diurnal burning cycles, providing full Bayesian credible intervals to guarantee scientific honesty."*

---

### SCENE 5: SENSOR LAB & REAL-TIME CONSTELLATION INGESTION
- **Timestamp:** `2:05 – 2:40` (35 Seconds)
- **Visuals:**
  - `[2:05 - 2:20]` **Screen Recording (`/lab` & `/validation`):**
    - Interactive model stepper cycling through benchmarks: B0 (Raw) ➔ B1 ➔ B2 ➔ B3 ➔ B4 ➔ B5 (**Two-Stage Quantile Regression Forest**).
    - Dynamic Chart.js scatter plots morphing into alignment.
    - Highlight: **Discontinuity gap reduced from +148% to -0.8% ($R^2 = 0.94$, 96.4% synthetic recall)**.
  - `[2:20 - 2:40]` **Screen Recording (`/live`):**
    - Live NRT Constellation status. Real-time telemetry log ingested within 180 seconds via NASA FIRMS API.
    - Circular radar locator tracking satellites.
    - **Suomi-NPP Retirement Countdown Clock (November 2026)** demonstrating automated handover calibration to NOAA-20 and NOAA-21.
- **Audio / SFX:** Upbeat, energetic data processing sound effects; radar sweep beeps.
- **On-Screen Text:**
  - `TWO-STAGE QUANTILE REGRESSION FOREST // 72% DISCONTINUITY GAP REDUCTION`
  - `NASA FIRMS NRT STREAM // SUOMI-NPP 2026 RETIREMENT HANDOVER`
- **Voiceover Narration:**
  > *"In our Sensor Lab, we benchmarked six rigorous mathematical models. Our champion — a Two-Stage Quantile Regression Forest — eliminates seventy-two percent of the 2012 step-change discontinuity while preserving authentic ecological extremes. [PAUSE]*  
  > *And we built for the future: our Live Mission Control directly ingests NASA FIRMS telemetry within 180 seconds of downlink, while an automated handover pipeline prepares for Suomi-NPP’s retirement in late 2026, ensuring seamless data continuity."*

---

### SCENE 6: EARLY WARNING IN ACTION (THREAT CONES & RESCUE ALERTS)
- **Timestamp:** `2:40 – 3:25` (45 Seconds)
- **Visuals:**
  - `[2:40 - 2:55]` **Screen Recording (`/early-warning`):**
    - Satellite map displays an active wildfire hotspot with an expanding orange **Huygens Threat Cone (spread ellipse)** stretching downwind.
    - Live atmospheric weather panel showing temperature, relative humidity, wind speed (e.g. 24 km/h), and Fosberg Fire Danger Index (FDI).
  - `[2:55 - 3:10]` **Community Exposure Table:**
    - Highlight rows: Downwind settlements, vulnerable population counts (e.g. 45,000 residents), and calculated arrival ETA (e.g. 1.8 hours).
  - `[3:10 - 3:25]` **Multi-Channel Alert Integration:**
    - Mobile phone screen recording / mockup showing real-time Telegram Alert notification popping up from `@pika09_bot`: *"🚨 CRITICAL WILDFIRE SPREAD ALERT // Sylhet Division · Winds 24 km/h"*.
    - Return to webapp: clicking the **Navbar Alert ON/OFF Toggle Switch** with emerald glowing status.
- **Audio / SFX:** Urgent, heartbeat pulse transition; gentle emergency chime; satisfying smartphone notification ping.
- **On-Screen Text:**
  - `EARLY WARNING SYSTEM // HUYGENS-ELLIPSE FORWARD SPREAD MODELING`
  - `DOWNWIND COMMUNITY EXPOSURE // POPULATION IMPACT & ETA IN HOURS`
  - `INSTANT DISSEMINATION // TELEGRAM BOT & BROWSER WEB PUSH ALERTS`
- **Voiceover Narration:**
  > *"Harmonized data must do more than inform history — it must save lives today. [PAUSE]*  
  > *BengalFlare’s Early Warning System couples real-time NASA thermal telemetry with Open-Meteo atmospheric wind vectors. Using physics-based Huygens forward spread modeling, it calculates dynamic threat cones, projecting exact arrival times and population exposure for downwind settlements. [PAUSE]*  
  > *Critical warnings are instantly dispatched through our automated Telegram emergency channel and native Web Push alerts, empowering forestry officials and vulnerable communities to act before the flames arrive."*

---

### SCENE 7: GLOBAL SCALABILITY, OPEN SCIENCE & SPACE APPS VISION
- **Timestamp:** `3:25 – 3:50` (25 Seconds)
- **Visuals:**
  - `[3:25 - 3:35]` **Global Zoom-Out:** Camera pulls out from Bangladesh to a revolving 3D Earth globe, showing the BengalFlare harmonization architecture applied across the Amazon, Africa, and Southeast Asia.
  - `[3:35 - 3:45]` **Open Science Badges:** GitHub repository badge (`MIT License`), Vercel live deployment badge, and automated test suite pass verification (`32 Pytest / Playwright 100%`).
  - `[3:45 - 3:50]` **Closing Slate:** Team Zen’in Clan closing visual card:
    - *BengalFlare · Connecting Satellite Data. Revealing Earth's Story.*
    - *Gopalganj Science & Technology University (GSTU), Bangladesh 🇧🇩*
    - *NASA Space Apps Challenge 2024 / 2026*
- **Audio / SFX:** Grand cinematic musical crescendo with warm, inspiring finish; gentle broadcast fade out.
- **On-Screen Text:**
  - `GLOBAL SCALABILITY // SENSOR-AGNOSTIC HARMONIZATION FOR PLANETARY RESILIENCE`
  - `100% OPEN SOURCE // REPRODUCIBLE SCIENCE FOR ALL NATIONS`
  - `“CONNECTING SATELLITE DATA. REVEALING EARTH'S STORY.”`
- **Voiceover Narration:**
  > *"Engineered in the Bengal delta, BengalFlare’s open-source architecture is built to scale across fire-prone ecosystems worldwide. [PAUSE]*  
  > *By bridging the past and present of NASA’s Earth-observing satellites, we unlock the truth behind our changing planet.  
  > We are Team Zen’in Clan. Connecting satellite data. Revealing Earth's story."*

---

# PART 3: VIDEO ASSET RECORDING & AI PROMPT CHECKLIST

### 3.1 Web Application Screen Recording Checklist (`bengalflare.vercel.app`)
Record in **1080p or 4K at 60 FPS** (Chrome / Safari full-screen):
1. **Shot 01 — Landing Page Globe (`/`):**
   - Slow pan over the 3D rotating globe showing satellite orbital rings.
   - Hover over the frosted glass HUD card showing key stats (8,420 MODIS, 24,890 VIIRS).
   - Click `[ Launch Atlas Explorer ]` with smooth route transition.
2. **Shot 02 — Atlas Explorer (`/atlas`):**
   - Zoom in on active hotspots in Bangladesh / Sundarbans.
   - Switch basemap between Satellite and Carto Dark Matter.
   - Toggle **Sensor Disagreement Mode** to show Amber (consensus) vs Crimson (VIIRS only).
   - Scrub the 24-year timeline slider smoothly.
3. **Shot 03 — Burning Activity Calendar (`/calendar`):**
   - Scroll through 2000–2024 heatmap matrix.
   - Hover on a cell showing diagonal lines (Observability Index / cloud gap).
   - Toggle Raw MODIS vs Harmonized BAI buttons.
4. **Shot 04 — Day Detail Forensic View (`/day/2022-03-21`):**
   - Click the "Replay Sweep" button to trigger the circular radar beam sweeping the delta.
   - Show the 24-hour pass timeline chips (Terra, Aqua, S-NPP).
5. **Shot 05 — Sensor Lab (`/lab` & `/validation`):**
   - Step through models B0 to B5, showing scatter plots morphing into alignment.
   - Scroll to the Leave-One-Year-Out validation matrix showing 96.4% recall.
6. **Shot 06 — Live NRT Telemetry (`/live`):**
   - Show the live heartbeat counter (e.g. "Next poll in 25s").
   - Capture the glowing radar blips and the Suomi-NPP retirement countdown clock.
7. **Shot 07 — Early Warning System (`/early-warning`):**
   - Show the orange threat cone expanding over the terrain.
   - Show the Downwind Communities table with populations and ETAs.
   - Click the **Navbar Alert ON/OFF Toggle** (showing switch sliding to ON with emerald glow).
8. **Shot 08 — Global Footer:**
   - Scroll to the bottom showing the sleek persistent footer with Sensor Lab and NASA credits.

---

### 3.2 External Stock Footage & NASA B-Roll (Free / Public Domain)
Search on **YouTube** or **NASA Scientific Visualization Studio (SVS)**:
- `NASA SVS Terra and Aqua orbit animation 4K`
- `Suomi NPP satellite Earth observation NASA animation`
- `Agricultural stubble burning drone footage South Asia`
- `NASA FIRMS fire telemetry global visualization`
- `Wildfire smoke plume time-lapse aerial`

---

### 3.3 Gemini Argon / AI Video Generation Prompts (Ready-to-Use)
Paste these prompts into **Gemini Argon**, **Runway Gen-3**, **Luma Dream Machine**, or **Sora**:

#### Prompt 1: Satellite Orbiting Earth at Sunset (Scene 1 Opening)
```
Cinematic photorealistic 8K drone shot from low Earth orbit looking down at South Asia, the Bengal delta, and the Bay of Bengal during golden hour cosmic dusk. A modern NASA Earth-observing satellite with gold thermal foil and solar panels glides smoothly into frame, beaming a subtle cyan laser telemetry scan down to the curved horizon of Earth. Atmospheric glow, volumetric clouds, photorealistic NASA documentary style, 60fps, IMAX cinematography.
```

#### Prompt 2: Thermal Infrared Sensor Scanning (Scene 1 Discontinuity)
```
Close-up cinematic macro shot of a state-of-the-art satellite multi-spectral infrared optical sensor lens rotating in zero gravity space. The sensor pupil reflects glowing thermal heat signatures of Earth below, illuminating in vibrant fiery orange, crimson, and neon cyan data vectors. Highly detailed mechanical aerospace components, shallow depth of field, NASA Goddard engineering aesthetic, ultra-sharp 4K.
```

#### Prompt 3: Atmospheric Agricultural Fire & Downwind Smoke (Scene 6 Threat Cone)
```
Cinematic high-angle drone shot over rural agricultural landscape and river basin during dry season twilight. A controlled crop stubble burn creates a line of orange fire and a thick plume of gray-white smoke drifting downwind across the fields toward a distant village settlement. Atmospheric haze, warm embers glowing, realistic fluid smoke simulation, National Geographic documentary style.
```

#### Prompt 4: Holographic Aerospace Mission Control (Scene 5 Live NRT)
```
Cinematic medium shot inside an advanced dark aerospace emergency management control room. A large curved holographic glass display shows a 3D digital twin of Bangladesh with glowing amber satellite orbital tracks and pulsating red wildfire warning coordinates. Subtle reflections on glass, soft orange and cyan ambient LED lighting, hyper-realistic, Ridley Scott futuristic realism.
```

---

# PART 4: MASTER CHATGPT PROMPT (COPY & PASTE READY)

Copy and paste everything in the code box below directly into **ChatGPT**:

```markdown
You are an award-winning NASA documentary director, elite scientific communicator, and aerospace video producer.

I need you to generate a comprehensive, broadcast-ready production package for our official 3-minute 50-second (exactly 230 seconds) submission video for the NASA Space Apps Challenge project: "BengalFlare".

Here is the complete project dossier and storyboard blueprint:
- Project Name: BengalFlare (NASA Thermal Telemetry & Active-Fire Harmonization Engine)
- Live Web Application: https://bengalflare.vercel.app
- Open Source Repository: https://github.com/mushfiq693-dotcom/NASA
- Challenge: MODIS–VIIRS Harmonization (Official NASA Space Apps Challenge)
- Team Name: Zen’in Clan
- University / Institution: Gopalganj Science & Technology University (GSTU), Bangladesh 🇧🇩
- Team Tagline: “Connecting Satellite Data. Revealing Earth's Story.”
- Team Roster:
  1. Kazi Mushfiqur Rahman (Team Lead + Backend/ML Engineer)
  2. Farhan Zaman Aurko (Team Support + Frontend/MapLibre Engineer)
  3. Nasir A. Efty (Product Manager & Challenge Alignment)
  4. Shakib Al Hasan (Researcher & Sensor Physics)
  5. Anika Islam (Lead Presenter & Voiceover)
  6. Sadhin Roy (Video Editor & Motion Designer)

Core Scientific & Engineering Innovations:
1. Resolves the 2012 Sensor Discontinuity Paradox: In 2012, VIIRS (375m) caused recorded fires to jump +380% compared to MODIS (1,000m). Naive models think wildfires quadrupled; BengalFlare's Two-Stage Quantile Regression Forest (QRF) resolves 72% of the jump (-0.8% gap, R²=0.94) with 5th-95th percentile Bayesian credible bounds.
2. Observability Index: Solves "Not Seen ≠ Not Burning". Accounts for monsoon clouds and orbital revisit gaps with confidence markers.
3. Physics-Coupled Early Warning: Couples NASA FIRMS telemetry with Open-Meteo wind forecasts to project dynamic Huygens forward spread ellipses (Threat Cones), calculating downwind community arrival ETA and population impact.
4. Real-Time Dissemination: Direct NASA FIRMS NRT stream (180s downlink), automated Telegram alert bot (@pika09_bot), and native web push notifications.
5. Suomi-NPP Retirement: Automatic calibration handover pipeline for the upcoming late 2026 decommissioning to NOAA-20/21.

Exact 230-Second Storyboard Structure:
- Scene 1 (0:00 - 0:30 | 30s): The Planetary Dilemma & The 2012 Sensor Paradox (+380% jump).
- Scene 2 (0:30 - 0:55 | 25s): Solution Reveal & Team Zen'in Clan introduction.
- Scene 3 (0:55 - 1:30 | 35s): Atlas Explorer (/atlas) MapLibre GPU engine & Sensor Disagreement mode.
- Scene 4 (1:30 - 2:05 | 35s): 24-Year Activity Calendar (/calendar) & Day Detail (/day/2022-03-21) orbital sweep.
- Scene 5 (2:05 - 2:40 | 35s): Sensor Lab (/lab) ML benchmark & Live NRT Mission Control (/live).
- Scene 6 (2:40 - 3:25 | 45s): Early Warning System (/early-warning) Huygens Threat Cone, Telegram bot, & Web Push.
- Scene 7 (3:25 - 3:50 | 25s): Global Scalability, Open Science, and Space Apps sign-off.

Based on this, generate:
1. EXACT WORD-FOR-WORD SPOKEN VOICEOVER SCRIPT:
   - Precisely timed for 230 seconds at a natural broadcast documentary speed of ~130 WPM (approx 320-350 total words).
   - Include emotional/cadence indicators: [PAUSE], [SUB-BASS DROP], [CONFIDENT], [URGENT].
   - Provide the complete spoken script without placeholders.
2. SCREENPLAY & VISUAL ACTION INSTRUCTIONS:
   - For every scene, specify exactly what screen recording actions to perform on https://bengalflare.vercel.app (what button to click, what slider to move, what camera zoom to use).
   - Exact on-screen titles and lower-thirds text for each scene.
3. GEMINI ARGON / AI VIDEO GENERATION PROMPTS:
   - Hyper-detailed photorealistic prompts for generating cinematic B-roll filler clips.
4. AUDIO DESIGN & MUSIC CUES:
   - Background score pacing, sound effects (SFX) triggers, and transition points.
```

---

*BengalFlare · Team Zen’in Clan · Gopalganj Science & Technology University (GSTU), Bangladesh*  
*NASA Space Apps Challenge 2024 / 2026 · “Connecting Satellite Data. Revealing Earth's Story.”*

