# cehw.github.io
Personal homepage and gallery.

## Runtime

- Entry pages: `index.html`, `gallery.html`
- Shared styles: `styles.css`
- Shared UI script: `script.js`
- Gallery renderer: `gallery.js`
- Cinematic background: `space-earth-bg.js`

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
