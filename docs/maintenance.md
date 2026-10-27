# Website maintenance

Start with [the documentation index](README.md). Commands below run from this repository; `scripts/manage.ps1` also resolves the project when invoked from another directory.

## Directory ownership

| Location | Purpose |
| --- | --- |
| `index.html`, `gallery.html`, `weather.html` | Public pages; keep URLs stable |
| Root CSS and JavaScript | Browser runtime and shared appearance |
| `assets/` | Current portrait, CV, icons, textures, analytics config and gallery |
| `data/` | Fallback weather snapshots; live data is on `weather-data` |
| `scripts/gallery/` | Metadata, thumbnails and validation |
| `scripts/weather/update-weather.mjs` | Official HKO updater used by GitHub Actions |
| `scripts/weather/gnn/` | Authoritative deployment sources for the climet3 runtime |
| `scripts/manage.ps1` | Windows maintenance entry point |
| `tests/` | JavaScript and Python behavior tests |
| `docs/` | Current instructions; frozen records under `archive/` |
| `_tmp/` | Ignored scratch output and previews |
| `_trash/YYYYMMDD-description/` | Recoverable retired files; never permanent cleanup deletion |

## Routine commands

```powershell
./scripts/manage.ps1 preview                 # http://127.0.0.1:8765; Ctrl+C to stop
./scripts/manage.ps1 preview -Port 8766
./scripts/manage.ps1 test
./scripts/manage.ps1 gallery-check
./scripts/manage.ps1 gallery-build
./scripts/manage.ps1 weather-fetch           # scratch snapshot: _tmp/weather.json
./scripts/manage.ps1 gnn-status              # read-only via ssh climet3
```

Requirements: Node.js 24+, Python 3, PowerShell for the entry point; Pillow for thumbnails. GNN inference uses its existing server environment. Underlying scripts can also run directly on Linux/macOS. Tests require no network and do not retrain the model.

For screenshots, use the connected browser preview and save to `_tmp/`. The machine-specific `qa_shot.sh` is retired to the local archive. Preview themes with `?theme=dark|light`. Without an explicit choice, the site follows the system theme; a manual choice is remembered. The background is static. Former animated-background parameters are no longer active.

## Gallery

`assets/gallery/meta.json` owns titles, descriptions and ordering. Originals live under `assets/gallery/`; generated images under `assets/gallery/thumbs/`.

Gallery media is present in this checkout. In a sparse checkout that excludes it, restore it before rebuilding with `git sparse-checkout add assets/gallery` (potentially a large download). Missing referenced originals stop generation before metadata or thumbnails are rewritten. Without macOS Spotlight, unknown dates stay unknown; existing dates are preserved.

`gallery-build` generates metadata and thumbnails, then validates references. Review metadata changes before publishing. Stale thumbnails move into `_trash/` with relative paths preserved. Image conversion requires Pillow and an available decoder for the input format.

## Publishing and rollback

Review `git status --short` and `git diff`, run `./scripts/manage.ps1 test` for script or browser logic changes, then stage intended paths and commit. This checkout uses `add-hong-kong-weather`; `git push origin HEAD:main` publishes the reviewed commit. Confirm the matching Pages run succeeds and inspect the changed page. Do not force-push; rollback uses a new revert commit.

Do not replace the `weather-data` branch with the website branch. Weather schedules and server operation are documented only in [weather.md](weather.md). Local source reorganization does not change `/workspace/wanghan/personal/weather/` or its cron entry. To deploy a deliberate GNN code change, copy the three files in `scripts/weather/gnn/` to that runtime directory with `scp` using `climet3`. Do not copy weights, observation archives, `publish/` or credentials. Keep `run.sh` in LF format and invoke it with Bash.

## Analytics

`assets/private-analytics-config.js` is the configuration authority; `private-analytics.js` reads it. Statcounter uses `enabled`, `onlyOnDomains`, `statcounter.project`, `statcounter.security`, and optional `invisible`/`removeLink`. Optional webhook logging uses `webhook.url`, `includeIp`, `delayMs` and `oncePerSession`. Do not duplicate configuration in HTML.

## Cleanup

Keep current production assets in `assets/`; see [illustration.md](illustration.md) for the portrait. Previous portraits and completed weather/UI scratch work moved to `_trash/20261027-management/`; Git retains formerly tracked versions. The server's `archives/`, `output/`, `logs/` and `publish/` are operational data, not cleanup targets.
