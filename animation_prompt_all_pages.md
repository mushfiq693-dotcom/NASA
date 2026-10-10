# FireChronicle — Motion & Animation Pass (all pages)

Scope: frontend only. Do not change pipeline, models, API contracts, or the layout contract from recovery_prompt_ui_first_slice.md (R3: `100dvh`, `min-width:0`, internal scroll, no horizontal overflow). Read master_prompt_firechronicle_v3.md Section 11 (UI rules, copy rules) and keep every rule there.

Problem to fix: the current UI is static. Pages render, but nothing moves, so the product feels like a plain dashboard. Add purposeful motion to every route.

## 0. Principle: motion must carry meaning
Every animation must map to something real in the data or the observation process. Use this vocabulary consistently across all pages:

| Motion | Means |
|---|---|
| Thin bright line sweeping across the map/swath | a satellite overpass at its real UTC time |
| Point appears with a white-yellow flash, then cools to deep red over its age | a fire detection (brightness cooling = time since detection) |
| Dashed, dimmed swath that never "ignites" | missing/outage pass (observability low) |
| Cell colour/size morphing between two states | harmonization changing a value (raw → harmonized) |
| Cyan ring/whisker expanding from a value | uncertainty interval |
| Numbers counting up, once | a computed value arriving; never loop |

Decoration-only motion is allowed ONLY in the background scene (starfield drift, faint orbital arcs). Banned: bouncing, spinning logos, infinite text loops, the same fade-up applied to every section, confetti, shimmer skeletons that last more than the real request time.

## 1. Step 0 — audit, then pick tools (report before coding)
1. Read `package.json`; list the animation/graphics libs already installed and the framework in use.
2. Use: **GSAP + ScrollTrigger** for timelines and scroll scenes (or Framer Motion if the repo is React and already uses it; do not mix more than two animation libs). Canvas 2D / WebGL (MapLibre custom layers or deck.gl-style instanced layers) for anything with > 200 moving items. CSS transitions only for hover/focus states.
3. Animate `transform` and `opacity` only on DOM; use `overflow: clip` on containers so off-screen starts never create horizontal scroll.
4. Create `app/src/motion/` with: `tokens.ts` (durations 120/240/480/900/1600 ms; easings `enter: cubic-bezier(0.22,1,0.36,1)`, `inOut: cubic-bezier(0.65,0,0.35,1)`), `useReducedMotion`, `scene.ts` (shared background), `countUp.ts`, `sweep.ts` (overpass sweep primitive reused on landing, atlas, day details, live).
5. Add a nav toggle: Motion **Full / Reduced / Off**, persisted; also honour `prefers-reduced-motion`. In Reduced: replace movement with ≤150 ms opacity changes and stepped time-lapse. In Off: no animation, final states only.

## 2. Global (every route)
- **Background scene** (behind panels, shared): starfield on a canvas with slow parallax tied to pointer; 5 faint orbital arcs for Terra, Aqua, S-NPP, NOAA-20, NOAA-21; tiny satellite markers moving along them at relative real speeds (~100 min orbits sped up by a fixed factor shown in a small "orbit time ×N" label). Pause when the tab is hidden; ≤ 6% CPU idle target.
- **Route transitions:** a swath-sweep wipe — a thin cyan scan line crosses left→right in 500–700 ms and the incoming page is revealed behind it via clip-path. Where the next route is map-based, move the globe camera instead of wiping.
- **Panel entrances:** panels slide 16 px from their own edge with 40 ms stagger; different panels use different origins (nav from top, dock from bottom, side panel from its side). No uniform fade-up.
- **Numbers:** tabular-nums; count up once on first appearance (700–900 ms), never again on re-render.
- **Loading states** are tied to real requests and name them: e.g. "Acquiring VJ114IMG · 2023-11-14 …" with a progress bar driven by actual bytes/requests, not a timer. If the request fails, show the specific error without animation.
- **Cross-highlighting:** hovering a date/point/cell highlights the same entity in every visible chart, map, and table within 80 ms.

