# Homepage refinement + live-weather background — design (2026-09-03)

Status: approved by owner 2026-09-03. Work happens on branch `redesign-weather`.
Rollback: `git checkout main`, or tag `backup-2026-09-03`, or
`../cehw.github.io_backup_20260903.tgz` (full snapshot without `.git`).

## Goal
Keep the existing look (dark orbital Earth scene, serif headings, one-page layout)
and (1) refine typography, spacing, header/nav, gallery, and motion; (2) make the
Earth scene respond to the live weather at HKUST (Clear Water Bay).

## Weather layer
- `weather.js` fetches Open-Meteo `current` for 22.336 N, 114.265 E:
  `temperature_2m, cloud_cover, precipitation, weather_code, wind_speed_10m,
  wind_direction_10m, is_day`. No API key. 6 s timeout. sessionStorage cache 15 min.
- On success: sets `data-weather` (clear|cloudy|overcast|rain|storm) and
  `data-daypart` (day|night) on `<html>`, stores `window.__HK_WEATHER__`, dispatches
  `hk-weather` CustomEvent. On failure: does nothing (page identical to today).
- `?weather=clear|cloudy|overcast|rain|storm[&day=0|1]` overrides for QA.
- Hero shows one small line: `Clear Water Bay · 28 °C · Cloudy · 4 m/s ESE · 21:14 HKT`.
  Height reserved; hidden until data arrives.

## Scene changes (`space-earth-bg.js`)
- Cloud shell: sphere at 1.012 R, fbm-noise shader; opacity from cloud cover,
  thicker/darker with precipitation; drift direction/speed from wind.
- Day limb: when HK is in daytime, atmosphere rim brightens blue-white on the sun
  side (sun azimuth from HK local hour); city lights dim slightly.
- Lightning: weather_code 95–99 → random flash every 4–12 s, ~120 ms.
- Hong Kong marker: small breathing point at HK lat/lon on the sphere.
- Stars, aurora, throttling unchanged. Mobile uses lower cloud-shader cost.
- Light theme: canvas stays at 8 % opacity; body gradient shifts slightly warm
  (clear) / cool-grey (overcast, rain) via `data-weather`.

## Homepage refinements
- 8 px spacing rhythm; h2 gets a short accent rule; fewer pill badges (About facts
  become one dotted line).
- Publications: year column left, journal in accent colour, DOI link per entry
  (DOIs verified via CrossRef before insertion).
- Panels: single border + light shadow; no panel-inside-panel double shadow.

## Header / nav
Sticky after scrolling past hero, blurred backdrop; sliding underline for the
active section; horizontal-scroll nav on mobile (no wrapping).

## Gallery
Flatten year→group→card nesting into year label + group heading + borderless image
grid. Hover overlay with title/date on desktop, caption below on mobile. File-name
titles (`DSC…`, `IMG…`, `DJI…`) are hidden; group + date shown instead. Lightbox kept.

## Motion
Scroll-triggered reveal (once, IntersectionObserver); link underline slide; portrait
micro-parallax ≤ 3° on pointer devices; themed `::selection`; all gated by
`prefers-reduced-motion`.

## Verification
Headless Chrome screenshots: {dark, light} × {desktop 1400, mobile 390} × weather
{clear, overcast, rain, storm}; console free of errors; `scripts/validate_gallery_meta.py`
passes.
