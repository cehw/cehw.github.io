# cehw.github.io
Personal homepage and gallery.

## Runtime

- Entry pages: `index.html`, `gallery.html`
- Shared styles: `styles.css`
- Shared UI script: `script.js`
- Gallery renderer: `gallery.js`
- Cinematic background: `space-earth-bg.js` (reacts to live weather: daytime limb
  glow, city-light dimming, Hong Kong marker)
- Weather layer: `weather-core.js` (pure helpers, unit-tested) + `weather.js`
  (Open-Meteo fetch for HKUST, 15-min cache, sets `data-weather` / `data-daypart`
  on `<html>`, fills the hero weather line, dispatches `hk-weather`)
- Gallery title rules: `gallery-core.js` (pure helpers, unit-tested)

## QA

- Unit tests: `node --test tests/weather-core.test.mjs tests/gallery-core.test.mjs`
- Screenshot helper: `bash scripts/qa_shot.sh <page> <dark|light> <width> <weather|none> <day|none> <out.png>`
- URL parameters for previews (no effect on normal visitors):
  `?theme=dark|light`, `?weather=clear|cloudy|overcast|rain|storm`, `?day=0|1`,
  `?hour=0-23` (sun position),
  `?hkdebug=1` (large red marker, frozen globe), `?bgonly=1` (hide page chrome),
  `?stuck=1` (force the sticky header state)

## Analytics (single source of truth)

Analytics are configured only via:

- `assets/private-analytics-config.js`
- `private-analytics.js`

### Statcounter

Set these fields in `assets/private-analytics-config.js`:

- `enabled`
- `onlyOnDomains`
- `statcounter.project`
- `statcounter.security`
- Optional: `statcounter.invisible`, `statcounter.removeLink`

`private-analytics.js` loads Statcounter dynamically using that config.

### Optional webhook logging

Set `webhook.url` to your endpoint to receive a JSON payload with page, referrer, user agent, timezone, viewport, and optional IP.

- `webhook.includeIp`: include IP lookup result
- `webhook.delayMs`: delay before sending
- `oncePerSession`: dedupe by page path per browser session

## Gallery workflow

- Metadata file: `assets/gallery/meta.json`
- Build/update metadata: `python3 scripts/generate_gallery_meta.py`
- Build/update thumbnails: `python3 scripts/generate_gallery_thumbs.py`
- Validate metadata references: `python3 scripts/validate_gallery_meta.py`