## 3. Landing `/`
Scroll-driven story over the fixed globe; GSAP ScrollTrigger scrubbing the camera and overlays (pin each scene).
1. **Constellation:** globe slowly rotates; five satellites travel their ground tracks with trailing fading polylines and live swath footprints (MODIS ≈ 2330 km, VIIRS ≈ 3060 km). Labels follow each satellite and avoid overlap. Title text reveals line by line with a clip mask (not fade-up). Stat chips count up.
2. **One cell, two views:** camera dives to a real Bangladesh cell. A 1 km square draws itself (stroke animation), then the 375 m VIIRS pixels subdivide inside it (up to ~7 nominal pixels) and each detection in the fixture ignites in sequence ordered by acquisition time; a MODIS detection ignites once as a large single block. Caption counts update as each ignites.
3. **The step in the record:** raw detections-per-year line draws left→right from 2000; at the VIIRS entry year the line jumps (animate the jump with a brief highlight and annotation), then the harmonized line draws in and stays continuous. Hover scrubs a vertical cursor with both values.
4. **Not seen ≠ not burning:** a swath sweeps across the AOI on a normal date (detections ignite behind it), then the same sweep on a missing-data date runs dashed and dim with no ignitions; an annotation shows the missing_data record that explains it.
- Scroll progress indicator shows scene names. Provide keyboard navigation between scenes.

