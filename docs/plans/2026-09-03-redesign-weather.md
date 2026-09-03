# Homepage Refinement + Live-Weather Background — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refine the homepage/gallery visuals and make the Three.js Earth background react to live HKUST weather, with every change reversible via branch `redesign-weather`.

**Architecture:** A framework-free static site. Pure weather logic lives in `weather-core.js` (browser global + CommonJS export so Node can unit-test it). `weather.js` fetches Open-Meteo, writes `data-weather`/`data-daypart` on `<html>`, renders the hero weather line, and dispatches `hk-weather`. `space-earth-bg.js` listens and drives cloud shell, day limb, lightning, and the HK marker. CSS/HTML refinements are independent of the weather layer.

**Tech Stack:** Vanilla HTML/CSS/JS, Three.js r128 (cdnjs), Open-Meteo API, Node 24 (`node --test`), headless Chrome for visual QA.

**Design doc:** `docs/plans/2026-09-03-redesign-weather-design.md`

---

## Conventions
- Commit after every task. Message: imperative, ≤ 60 chars, with the Co-Authored-By trailer.
- Cache-busting: every changed static asset gets a new `?v=20260903-…` query in both HTML files (final task).
- Screenshots go to the session scratchpad, never the repo.
- QA helper (Task 1) usage: `bash scripts/qa_shot.sh <page> <theme> <width> <weather|none> <day|none> <out.png>`.

---

### Task 1: QA harness (screenshot script)

**Files:** Create `scripts/qa_shot.sh`

Script: starts `python -m http.server 8765` in the repo root, runs headless Chrome
(`--headless=new --disable-gpu --hide-scrollbars --window-size=<W>,2400 --virtual-time-budget=8000 --screenshot=<out>`)
against `http://localhost:8765/<page>?theme=<t>&weather=<w>&day=<d>`, kills the server.
`theme=` query support is added to the inline theme bootstrap in Task 3 (QA only).

Verify: one PNG produced. Commit: `Add headless screenshot QA helper`.

---

### Task 2: `weather-core.js` pure logic (TDD)

**Files:** Create `weather-core.js`, `tests/weather-core.test.mjs`

Tests (`node --test tests/`):
- `classify({weather_code, cloud_cover, precipitation})`: 0/5/0 → clear; 2/55/0 → cloudy; 3/95/0 → overcast; 61/90/1.2 → rain; 95/100/4 → storm; 1/70/0 → cloudy (cloud cover wins).
- `describe(code)`: 0 "Clear", 3 "Overcast", 95 "Thunderstorm", 999 "—".
- `compass(deg)`: 0 "N", 112.5 "ESE", 359 "N".
- `formatLine(d, clock)`: `{27.6, code 2, 14.4 km/h, 110°}` + "21:14" → `Clear Water Bay · 28 °C · Partly cloudy · 4.0 m/s ESE · 21:14 HKT`.
- `hkClock(Date.UTC(2026,8,3,13,14))` → "21:14".
- `sunAzimuthDeg`: 04:00 UTC (noon HKT) → 180; 16:00 UTC → 0.

Rules: storm = code 95–99; rain = code 51–67 or 80–82 or precipitation > 0.1; overcast = code 3 or cover ≥ 85; cloudy = code 1–2, 45–48, or cover ≥ 30; else clear. Wind km/h → m/s (÷3.6, 1 decimal). Temp rounds to integer. Module is an IIFE exporting to `window.WeatherCore` and `module.exports`.

Commit: `Add weather-core pure logic with tests`.

---

### Task 3: `weather.js` fetch layer + hero line + QA overrides

**Files:** Create `weather.js`; modify `index.html`, `gallery.html`, `styles.css`.

1. URL overrides `weather=<category>`, `day=0|1` → synthetic payload, no network.
2. sessionStorage cache `hk-weather-v1` `{t,data}`, 15 min.
3. Fetch (AbortController 6 s): `https://api.open-meteo.com/v1/forecast?latitude=22.336&longitude=114.265&current=temperature_2m,cloud_cover,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day&timezone=Asia%2FHong_Kong`
4. On data: `html.dataset.weather`, `html.dataset.daypart`, `window.__HK_WEATHER__`, `CustomEvent("hk-weather")`, fill `#weather-line` (title = source + update time), unhide. Clock refresh 60 s; refetch 15 min when visible.
5. Errors → `console.debug`, nothing else changes.
6. Hero: `<div class="weather-slot"><p class="weather-line" id="weather-line" hidden></p></div>` after `.subtitle`; slot reserves height. Theme bootstrap honours `?theme=`.

Verify: `weather=storm` screenshot shows the line. Commit: `Add live HKUST weather line and data layer`.

---

### Task 4: Cloud shell driven by cloud cover and wind

**Files:** Modify `space-earth-bg.js`.

