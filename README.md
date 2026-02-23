# cehw.github.io
My personal website

## Private visitor analytics (no public widget)

This site includes a private analytics loader:

- `/assets/private-analytics-config.js`
- `/private-analytics.js`

### Quick setup

1. Open `/assets/private-analytics-config.js`
2. Set `enabled: true`
3. Fill Statcounter keys:
   - `statcounter.project`
   - `statcounter.security`

This gives you private dashboard metrics (visits, paths, referrers, countries, devices).

### Optional: capture visitor IP to your own endpoint

Fill `webhook.url` with your webhook URL (for example a server endpoint, Pipedream, or Apps Script web app).
When enabled, the site posts a JSON payload including IP, page path, referrer, user agent, timezone, and viewport.

### Notes

- The tracker is invisible on the page (`invisible: 1`).
- It only runs on domains listed in `onlyOnDomains`.
- Set `oncePerSession: true` if you only want one record per page path per browser session.
- Current default is disabled to avoid accidental tracking.

## Education

-PhD, HKUST (2021-2025)
-BSc, HHU (2017-2021)


## Employment