## 4. Atlas `/atlas`
- **Time-lapse playback:** play/pause/speed (0.5×–8×); each day, overpass sweeps run at actual local times across the AOI; detections ignite with the flash→cool behaviour; points older than 3 days fade to a faint ember dot (age encoded, configurable). Day/night terminator moves smoothly with the clock. Render points in WebGL; 100k+ points must hold ≥ 55 fps.
- **Layer switch:** crossfade 300 ms, plus a morph between MODIS and VIIRS layers (points reposition/resize to the other sensor's footprint scale rather than just fading).
- **Disagreement mode:** categories reveal in order — Both, MODIS only, VIIRS only, Unknown — each with a 120 ms stagger and a legend chip that pulses once when its category appears.
- **AOI change:** camera `flyTo` with easing and a brief outline draw of the new boundary.
- **Scrubber:** the thumb carries a live date tooltip; the AOI series chart above it draws a moving cursor; dragging scrubs the map instantly (no easing lag > 100 ms).
- **Pointer:** crosshair with live lat/lon and the cell id; hovering a cell shows a small ring that expands to the 1 km cell footprint.

## 5. Calendar `/calendar` and Date details `/day/:date`
Calendar:
- **Reveal:** cells appear as a sweep moving day by day across the year (like a pass), not all at once; colour fills in as the sweep reaches them (total ≤ 1.2 s).
- **Mode switch** (common_index ↔ modis_equivalent, or AOI level change): cells morph colour in a diagonal wave, 300–600 ms.
- **Hover:** row and column guides highlight; tooltip follows the pointer with percentile and ± interval; low-observability cells show a diagonal hatch that drifts slowly only while hovered.
- **Extreme days:** a single soft pulse every 4 s, max 6 pulsing at once (the 6 highest anomalies in view); no pulse for High or below.
- **Open day:** FLIP/shared-element transition — the clicked cell expands into the Date details header.

Date details:
- **Activity vs Observability:** two separate gauges, each animating from 0 to its value with different easings; if observability is Low the activity gauge gets a cyan hatched overlay that fades in after 300 ms.
- **Uncertainty:** the point estimate appears first, then the interval whiskers expand outward from it.
- **Pass timeline:** a 24 h axis with the real UTC pass times of all platforms; ticks draw in order of time; each pass pops its detection count; missing passes draw dashed. A "Replay passes" button replays the day on the mini map using the overpass-sweep primitive.
- **Why? panel:** lines appear in sequence (100 ms apart); each line's supporting evidence bar grows to its value; the sentence order is by contribution size.

## 6. Sensor Lab `/lab`
- **Scatter:** points enter binned by density (dense bins first), 1:1 line draws, regression/quantile curve draws after.
- **Baseline stepper B0→B5:** a control steps through baselines; the points interpolate from raw VIIRS x-values to the harmonized x-values (morph, 700 ms), the bias number and RMSE count between values, and the fit line transitions with them. This is the signature before/after moment.
- **Sensitivity tabs (1/5/10 km, temporal windows):** bars/lines morph between tabs; do not rebuild the chart.
- **Agreement map:** cells fade in by category (Both / MODIS only / VIIRS only / Unknown) with the same ordering as Atlas.
- **Bias bars** grow from the zero line; negative values grow in the opposite direction.

## 7. Validation `/validation`
- **Before/after metrics:** for each metric, a bar for raw and a bar for harmonized; the raw bar draws first, then the harmonized bar draws and the improvement delta counts up. A target marker (from v3 7.3) is drawn as a thin line; if the real value misses the target, the bar stops short and the delta is shown as-is — no celebratory effect, no colour change implying success unless it meets the target.
- **Split switcher (temporal / spatial / platform / seasonal):** table rows swap with a vertical slide of 160 ms stagger and bars re-animate from the previous values, not from zero.
- **Coverage ring:** the 95% interval coverage draws as a ring with the nominal 95% marked; the empirical coverage arc animates to its value.
- Only real computed values animate; "not computed" states stay static with the specific reason.

## 8. Methodology `/methodology`
- **Pipeline diagram:** the 5 stages are nodes; small particles flow along edges at a rate proportional to the real row counts from `reports/qa_summary.json` when available (else a fixed slow rate and label "rate not data-bound"). Scroll pins the diagram and highlights each stage with its description.
- **Observability score:** factors (product availability × platform coverage × obscuration × geometry) animate in one by one and multiply into the result bar; changing a slider re-animates the product.
- **Anchors:** navigating to `#observability` scrolls smoothly and highlights the target block with a one-time outline draw.

## 9. Live `/live`
- **NRT arrivals:** when new NRT detections arrive from the API, each lands with a ripple at its location; list rows insert from the top with a height transition.
- **Heartbeat:** "last fetch" shows real elapsed seconds counting up; a thin progress line fills until the next poll.
- **S-NPP countdown:** real days/hours/minutes to 2026-11-01 00:00 UTC; after that date, switch to a static "S-NPP delivery ended" state.
- If NRT is unreachable, show the specific error and stop the heartbeat; do not animate fake activity.

## 10. Performance and safety budget
- ≥ 55 fps median at 1440×900 on the dev machine during Atlas playback and Landing scroll (≥ 45 fps accepted under headless Playwright; report both).
- Pause all RAF/WebGL loops when the tab is hidden or the route is inactive; dispose scene resources on route exit.
- Cap devicePixelRatio at 2. No more than 2 full-screen canvases alive at once.
- No animation may cause horizontal overflow or layout shift (CLS ≈ 0).
- Touch (390×844): disable pointer-parallax; keep scroll scenes, shorten sweeps to ≤ 400 ms.

## 11. Verification (mandatory; "done" is not accepted without it)
Add `npm run motion:check` (Playwright) that, for every route at 1440×900 and 390×844, FAILS if:
1. **Nothing moves:** two screenshots of the main stage, taken 0.5 s and 2.5 s after load, differ by less than a set pixel-diff threshold (except routes explicitly allowed to be static after intro: Methodology after its scenes finish).
2. **Interaction doesn't animate:** Atlas Play → frames 1 s apart must differ; Calendar cell hover must change the tooltip/highlight; Lab stepper B0→B1 must change point positions; Validation split switch must change bars.
3. **Route transition missing:** a frame captured ~250 ms after navigation must differ from both the old and the final page.
4. **Reduced motion ignored:** with `reducedMotion: 'reduce'` emulated, any running animation longer than 200 ms (`document.getAnimations()`) or canvas frame-diff motion after 1 s fails.
5. **FPS below budget:** sample `requestAnimationFrame` deltas for 5 s during Atlas playback and Landing scroll; median below threshold fails.
6. **Overflow or console errors** appear (reuse `ui:check` rules, plus banned-phrase lint).

Also record a 6 s video per route into `reports/motion/<route>-<viewport>.webm`, extract 6 evenly spaced frames into a contact sheet `reports/motion/<route>-<viewport>-sheet.png`, and OPEN each contact sheet with the image viewer. Fix whatever looks static, broken, or janky before moving on.

## 12. Order of work (finish and verify each before the next)
1. Step 0 audit + motion tokens + toggle + shared background + route transitions
2. Landing
3. Atlas
4. Calendar + Date details
5. Sensor Lab
6. Validation
7. Methodology
8. Live
9. Full `motion:check` + `ui:check` run, then final report

## 13. Final report format
- Table: route × viewport × (motion:check pass/fail, median fps).
- Contact-sheet images for `/`, `/atlas`, `/calendar`, `/lab`, `/validation`.
- List of animations that map to the vocabulary in Section 0, per route (one line each).
- Anything not implemented and the exact reason.