Sphere at `earthRadius*1.012`, ShaderMaterial, uniforms `{time, cover, rain, lightning, flashPos, drift, lightTheme}`; 3-octave value-noise fbm; `cloud = smoothstep(0.55-cover*0.35, 0.85, fbm)`; colour grey-blue → darker with rain; alpha `cloud*cover*(0.55+0.25*rain)`, faded where the shell faces away from camera; lightning adds `lightning*exp(-dist(pos,flashPos)*6)*1.6`. Drift toward `windDir+180°`, speed `0.004+windMs*0.0012`. All targets eased 0.02/frame. Light theme alpha ×0.5. Reads `window.__HK_WEATHER__` at init and listens to `hk-weather`.

Verify: clear / overcast / rain screenshots differ as expected. Commit: `Add wind-driven cloud shell to Earth scene`.

---

### Task 5: Day limb + city-light dimming

Atmosphere shader gains `sunDir`, `dayMix`; rim brightens blue-white toward `sunDir` by `dayMix*pow(max(dot(n,sunDir),0),2)`. City-lights shader gains `dim` → colour ×`mix(1,0.6,dim)`. `sunDir` recomputed every 60 s from `sunAzimuthDeg`.

Verify: `day=1` shows bright arc; `day=0` unchanged. Commit: `Add daytime limb glow and city-light dimming`.

---

### Task 6: Lightning

When category is storm: next flash in 4–12 s; `flashPos` random within the camera-facing hemisphere; `lightning`=1 then ×0.78 per frame until <0.01; 30 % double flash after 90 ms. No lightning under reduced motion.

Verify: storm screenshots (3 runs) catch a flash at least once; none in clear. Commit: `Add thunderstorm lightning flashes`.

---

### Task 7: Hong Kong marker

Convert lat 22.30°, lon 114.17° by inverting the texture sampler mapping (`u=0.5+atan2(z,x)/2π`, `v=0.5−asin(y)/π`); verify with a temporarily oversized red marker over the Pearl River Delta light cluster, then shrink. Marker = soft-sprite `#9fe3ff`, breathing scale 7–11, plus faint ring; in `earthGroup`; hidden when facing away.

Commit: `Add breathing Hong Kong marker on the globe`.

---

### Task 8: Light-theme weather tint

`html[data-theme="light"][data-weather=…] body` gradients: clear warm, cloudy neutral, overcast/rain cool grey, storm darker grey; `transition: background 800ms`. Dark untouched.

Commit: `Tint light theme by weather category`.

---

### Task 9: Homepage typography, spacing, publications

1. Spacing tokens `--s1…--s6`; panel padding 32/20 px; panel gap 24 px.
2. `h2::after` short accent rule.
3. About pills → one `.facts` line with accent dots.
4. Publications → `.pub` grid (year column + body) with DOI links, CrossRef-verified 2026-09-03:
   10.1029/2025JH001083 · 10.5194/acp-26-947-2026 · 10.1016/j.uclim.2024.102063 · 10.1016/j.uclim.2023.101499
5. Softer single shadows; no nested double shadow.

Commit: `Refine homepage typography, spacing, and publication list`.

---

### Task 10: Sticky header, sliding underline, mobile scroll nav

Sticky header + `.is-stuck` via sentinel IntersectionObserver (blur backdrop, translucent bg); `.site-nav a::after` scaleX underline; mobile nav `nowrap; overflow-x:auto` with fade mask; QA param `?stuck=1`.

Commit: `Make header sticky with blurred backdrop and sliding nav underline`.

---

### Task 11: Gallery flatten + display-title filter (TDD for the pure part)

Create `gallery-core.js` (`displayTitle(raw, group)`), `tests/gallery-core.test.mjs`. Hidden titles: after stripping the group prefix, matches `/^(dsc|img|dji|pxl|screenshot)[\s_-]?\d*/i` (+ "enhanced/nr/pano/digits" tails) or empty. Kept: "Austria Field Photo I" → "Field Photo I"; "PhD hooding ceremony" unchanged.

DOM: year `<section>` with `h2` + count, group `h3` + `time` + desc, borderless `.gallery-grid` of `figure` cards (12 px radius) with `figcaption` overlay on hover-capable devices, below image on touch. Panorama span kept. Lightbox kept.

Verify: tests pass, `python scripts/validate_gallery_meta.py` passes, screenshots. Commit: `Flatten gallery layout and hide file-name titles`.

---

### Task 12: Motion polish

Scroll reveal (IO threshold 0.12, once, in-view-at-load = immediate); panel link underline slide; portrait parallax ≤ 3° on `pointer: fine`; themed `::selection`; all gated by `prefers-reduced-motion`.

Commit: `Add scroll reveal, link underline, and portrait parallax`.

---

### Task 13: Final QA matrix, cache-busting, docs

1. Bump `?v=` to `20260903-wx1` for all changed/new assets in both HTML files.
2. Matrix: {index, gallery} × {dark, light} × {1400, 390}; index also × {clear, overcast, rain, storm}.
3. `node --test tests/` and `python scripts/validate_gallery_meta.py` pass.
4. README: list new files and QA params.
5. Commit: `Bump asset versions and document weather layer`.
6. Report with screenshots and rollback commands. Do **not** merge to `main` or push.
